-- Pay before the request goes through (owner, 27 Oct 2026). A 100% / 50% upfront shoot is held as
-- "Awaiting payment" (a draft only the booker sees) until it is paid (card, or marked paid) or a bank
-- receipt is uploaded; only then is it Requested and Milkywayy emailed. Unpaid drafts expire after
-- 7 days (invoice voided); the booker can discard one at once. Additive: one new status, new
-- functions and a trigger; portal_admin_projects only gains a filter.

alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check (
  (type = 'shoot' and status in ('awaiting_payment', 'requested', 'confirmed', 'shot', 'editing', 'delivered',
    'completed', 'cancelled'))
  or (type = 'edit' and status in ('submitted', 'files_received', 'in_editing', 'on_hold', 'delivered', 'completed',
    'cancelled'))
  or (type = 'avatar' and status in ('brief_received', 'script_ready', 'in_production', 'on_hold', 'delivered',
    'completed', 'cancelled')));

-- Right after the booking invoice is issued: a prepay / split shoot waits for payment.
create or replace function public.portal_admin_hold_booking(p_secret text, p_actor text, p_project uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null or p.type <> 'shoot' or p.status <> 'requested'
     or private.booking_terms(p.account_id) not in ('prepay', 'split')
     or not exists (select 1 from public.invoices i where i.project_id = p.id and i.stage in ('full', 'deposit')
       and i.status in ('due', 'overdue')) then
    return false;
  end if;
  update public.projects set status = 'awaiting_payment',
    meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('awaiting_since', now())
    where id = p.id;
  update public.project_events set to_status = 'awaiting_payment' where project_id = p.id and kind = 'created';
  return true;
end $$;

-- Awaiting payment → Requested (paid, receipt uploaded, or sent to the company to pay).
create or replace function private.release_booking(p_project uuid, p_why text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set status = 'requested',
    meta = (coalesce(meta, '{}'::jsonb) - 'awaiting_since') || jsonb_build_object('released_at', now())
    where id = p_project and status = 'awaiting_payment';
  if not found then return false; end if;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
    values (p_project, 'status', 'awaiting_payment', 'requested', left(p_why, 1000), 'Milkywayy', true);
  return true;
end $$;

-- Paid, or a bank receipt uploaded, on the deposit / full invoice: the request goes through. Named to
-- run before invoices_paid_confirms, which then adds its "paid, waiting to confirm" note.
create or replace function private.invoice_releases_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is null or new.stage is null or new.stage not in ('full', 'deposit') then return new; end if;
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform private.release_booking(new.project_id, 'Paid (' || coalesce(new.number, 'invoice') || '). Request sent.');
  elsif new.payment_state = 'submitted' and old.payment_state is distinct from 'submitted'
      and new.status in ('due', 'overdue') then
    perform private.release_booking(new.project_id,
      'Bank transfer receipt uploaded (' || coalesce(new.number, 'invoice') || '), payment to verify. Request sent.');
  end if;
  return new;
end $$;

drop trigger if exists invoices_aa_release_booking on public.invoices;
create trigger invoices_aa_release_booking after update of status, payment_state on public.invoices
  for each row execute function private.invoice_releases_booking();

-- A teammate sends the payment to the company: the request goes through as before.
create or replace function public.portal_admin_release_booking(p_secret text, p_actor text, p_project uuid,
  p_why text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return private.release_booking(p_project, coalesce(nullif(btrim(p_why), ''), 'Request sent.'));
end $$;

-- "New booking request" goes once, after release: true the first time only.
create or replace function public.portal_admin_claim_request_email(p_secret text, p_actor text, p_project uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('request_emailed_at', now())
    where id = p_project and type = 'shoot' and status = 'requested'
      and meta ? 'released_at' and not meta ? 'request_emailed_at';
  return found;
end $$;

-- Drop an unpaid draft: void its deposit / full invoice and cancel it (hidden from lists).
create or replace function private.drop_booking_draft(p_project uuid, p_why text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set status = 'cancelled',
    meta = (coalesce(meta, '{}'::jsonb) - 'awaiting_since') || jsonb_build_object('discarded', true,
      'discarded_at', now())
    where id = p_project and status = 'awaiting_payment';
  if not found then return false; end if;
  update public.invoices set status = 'void'
    where project_id = p_project and stage in ('full', 'deposit') and status in ('due', 'overdue');
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
    values (p_project, 'status', 'awaiting_payment', 'cancelled', left(p_why, 1000), 'Milkywayy', true);
  return true;
end $$;

-- The booker discards their own draft.
create or replace function public.discard_booking_draft(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or auth.uid() is null or coalesce(p.requested_by, p.created_by) is distinct from auth.uid() then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if p.status <> 'awaiting_payment' then
    raise exception 'only an unpaid draft can be discarded' using errcode = '22023';
  end if;
  perform private.drop_booking_draft(p.id, 'Draft discarded by the client');
  return jsonb_build_object('id', p.id, 'ref', p.ref);
end $$;

-- Daily: drafts still unpaid after 7 days expire.
create or replace function public.portal_admin_expire_booking_drafts(p_secret text, p_actor text) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select id from public.projects
    where status = 'awaiting_payment'
      and coalesce((meta ->> 'awaiting_since')::timestamptz, created_at) < now() - interval '7 days'
  loop
    if private.drop_booking_draft(r.id, 'Draft expired: not paid within 7 days') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Admin lists (queue, calendar, feed): no drafts, no discarded drafts.
create or replace function public.portal_admin_projects(
  p_secret text, p_actor text, p_type text default null, p_status text default null,
  p_q text default null, p_account uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  perform private.sync_booking_projects(null);
  perform private.link_claimed_projects();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.sort_at desc)
    from (
      select p.id, p.ref, p.type, p.title, p.status, p.status_note, p.shoot_date, p.slot, p.meta,
        p.due_at, p.revision_state, p.revision_rounds_used, p.revision_rounds_allowed, p.created_at,
        p.delivered_at, p.completed_at, p.account_id, a.name as account_name,
        coalesce(l.name, cp.full_name, a.name) as client_name,
        coalesce(nullif(l.phone, ''), cp.phone_e164, '') as lead_phone,
        (select s.status from public.project_scripts s where s.project_id = p.id order by s.version desc limit 1) as script_status,
        (select count(*) from public.project_files f where f.project_id = p.id and f.direction = 'in' and f.deleted_at is null) as files_in,
        coalesce(p.updated_at, p.created_at) as sort_at
      from public.projects p
      left join public.accounts a on a.id = p.account_id
      left join public.leads l on l.id = p.lead_id
      left join public.profiles cp on cp.user_id = p.created_by
      where (p_type is null or p.type = p_type)
        and (p_status is null or p.status = p_status)
        and (p_account is null or p.account_id = p_account)
        and p.status <> 'awaiting_payment'
        and not (p.status = 'cancelled' and coalesce((p.meta ->> 'discarded')::boolean, false))
        and (v_q is null or lower(p.ref) like '%' || v_q || '%' or lower(p.title) like '%' || v_q || '%'
          or lower(coalesce(a.name, '')) like '%' || v_q || '%' or lower(coalesce(l.name, '')) like '%' || v_q || '%')
      limit 500
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function private.release_booking(uuid, text), private.invoice_releases_booking(),
  private.drop_booking_draft(uuid, text) from public, anon, authenticated;
revoke all on function public.portal_admin_hold_booking(text, text, uuid),
  public.portal_admin_release_booking(text, text, uuid, text),
  public.portal_admin_claim_request_email(text, text, uuid),
  public.portal_admin_expire_booking_drafts(text, text) from public;
grant execute on function public.portal_admin_hold_booking(text, text, uuid),
  public.portal_admin_release_booking(text, text, uuid, text),
  public.portal_admin_claim_request_email(text, text, uuid),
  public.portal_admin_expire_booking_drafts(text, text) to anon, authenticated;
revoke all on function public.discard_booking_draft(uuid) from public, anon;
grant execute on function public.discard_booking_draft(uuid) to authenticated;
