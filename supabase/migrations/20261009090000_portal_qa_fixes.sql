-- Client portal: fixes from the owner's QA of Phases 10–11 (3 Oct 2026).
-- * The admin can create a project for a client (bookings that came in by WhatsApp or phone) and
--   attach a website booking to a client account by its ref.
-- * People can keep an optional WhatsApp number on their profile (contact only: it never signs
--   anyone in or claims bookings; that stays the verified sign-in phone), and the admin can set it.
-- * Photo deliveries can carry a small preview (thumbnail) next to the original in R2.
-- Additive.

alter table public.lead_claims drop constraint lead_claims_via_check;
alter table public.lead_claims add constraint lead_claims_via_check
  check (via in ('email', 'phone', 'signed-in', 'admin'));

alter table public.project_files add column thumb_key text check (length(thumb_key) <= 520);

-- ---------- a WhatsApp number to reach you on (optional) ----------
create or replace function public.set_my_whatsapp(p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'that number doesn''t look right' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, email, phone_e164)
    values (auth.uid(), (select email from auth.users where id = auth.uid()), v_phone)
  on conflict (user_id) do update set phone_e164 = excluded.phone_e164;
end $$;
revoke all on function public.set_my_whatsapp(text) from public, anon;
grant execute on function public.set_my_whatsapp(text) to authenticated;

create or replace function public.portal_admin_set_member_phone(
  p_secret text, p_actor text, p_account uuid, p_user uuid, p_phone text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if not exists (select 1 from public.account_members where account_id = p_account and user_id = p_user) then
    raise exception 'not a member of that account' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'that number doesn''t look right' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, email, phone_e164)
    values (p_user, (select email from auth.users where id = p_user), v_phone)
  on conflict (user_id) do update set phone_e164 = excluded.phone_e164;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'WhatsApp number ' || case when v_phone is null then 'removed' else 'set' end);
end $$;

-- ---------- the admin attaches a website booking to a client ----------
-- Also moves one that was attached to the wrong client.
create or replace function public.portal_admin_attach_lead(p_secret text, p_actor text, p_ref text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lead uuid; v_type text; v_n int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select id, type into v_lead, v_type from public.leads where ref = upper(btrim(p_ref));
  if v_lead is null then
    raise exception 'no booking with that ref' using errcode = '22023';
  end if;
  if v_type <> 'property' or not exists (select 1 from public.booking_properties where lead_id = v_lead) then
    raise exception 'only property bookings become projects' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'no such client' using errcode = '22023';
  end if;
  insert into public.lead_claims (lead_id, account_id, claimed_by, via)
    values (v_lead, p_account, null, 'admin')
  on conflict (lead_id) do update set account_id = excluded.account_id, via = 'admin', claimed_at = now();
  perform private.sync_booking_projects(v_lead);
  perform private.link_claimed_projects();
  select count(*) into v_n from public.projects where lead_id = v_lead;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Booking ' || upper(btrim(p_ref)) || ' attached');
  return jsonb_build_object('ref', upper(btrim(p_ref)), 'projects', v_n,
    'ids', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.projects where lead_id = v_lead));
end $$;

-- ---------- the admin creates a project for a client ----------
-- Shoots start as Requested (confirm them to send the date by email); batches as Submitted;
-- avatar videos as Brief received. Same ref sequence as website bookings.
create or replace function public.portal_admin_create_project(
  p_secret text, p_actor text, p_account uuid, p_type text, p_title text,
  p_kind text default null, p_quantity int default null, p_notes text default null,
  p_due date default null, p_shoot_date date default null, p_slot text default null,
  p_area text default null, p_building text default null, p_unit text default null,
  p_services text[] default '{}', p_price numeric default null, p_script_by text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text; v_status text; v_currency text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select currency into v_currency from public.accounts where id = p_account;
  if v_currency is null then
    raise exception 'no such client' using errcode = '22023';
  end if;
  if p_type not in ('shoot', 'edit', 'avatar') then
    raise exception 'unknown project type' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'give it a title' using errcode = '22023';
  end if;
  if (p_type = 'edit' and coalesce(p_kind, '') not in ('hdr_photos', 'short_form', 'long_form', 'avatar_edit', 'other'))
    or (p_type = 'avatar' and coalesce(p_kind, '') not in ('30s', '60s', '90s', 'longer')) then
    raise exception 'choose what it is' using errcode = '22023';
  end if;
  if p_type = 'shoot' and (coalesce(btrim(p_building), '') = '' or coalesce(btrim(p_area), '') = '') then
    raise exception 'add the building and area' using errcode = '22023';
  end if;
  if p_type = 'shoot' and exists (select 1 from unnest(coalesce(p_services, '{}')) s where s not in ('photo', 'short', 'long', 'tour')) then
    raise exception 'unknown service' using errcode = '22023';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'price out of range' using errcode = '22023';
  end if;
  v_status := case p_type when 'shoot' then 'requested' when 'edit' then 'submitted' else 'brief_received' end;
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, meta, due_at, shoot_date, slot)
  values (p_account, p_type, v_ref, btrim(p_title), v_status,
    jsonb_strip_nulls(case when p_type = 'shoot' then jsonb_build_object(
        'area', nullif(btrim(coalesce(p_area, '')), ''), 'building', nullif(btrim(coalesce(p_building, '')), ''),
        'unit', nullif(btrim(coalesce(p_unit, '')), ''), 'services', to_jsonb(coalesce(p_services, '{}')),
        'notes', nullif(btrim(coalesce(p_notes, '')), ''))
      else jsonb_build_object('kind', p_kind, 'quantity', p_quantity,
        'notes', nullif(btrim(coalesce(p_notes, '')), ''), 'references', '[]'::jsonb,
        'script_by', case when p_type = 'avatar' then coalesce(p_script_by, 'milkywayy') end) end),
    case when p_due is not null then (p_due + time '18:00') at time zone 'Asia/Dubai' end,
    p_shoot_date, nullif(btrim(coalesce(p_slot, '')), ''))
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name, by_admin)
    values (v_id, 'created', v_status, 'Milkywayy', true);
  if p_price is not null and p_price > 0 then
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency)
      values (v_id, p_account, case p_type when 'shoot' then 'Shoot' when 'edit' then 'Editing' else 'Avatar video' end
        || ' (agreed price)', 1, p_price, v_currency);
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', p_account, v_ref || ': ' || p_type || ' project created');
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ---------- photo previews ----------
-- The admin's browser makes a small WebP next to an uploaded photo: <key>.thumb.webp.
create or replace function public.portal_admin_set_thumb(p_secret text, p_actor text, p_file uuid, p_thumb_key text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.project_files set thumb_key = p_thumb_key
    where id = p_file and r2_key is not null and p_thumb_key = r2_key || '.thumb.webp';
end $$;

revoke all on function public.portal_admin_set_member_phone(text, text, uuid, uuid, text),
  public.portal_admin_attach_lead(text, text, text, uuid),
  public.portal_admin_create_project(text, text, uuid, text, text, text, int, text, date, date, text, text, text, text, text[], numeric, text),
  public.portal_admin_set_thumb(text, text, uuid, text) from public;
grant execute on function public.portal_admin_set_member_phone(text, text, uuid, uuid, text),
  public.portal_admin_attach_lead(text, text, text, uuid),
  public.portal_admin_create_project(text, text, uuid, text, text, text, int, text, date, date, text, text, text, text, text[], numeric, text),
  public.portal_admin_set_thumb(text, text, uuid, text) to anon, authenticated;
