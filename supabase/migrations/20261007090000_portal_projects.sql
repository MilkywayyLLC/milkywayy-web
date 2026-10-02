-- Client portal, Phase 10 (CLIENT_PORTAL_GUIDE §4, §7.2, §8, §9): the project engine and
-- property shoots.
--
-- One engine for every service: a project has a type (shoot now; edit and avatar in Phase 11),
-- a status on that type's pipeline, an activity timeline, files in and out (grouped by delivery,
-- so earlier versions stay downloadable), a message thread and line items. Website bookings become
-- "Requested" shoot projects, one per property, linked to the lead and its ref; they join the
-- client's account when the booking is claimed (§3.5).
--
-- Rules, in the database:
-- * Clients see their account's projects under the same visibility rules as bookings (Owner and
--   Admins all; Members their own, or all if the account allows). Prices (line items) never reach
--   Members.
-- * Clients only post messages, ask for a revision (within the included rounds) and approve, all
--   through checked functions; every status change and delivery is Milkywayy's, through the
--   portal_admin_* functions (PORTAL_ADMIN_SECRET + who acted, logged).
-- * Files we host sit in a private R2 bucket; the server signs short-lived download links after
--   the client can read the file row here. Delivered files are kept for the account's retention
--   (12 months by default, extendable per client); raw uploads 30 days after completion.
-- Additive: new tables and functions; claim_my_bookings() also links the projects now.

-- ---------- retention per client ----------
alter table public.accounts add column retention_months int not null default 12
  check (retention_months between 1 and 120);
-- (No client grant: only the admin changes it.)

-- ---------- tables ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete cascade,
  type text not null check (type in ('shoot', 'edit', 'avatar')),
  ref text not null unique,
  lead_id uuid references public.leads (id) on delete set null,
  lead_line int,
  title text not null check (length(btrim(title)) between 1 and 160),
  status text not null,
  status_note text check (length(status_note) <= 500),
  meta jsonb not null default '{}',
  shoot_date date,
  slot text,
  created_by uuid references auth.users (id) on delete set null,
  requested_by uuid references auth.users (id) on delete set null,
  assigned_member_ids uuid[] not null default '{}',
  due_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  revision_rounds_allowed int not null default 2 check (revision_rounds_allowed between 0 and 20),
  revision_rounds_used int not null default 0 check (revision_rounds_used >= 0),
  revision_state text check (revision_state in ('requested', 'in_progress', 'delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, lead_line),
  check (
    (type = 'shoot' and status in ('requested', 'confirmed', 'shot', 'editing', 'delivered', 'completed'))
    or (type = 'edit' and status in ('submitted', 'files_received', 'in_editing', 'on_hold', 'delivered', 'completed'))
    or (type = 'avatar' and status in ('brief_received', 'script_ready', 'in_production', 'delivered', 'completed'))
  )
);
create index projects_account_idx on public.projects (account_id, created_at desc);
create index projects_status_idx on public.projects (type, status);
create index projects_created_by_idx on public.projects (created_by);
create index projects_requested_by_idx on public.projects (requested_by);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'delivery', 'revision_requested',
    'revision_in_progress', 'revision_delivered', 'approved', 'auto_completed', 'note')),
  from_status text,
  to_status text,
  note text check (length(note) <= 1000),
  actor_name text,
  by_admin boolean not null default false,
  notified boolean not null default false,
  at timestamptz not null default now()
);
create index project_events_project_idx on public.project_events (project_id, at desc);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  delivery_no int,
  delivery_label text check (length(delivery_label) <= 60),
  kind text not null check (kind in ('photos', 'reel', 'long_form', 'tour', 'zip', 'other')),
  source text not null check (source in ('link', 'r2')),
  url text check (url ~ '^https://' and length(url) <= 2000),
  r2_key text check (length(r2_key) <= 500),
  label text not null check (length(btrim(label)) between 1 and 160),
  bytes bigint check (bytes >= 0),
  content_type text check (length(content_type) <= 120),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  check ((source = 'link' and url is not null) or (source = 'r2' and r2_key is not null))
);
create index project_files_project_idx on public.project_files (project_id, delivery_no);
create index project_files_expiry_idx on public.project_files (expires_at) where deleted_at is null;

create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  is_admin boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 4000),
  at timestamptz not null default now()
);
create index project_messages_project_idx on public.project_messages (project_id, at);
create index project_messages_author_idx on public.project_messages (author_id);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 200),
  qty numeric(10, 2) not null default 1 check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  currency text not null default 'AED' check (currency in ('AED', 'USD')),
  delivered_month date,
  billed_invoice_id uuid,
  created_at timestamptz not null default now()
);
create index line_items_project_idx on public.line_items (project_id);
create index line_items_account_idx on public.line_items (account_id, delivered_month);

create table public.notification_log (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp')),
  template text not null,
  to_address text,
  provider_id text,
  status text not null check (status in ('sent', 'skipped', 'failed', 'opened')),
  error text,
  actor text,
  at timestamptz not null default now()
);
create index notification_log_project_idx on public.notification_log (project_id, at desc);
create index notification_log_account_idx on public.notification_log (account_id, at desc);

create table private.project_notes (
  project_id uuid primary key references public.projects (id) on delete cascade,
  notes text not null default '' check (length(notes) <= 8000),
  updated_by text,
  updated_at timestamptz not null default now()
);
revoke all on private.project_notes from public, anon, authenticated;

-- ---------- privileges and row level security ----------
revoke all on public.projects, public.project_events, public.project_files, public.project_messages,
  public.line_items, public.notification_log from anon, authenticated;
grant select on public.projects, public.project_events, public.project_files, public.project_messages,
  public.line_items to authenticated;

alter table public.projects enable row level security;
alter table public.project_events enable row level security;
alter table public.project_files enable row level security;
alter table public.project_messages enable row level security;
alter table public.line_items enable row level security;
alter table public.notification_log enable row level security;

-- Same visibility as bookings: Owner/Admins all, open accounts all, else your own. One helper,
-- used by the policy and by every client function, so the rule lives in one place.
create or replace function private.sees_project(p_account uuid, p_created uuid, p_requested uuid, p_assigned uuid[])
returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: a website booking has no creator, and NULL here must mean "no", never "unknown"
  -- (callers write `not private.sees_project(...)`).
  select coalesce(p_account is not null and (
    p_account in (select private.my_admin_account_ids())
    or p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids())
      and (auth.uid() = p_created or auth.uid() = p_requested or auth.uid() = any (p_assigned)))), false)
$$;
revoke all on function private.sees_project(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function private.sees_project(uuid, uuid, uuid, uuid[]) to authenticated;

create policy "members read their projects" on public.projects
  for select to authenticated
  using ((select private.sees_project(account_id, created_by, requested_by, assigned_member_ids)));
-- Events, messages and published files follow their project (the subquery runs under RLS).
create policy "read events of visible projects" on public.project_events
  for select to authenticated using (project_id in (select id from public.projects));
create policy "read messages of visible projects" on public.project_messages
  for select to authenticated using (project_id in (select id from public.projects));
create policy "read files of visible projects" on public.project_files
  for select to authenticated
  using (deleted_at is null and (direction = 'in' or published) and project_id in (select id from public.projects));
-- Prices: Owner and Admins only.
create policy "admins read line items" on public.line_items
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));
-- notification_log: no client access at all.

-- Live updates (§4.3): clients subscribe to their own projects; RLS filters the stream.
alter publication supabase_realtime add table public.projects, public.project_events,
  public.project_messages, public.project_files;

-- ---------- website bookings → shoot projects ----------
-- One project per property line, ref = the booking's ref (…-1, -2 when there are several).
-- Idempotent: only bookings without projects yet. p_lead limits it to one booking.
create or replace function private.sync_booking_projects(p_lead uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with lines as (
    select l.id as lead_id, l.ref, l.created_at, b.line_no, b.property_type, b.size_label, b.services,
      b.long_lighting, b.add_ons, b.area, b.building, b.unit, b.shoot_date, b.slot,
      c.account_id, c.claimed_by, count(*) over (partition by l.id) as n_lines
    from public.leads l
    join public.booking_properties b on b.lead_id = l.id
    left join public.lead_claims c on c.lead_id = l.id
    where l.type = 'property' and (p_lead is null or l.id = p_lead)
      and not exists (select 1 from public.projects p where p.lead_id = l.id and p.lead_line = b.line_no)
  ), made as (
    insert into public.projects (account_id, type, ref, lead_id, lead_line, title, status, meta,
      shoot_date, slot, requested_by, created_at)
    select account_id, 'shoot',
      case when n_lines > 1 then ref || '-' || line_no else ref end,
      lead_id, line_no,
      size_label || ' ' || property_type || ', ' || building,
      'requested',
      jsonb_strip_nulls(jsonb_build_object('area', area, 'building', building, 'unit', unit,
        'property_type', property_type, 'size', size_label, 'services', services,
        'lighting', long_lighting, 'add_ons', add_ons)),
      shoot_date, slot, claimed_by, created_at
    from lines
    on conflict do nothing
    returning id, lead_id, lead_line, account_id
  ), events as (
    insert into public.project_events (project_id, kind, to_status, actor_name, at)
    select m.id, 'created', 'requested', 'Website booking', now() from made m
  ), prices as (
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency)
    select m.id, m.account_id, 'Shoot (estimate at booking)', 1, b.subtotal, 'AED'
    from made m join public.booking_properties b on b.lead_id = m.lead_id and b.line_no = m.lead_line
  )
  select count(*) into v_n from made;
  return v_n;
end $$;
revoke all on function private.sync_booking_projects(uuid) from public, anon, authenticated;

-- Claimed bookings: their projects (made now if needed) join the account.
create or replace function private.link_claimed_projects() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects p set account_id = c.account_id, requested_by = coalesce(p.requested_by, c.claimed_by)
  from public.lead_claims c
  where p.lead_id = c.lead_id and p.account_id is distinct from c.account_id;
  update public.line_items li set account_id = p.account_id
  from public.projects p
  where li.project_id = p.id and li.account_id is distinct from p.account_id;
end $$;
revoke all on function private.link_claimed_projects() from public, anon, authenticated;

-- claim_my_bookings(): as before (email and phone), plus the projects follow the claim.
create or replace function public.claim_my_bookings(p_account uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_phone text := private.my_verified_phone();
  v_account uuid := p_account;
  v_refs text[];
  v_pending int;
  v_lead uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_email is null and v_phone is null then
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', 0);
  end if;
  if v_account is not null and private.account_role(v_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if v_account is null then
    select m.account_id into v_account from public.account_members m
    where m.user_id = v_uid
    order by (m.role = 'owner') desc, m.created_at
    limit 1;
  end if;

  if v_account is null then
    select count(*) into v_pending from public.leads l
    where ((v_email is not null and l.email = v_email) or (v_phone is not null and l.phone = v_phone))
      and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
      and not exists (select 1 from public.lead_claims c where c.lead_id = l.id);
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', v_pending);
  end if;

  with claimed as (
    insert into public.lead_claims (lead_id, account_id, claimed_by, via)
    select l.id, v_account, v_uid,
      case when v_email is not null and l.email = v_email then 'email' else 'phone' end
    from public.leads l
    where ((v_email is not null and l.email = v_email) or (v_phone is not null and l.phone = v_phone))
      and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
    on conflict (lead_id) do nothing
    returning lead_id
  )
  select coalesce(array_agg(l.ref order by l.created_at), '{}') into v_refs
  from claimed c join public.leads l on l.id = c.lead_id;

  if array_length(v_refs, 1) > 0 then
    for v_lead in select l.id from public.leads l where l.ref = any (v_refs) loop
      perform private.sync_booking_projects(v_lead);
    end loop;
    perform private.link_claimed_projects();
  end if;

  return jsonb_build_object('claimed', to_jsonb(v_refs), 'pending', 0, 'account', v_account);
end $$;
revoke all on function public.claim_my_bookings(uuid) from public, anon;
grant execute on function public.claim_my_bookings(uuid) to authenticated;

-- ---------- what clients can do ----------
create or replace function private.my_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.full_name, p.email, u.email, 'Client')
  from auth.users u left join public.profiles p on p.user_id = u.id
  where u.id = auth.uid()
$$;
revoke all on function private.my_name() from public, anon;
grant execute on function private.my_name() to authenticated;

-- A message on a project they can see.
create or replace function public.post_project_message(p_project uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.projects p where p.id = p_project
      and private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids)) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  insert into public.project_messages (project_id, author_id, author_name, is_admin, body)
    values (p_project, auth.uid(), private.my_name(), false, btrim(p_body))
    returning id into v_id;
  return v_id;
end $$;

-- Ask for a revision on a delivered project, within the included rounds.
create or replace function public.request_revision(p_project uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.status <> 'delivered' then
    raise exception 'revisions are for delivered projects' using errcode = '22023';
  end if;
  if p.revision_state in ('requested', 'in_progress') then
    raise exception 'a revision is already under way' using errcode = '22023';
  end if;
  if p.revision_rounds_used >= p.revision_rounds_allowed then
    raise exception 'no revision rounds left' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'say what should change' using errcode = '22023';
  end if;
  update public.projects set revision_state = 'requested', revision_rounds_used = revision_rounds_used + 1
    where id = p_project;
  insert into public.project_events (project_id, kind, note, actor_name)
    values (p_project, 'revision_requested', left(btrim(p_note), 1000), private.my_name());
  insert into public.project_messages (project_id, author_id, author_name, body)
    values (p_project, auth.uid(), private.my_name(), 'Revision request: ' || btrim(p_note));
  return jsonb_build_object('round', p.revision_rounds_used + 1, 'of', p.revision_rounds_allowed);
end $$;

-- Approve a delivery: the project is completed (files kept for the account's retention).
create or replace function public.approve_project(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.status <> 'delivered' or p.revision_state in ('requested', 'in_progress') then
    raise exception 'nothing to approve right now' using errcode = '22023';
  end if;
  perform private.complete_project(p_project, private.my_name(), 'approved');
end $$;

-- Completing sets the retention clock: delivered files for the account's months, raw files 30 days.
create or replace function private.complete_project(p_project uuid, p_actor text, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_months int;
begin
  select coalesce(a.retention_months, 12) into v_months
  from public.projects p left join public.accounts a on a.id = p.account_id where p.id = p_project;
  update public.projects set status = 'completed', completed_at = now() where id = p_project;
  update public.project_files set expires_at = case
      when direction = 'out' then now() + make_interval(months => coalesce(v_months, 12))
      else now() + interval '30 days' end
    where project_id = p_project and deleted_at is null and source = 'r2';
  insert into public.project_events (project_id, kind, from_status, to_status, actor_name)
    values (p_project, p_kind, 'delivered', 'completed', p_actor);
end $$;
revoke all on function private.complete_project(uuid, text, text) from public, anon, authenticated;

revoke all on function public.post_project_message(uuid, text), public.request_revision(uuid, text),
  public.approve_project(uuid) from public, anon;
grant execute on function public.post_project_message(uuid, text), public.request_revision(uuid, text),
  public.approve_project(uuid) to authenticated;

-- ---------- the admin (gated by PORTAL_ADMIN_SECRET, every change logged) ----------
-- Who gets an email for an event: members who want it (their prefs; Members only for projects
-- they can see), plus the account's extra recipients for that category.
create or replace function private.event_recipients(p_project uuid, p_event text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cat text := case when p_event = 'invoice_issued' then 'billing' else 'projects' end;
  v jsonb;
begin
  with p as (select * from public.projects where id = p_project),
  a as (select acc.* from public.accounts acc join p on acc.id = p.account_id),
  people as (
    select distinct lower(coalesce(pr.email, u.email)) as email, coalesce(pr.full_name, '') as name
    from p
    join public.account_members m on m.account_id = p.account_id
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.user_id = m.user_id
    where coalesce(pr.email, u.email) is not null
      and coalesce((pr.notification_prefs -> p_event ->> 'email')::boolean,
        p_event not in ('shoot_done')) -- the defaults: everything on except "shoot done"
      and (v_cat <> 'billing' or m.role in ('owner', 'admin'))
      and (m.role in ('owner', 'admin') or (select member_visibility from a) = 'all'
        or m.user_id in (p.created_by, p.requested_by) or m.user_id = any (p.assigned_member_ids))
  ),
  extra as (
    select lower(x) as email, '' as name
    from a, jsonb_array_elements_text(coalesce(a.notify_cc -> v_cat, '[]'::jsonb)) x
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', email, 'name', name)), '[]'::jsonb)
  into v from (select * from people union select * from extra) r;
  return v;
end $$;
revoke all on function private.event_recipients(uuid, text) from public, anon, authenticated;

-- The board/list: bookings become projects first, so nothing is missed.
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
        p.revision_state, p.revision_rounds_used, p.revision_rounds_allowed, p.created_at,
        p.delivered_at, p.completed_at, p.account_id, a.name as account_name,
        coalesce(l.name, a.name) as client_name, coalesce(l.phone, '') as lead_phone,
        coalesce(p.updated_at, p.created_at) as sort_at
      from public.projects p
      left join public.accounts a on a.id = p.account_id
      left join public.leads l on l.id = p.lead_id
      where (p_type is null or p.type = p_type)
        and (p_status is null or p.status = p_status)
        and (p_account is null or p.account_id = p_account)
        and (v_q is null or lower(p.ref) like '%' || v_q || '%' or lower(p.title) like '%' || v_q || '%'
          or lower(coalesce(a.name, '')) like '%' || v_q || '%' or lower(coalesce(l.name, '')) like '%' || v_q || '%')
      limit 500
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_project(p_secret text, p_actor text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if not exists (select 1 from public.projects where id = p_id) then
    return null;
  end if;
  select jsonb_build_object(
    'project', (select to_jsonb(p) from public.projects p where p.id = p_id),
    'account', (select jsonb_build_object('id', a.id, 'name', a.name, 'currency', a.currency,
        'retention_months', a.retention_months) from public.projects p join public.accounts a on a.id = p.account_id where p.id = p_id),
    'lead', (select jsonb_build_object('ref', l.ref, 'name', l.name, 'phone', l.phone, 'email', l.email)
        from public.projects p join public.leads l on l.id = p.lead_id where p.id = p_id),
    'owner', (select jsonb_build_object('name', pr.full_name, 'email', coalesce(pr.email, u.email),
        'phone', coalesce(pr.phone_e164, case when coalesce(u.phone, '') <> '' then '+' || u.phone end))
        from public.projects p join public.account_members m on m.account_id = p.account_id and m.role = 'owner'
        join auth.users u on u.id = m.user_id left join public.profiles pr on pr.user_id = m.user_id
        where p.id = p_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at desc) from public.project_events e where e.project_id = p_id), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(to_jsonb(f) order by f.delivery_no nulls first, f.created_at) from public.project_files f
        where f.project_id = p_id and f.deleted_at is null), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.at) from public.project_messages m where m.project_id = p_id), '[]'::jsonb),
    'line_items', coalesce((select jsonb_agg(to_jsonb(li) order by li.created_at) from public.line_items li where li.project_id = p_id), '[]'::jsonb),
    'notes', (select n.notes from private.project_notes n where n.project_id = p_id),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.at desc) from
        (select * from public.notification_log where project_id = p_id order by at desc limit 30) n), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Move a project along its pipeline. Returns who should get an email (the server sends it).
create or replace function public.portal_admin_set_status(
  p_secret text, p_actor text, p_id uuid, p_status text, p_note text default null,
  p_date date default null, p_slot text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_event text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id for update;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if p_status = 'completed' then
    perform private.complete_project(p_id, 'Milkywayy', 'status');
  else
    update public.projects set status = p_status,
      status_note = case when p_status = 'on_hold' then nullif(btrim(coalesce(p_note, '')), '') else null end,
      shoot_date = coalesce(p_date, shoot_date), slot = coalesce(nullif(btrim(coalesce(p_slot, '')), ''), slot),
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end
      where id = p_id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
      values (p_id, 'status', p.status, p_status, nullif(btrim(coalesce(p_note, '')), ''), 'Milkywayy', true);
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || p.status || ' → ' || p_status);
  v_event := case p_status when 'confirmed' then 'booking_confirmed' when 'shot' then 'shoot_done'
    when 'delivered' then 'delivered' else null end;
  return jsonb_build_object('event', v_event,
    'recipients', case when v_event is null or p.account_id is null then '[]'::jsonb
      else private.event_recipients(p_id, v_event) end);
end $$;

-- Revision workflow on top of any status: in progress → delivered (publishes that delivery).
create or replace function public.portal_admin_revision(p_secret text, p_actor text, p_id uuid, p_state text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id for update;
  if p_state = 'grant_round' then
    update public.projects set revision_rounds_allowed = revision_rounds_allowed + 1 where id = p_id;
    insert into public.project_events (project_id, kind, note, actor_name, by_admin)
      values (p_id, 'note', 'One more revision round added', 'Milkywayy', true);
    return jsonb_build_object('event', null, 'recipients', '[]'::jsonb);
  end if;
  update public.projects set revision_state = p_state where id = p_id;
  insert into public.project_events (project_id, kind, actor_name, by_admin)
    values (p_id, case p_state when 'in_progress' then 'revision_in_progress' else 'revision_delivered' end, 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': revision ' || p_state);
  return jsonb_build_object('event', case when p_state = 'delivered' then 'revision_delivered' end,
    'recipients', case when p_state = 'delivered' and p.account_id is not null
      then private.event_recipients(p_id, 'revision_delivered') else '[]'::jsonb end);
end $$;

-- Files: add one to a delivery (unpublished until the delivery is published), or remove one.
create or replace function public.portal_admin_add_file(
  p_secret text, p_actor text, p_id uuid, p_delivery_no int, p_delivery_label text, p_kind text,
  p_source text, p_url text, p_r2_key text, p_label text, p_bytes bigint, p_content_type text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into public.project_files (project_id, direction, delivery_no, delivery_label, kind, source, url,
    r2_key, label, bytes, content_type)
  values (p_id, 'out', p_delivery_no, p_delivery_label, p_kind, p_source, nullif(p_url, ''),
    nullif(p_r2_key, ''), btrim(p_label), p_bytes, p_content_type)
  returning id into v;
  return v;
end $$;

create or replace function public.portal_admin_remove_file(p_secret text, p_actor text, p_file uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.project_files set deleted_at = now() where id = p_file and deleted_at is null
    returning r2_key into v_key;
  return v_key;
end $$;

-- Publish a delivery: its files become visible, and the project is Delivered (or the revision is).
create or replace function public.portal_admin_publish_delivery(
  p_secret text, p_actor text, p_id uuid, p_delivery_no int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_label text; v_n int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id for update;
  update public.project_files set published = true
    where project_id = p_id and delivery_no = p_delivery_no and deleted_at is null and not published;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'add files to this delivery first' using errcode = '22023'; end if;
  select delivery_label into v_label from public.project_files
    where project_id = p_id and delivery_no = p_delivery_no limit 1;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p_id, 'delivery', v_label || ' published (' || v_n || ' item' || case when v_n = 1 then '' else 's' end || ')', 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || v_label || ' published');
  if p.revision_state in ('requested', 'in_progress') then
    return public.portal_admin_revision(p_secret, p_actor, p_id, 'delivered') || jsonb_build_object('label', v_label);
  end if;
  return public.portal_admin_set_status(p_secret, p_actor, p_id, 'delivered') || jsonb_build_object('label', v_label);
end $$;

create or replace function public.portal_admin_message(p_secret text, p_actor text, p_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id;
  insert into public.project_messages (project_id, author_name, is_admin, body)
    values (p_id, 'Milkywayy', true, btrim(p_body));
  return jsonb_build_object('event', 'new_message',
    'recipients', case when p.account_id is null then '[]'::jsonb else private.event_recipients(p_id, 'new_message') end);
end $$;

create or replace function public.portal_admin_project_notes(p_secret text, p_actor text, p_id uuid, p_notes text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into private.project_notes (project_id, notes, updated_by) values (p_id, btrim(p_notes), p_actor)
    on conflict (project_id) do update set notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Record a notification (sent, skipped or failed by email; a WhatsApp opened by hand).
create or replace function public.portal_admin_log_notification(
  p_secret text, p_actor text, p_project uuid, p_channel text, p_template text, p_to text,
  p_status text, p_provider_id text default null, p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into public.notification_log (account_id, project_id, channel, template, to_address, status, provider_id, error, actor)
  select p.account_id, p.id, p_channel, p_template, p_to, p_status, p_provider_id, left(p_error, 500), p_actor
  from public.projects p where p.id = p_project;
  update public.project_events set notified = true
    where id = (select max(id) from public.project_events where project_id = p_project) and p_status in ('sent', 'opened');
end $$;

-- Retention per client (admin), next to currency and notes.
create or replace function public.portal_admin_set_retention(p_secret text, p_actor text, p_id uuid, p_months int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set retention_months = p_months where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_id, 'Files kept ' || p_months || ' months after completion');
end $$;

-- Daily housekeeping (cron): auto-complete 7 days after delivery (counts as approval, §13),
-- files to delete now, and owners to warn 14 days ahead.
create or replace function public.portal_admin_housekeeping(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_done int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select id from public.projects
    where status = 'delivered' and delivered_at < now() - interval '7 days'
      and coalesce(revision_state, 'delivered') = 'delivered'
  loop
    perform private.complete_project(r.id, 'Automatically, 7 days after delivery', 'auto_completed');
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object(
    'auto_completed', v_done,
    'expired', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'key', f.r2_key))
      from public.project_files f where f.source = 'r2' and f.deleted_at is null and f.expires_at < now()), '[]'::jsonb),
    'warn', coalesce((select jsonb_agg(distinct jsonb_build_object('project', p.id, 'ref', p.ref, 'title', p.title,
        'expires', f.expires_at::date))
      from public.project_files f join public.projects p on p.id = f.project_id
      where f.source = 'r2' and f.deleted_at is null and f.direction = 'out'
        and f.expires_at::date = (now() + interval '14 days')::date), '[]'::jsonb)
  );
end $$;

create or replace function public.portal_admin_files_deleted(p_secret text, p_actor text, p_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.project_files set deleted_at = now() where id = any (p_ids);
end $$;

-- Who should get the "files will be deleted in 14 days" email for a project.
create or replace function public.portal_admin_recipients(p_secret text, p_actor text, p_id uuid, p_event text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return private.event_recipients(p_id, p_event);
end $$;

revoke all on function
  public.portal_admin_projects(text, text, text, text, text, uuid),
  public.portal_admin_project(text, text, uuid),
  public.portal_admin_set_status(text, text, uuid, text, text, date, text),
  public.portal_admin_revision(text, text, uuid, text),
  public.portal_admin_add_file(text, text, uuid, int, text, text, text, text, text, text, bigint, text),
  public.portal_admin_remove_file(text, text, uuid),
  public.portal_admin_publish_delivery(text, text, uuid, int),
  public.portal_admin_message(text, text, uuid, text),
  public.portal_admin_project_notes(text, text, uuid, text),
  public.portal_admin_log_notification(text, text, uuid, text, text, text, text, text, text),
  public.portal_admin_set_retention(text, text, uuid, int),
  public.portal_admin_housekeeping(text, text),
  public.portal_admin_files_deleted(text, text, uuid[]),
  public.portal_admin_recipients(text, text, uuid, text)
  from public;
grant execute on function
  public.portal_admin_projects(text, text, text, text, text, uuid),
  public.portal_admin_project(text, text, uuid),
  public.portal_admin_set_status(text, text, uuid, text, text, date, text),
  public.portal_admin_revision(text, text, uuid, text),
  public.portal_admin_add_file(text, text, uuid, int, text, text, text, text, text, text, bigint, text),
  public.portal_admin_remove_file(text, text, uuid),
  public.portal_admin_publish_delivery(text, text, uuid, int),
  public.portal_admin_message(text, text, uuid, text),
  public.portal_admin_project_notes(text, text, uuid, text),
  public.portal_admin_log_notification(text, text, uuid, text, text, text, text, text, text),
  public.portal_admin_set_retention(text, text, uuid, int),
  public.portal_admin_housekeeping(text, text),
  public.portal_admin_files_deleted(text, text, uuid[]),
  public.portal_admin_recipients(text, text, uuid, text)
  to anon, authenticated;
