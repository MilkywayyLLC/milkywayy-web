-- Client portal, Phase 11 (CLIENT_PORTAL_GUIDE §4.1, §5.3, §5.4, §8): post-production batches and
-- AI avatar videos on the Phase 10 engine.
--
-- * Clients start their own projects: an editing batch (Submitted → Files received → In editing →
--   Delivered → Completed) or an avatar brief (Brief received → Script ready → In production →
--   Delivered → Completed). Both can be On hold, waiting on the client, with a reason they see.
-- * Clients add raw files (links, or uploads to R2 under the project's own folder) until the
--   project completes; raw uploads are deleted 30 days after completion (Phase 10's clock).
-- * Avatar scripts are versioned. Milkywayy posts one; the client approves it or asks for changes
--   with a comment. Production can't start until the latest script is approved.
-- * Every status change can email the client ("status_update" for the steps without their own
--   email), always the admin's choice.
-- Additive: new statuses/kinds widen checks; new table and functions; three functions replaced.

-- ---------- wider checks ----------
alter table public.projects drop constraint projects_check;
alter table public.projects add constraint projects_status_check check (
  (type = 'shoot' and status in ('requested', 'confirmed', 'shot', 'editing', 'delivered', 'completed'))
  or (type = 'edit' and status in ('submitted', 'files_received', 'in_editing', 'on_hold', 'delivered', 'completed'))
  or (type = 'avatar' and status in ('brief_received', 'script_ready', 'in_production', 'on_hold', 'delivered', 'completed'))
);

alter table public.project_events drop constraint project_events_kind_check;
alter table public.project_events add constraint project_events_kind_check check (kind in (
  'created', 'status', 'delivery', 'revision_requested', 'revision_in_progress', 'revision_delivered',
  'approved', 'auto_completed', 'note', 'files_added', 'script_posted', 'script_approved', 'script_changes'));

alter table public.project_files drop constraint project_files_kind_check;
alter table public.project_files add constraint project_files_kind_check
  check (kind in ('photos', 'reel', 'long_form', 'tour', 'zip', 'other', 'raw'));

-- ---------- avatar scripts ----------
create table public.project_scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version int not null check (version >= 1),
  body text not null check (length(btrim(body)) between 1 and 20000),
  length_note text check (length(length_note) <= 60),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested', 'replaced')),
  client_comment text check (length(client_comment) <= 2000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create index project_scripts_decided_by_idx on public.project_scripts (decided_by);
revoke all on public.project_scripts from anon, authenticated;
grant select on public.project_scripts to authenticated;
alter table public.project_scripts enable row level security;
create policy "read scripts of visible projects" on public.project_scripts
  for select to authenticated using (project_id in (select id from public.projects));
alter publication supabase_realtime add table public.project_scripts;

-- ---------- clients start a batch or an avatar brief ----------
-- Brief fields are explicit parameters (no free-form JSON from the browser). Returns the new ref
-- and who should get the "received" email; the server emails them and Milkywayy.
create or replace function public.create_project(
  p_account uuid, p_type text, p_title text, p_kind text, p_quantity int default null,
  p_notes text default null, p_references text[] default '{}', p_due date default null,
  p_script_by text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ref text; v_refs text[];
begin
  if v_uid is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if p_type not in ('edit', 'avatar') then
    raise exception 'unknown project type' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'give it a title' using errcode = '22023';
  end if;
  if (p_type = 'edit' and p_kind not in ('hdr_photos', 'short_form', 'long_form', 'avatar_edit', 'other'))
    or (p_type = 'avatar' and p_kind not in ('30s', '60s', '90s', 'longer')) then
    raise exception 'choose what it is' using errcode = '22023';
  end if;
  if p_type = 'avatar' and coalesce(p_script_by, '') not in ('milkywayy', 'client') then
    raise exception 'say who writes the script' using errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity not between 1 and 10000 then
    raise exception 'quantity out of range' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 4000 then
    raise exception 'notes too long' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(r)), '{}') into v_refs
    from unnest(coalesce(p_references, '{}')) r where btrim(r) <> '';
  if array_length(v_refs, 1) > 10
    or exists (select 1 from unnest(v_refs) r where r !~ '^https://\S+$' or length(r) > 2000) then
    raise exception 'reference links must be https:// links (10 at most)' using errcode = '22023';
  end if;
  if p_due is not null and p_due < current_date then
    raise exception 'the deadline is in the past' using errcode = '22023';
  end if;
  -- A brake on runaway scripts, not on real use.
  if (select count(*) from public.projects where account_id = p_account and created_at > now() - interval '1 day'
      and created_by is not null) >= 30 then
    raise exception 'too many new projects today' using errcode = '22023';
  end if;

  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, meta, due_at, created_by, requested_by)
  values (p_account, p_type, v_ref, btrim(p_title),
    case p_type when 'edit' then 'submitted' else 'brief_received' end,
    jsonb_strip_nulls(jsonb_build_object('kind', p_kind, 'quantity', p_quantity,
      'notes', nullif(btrim(coalesce(p_notes, '')), ''), 'references', to_jsonb(v_refs),
      'script_by', case when p_type = 'avatar' then p_script_by end)),
    case when p_due is not null then (p_due + time '18:00') at time zone 'Asia/Dubai' end,
    v_uid, v_uid)
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name)
    values (v_id, 'created', case p_type when 'edit' then 'submitted' else 'brief_received' end, private.my_name());
  return jsonb_build_object('id', v_id, 'ref', v_ref,
    'recipients', private.event_recipients(v_id, 'batch_received'));
end $$;

-- Raw files in: a link, or an upload the server signed under projects/<ref>/in/.
create or replace function public.add_project_file_in(
  p_project uuid, p_source text, p_label text, p_url text default null, p_r2_key text default null,
  p_bytes bigint default null, p_content_type text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v uuid;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.type = 'shoot' then
    raise exception 'files go to editing and avatar projects' using errcode = '22023';
  end if;
  if p.status = 'completed' then
    raise exception 'this project is completed' using errcode = '22023';
  end if;
  if p_source = 'link' then
    if coalesce(p_url, '') !~ '^https://\S+$' then
      raise exception 'paste a full https:// link' using errcode = '22023';
    end if;
  elsif p_source = 'r2' then
    if coalesce(p_r2_key, '') not like 'projects/' || p.ref || '/in/%' or p_r2_key like '%..%' then
      raise exception 'not an upload for this project' using errcode = '42501';
    end if;
  else
    raise exception 'unknown source' using errcode = '22023';
  end if;
  if (select count(*) from public.project_files where project_id = p_project and direction = 'in' and deleted_at is null) >= 300 then
    raise exception 'too many files on this project' using errcode = '22023';
  end if;
  insert into public.project_files (project_id, direction, kind, source, url, r2_key, label, bytes, content_type, published)
  values (p_project, 'in', 'raw', p_source, case when p_source = 'link' then btrim(p_url) end,
    case when p_source = 'r2' then p_r2_key end, left(coalesce(nullif(btrim(p_label), ''), 'Files'), 160),
    p_bytes, left(p_content_type, 120), true)
  returning id into v;
  insert into public.project_events (project_id, kind, note, actor_name)
    values (p_project, 'files_added', left(coalesce(nullif(btrim(p_label), ''), 'Files'), 200), private.my_name());
  return v;
end $$;

-- The client approves the latest script, or asks for changes. Approving starts production.
create or replace function public.decide_script(p_script uuid, p_approve boolean, p_comment text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.project_scripts%rowtype; p public.projects%rowtype;
begin
  select * into s from public.project_scripts where id = p_script for update;
  select * into p from public.projects where id = s.project_id for update;
  if s.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if s.status <> 'pending' or p.status <> 'script_ready' then
    raise exception 'this script isn''t waiting for you' using errcode = '22023';
  end if;
  if not p_approve and coalesce(btrim(p_comment), '') = '' then
    raise exception 'say what should change' using errcode = '22023';
  end if;
  update public.project_scripts set status = case when p_approve then 'approved' else 'changes_requested' end,
    client_comment = nullif(left(btrim(coalesce(p_comment, '')), 2000), ''),
    decided_by = auth.uid(), decided_by_name = private.my_name(), decided_at = now()
    where id = p_script;
  if p_approve then
    update public.projects set status = 'in_production', status_note = null where id = p.id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name)
      values (p.id, 'script_approved', 'script_ready', 'in_production', 'Script v' || s.version || ' approved', private.my_name());
  else
    insert into public.project_events (project_id, kind, note, actor_name)
      values (p.id, 'script_changes', left('Script v' || s.version || ': ' || btrim(p_comment), 1000), private.my_name());
    insert into public.project_messages (project_id, author_id, author_name, body)
      values (p.id, auth.uid(), private.my_name(), left('Script v' || s.version || ' changes: ' || btrim(p_comment), 4000));
  end if;
  return jsonb_build_object('approved', p_approve, 'version', s.version, 'ref', p.ref, 'title', p.title);
end $$;

revoke all on function public.create_project(uuid, text, text, text, int, text, text[], date, text),
  public.add_project_file_in(uuid, text, text, text, text, bigint, text),
  public.decide_script(uuid, boolean, text) from public, anon;
grant execute on function public.create_project(uuid, text, text, text, int, text, text[], date, text),
  public.add_project_file_in(uuid, text, text, text, text, bigint, text),
  public.decide_script(uuid, boolean, text) to authenticated;

-- ---------- the admin ----------
-- Post a script (a new version replaces a pending one); the project moves to Script ready.
create or replace function public.portal_admin_post_script(
  p_secret text, p_actor text, p_id uuid, p_body text, p_length text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_version int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id for update;
  if p.type is distinct from 'avatar' then
    raise exception 'scripts are for avatar projects' using errcode = '22023';
  end if;
  if p.status not in ('brief_received', 'script_ready', 'on_hold') then
    raise exception 'the script is already approved' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_body)), 0) = 0 then
    raise exception 'write the script first' using errcode = '22023';
  end if;
  update public.project_scripts set status = 'replaced' where project_id = p_id and status = 'pending';
  select coalesce(max(version), 0) + 1 into v_version from public.project_scripts where project_id = p_id;
  insert into public.project_scripts (project_id, version, body, length_note)
    values (p_id, v_version, btrim(p_body), nullif(btrim(coalesce(p_length, '')), ''));
  update public.projects set status = 'script_ready', status_note = null where id = p_id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
    values (p_id, 'script_posted', p.status, 'script_ready', 'Script v' || v_version || ' ready for approval', 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': script v' || v_version || ' posted');
  return jsonb_build_object('event', 'script_ready', 'version', v_version,
    'recipients', case when p.account_id is null then '[]'::jsonb else private.event_recipients(p_id, 'script_ready') end);
end $$;

-- Status changes: as Phase 10, plus production waits for an approved script, and every step can
-- email the client (the steps without their own email send "status_update").
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
  if p.type = 'avatar' and p_status in ('in_production', 'delivered') and not exists (
      select 1 from public.project_scripts s where s.project_id = p_id and s.status = 'approved') then
    raise exception 'the client approves the script first' using errcode = '22023';
  end if;
  if p_status = 'script_ready' and not exists (
      select 1 from public.project_scripts s where s.project_id = p_id and s.status = 'pending') then
    raise exception 'post the script first' using errcode = '22023';
  end if;
  if p_status = 'on_hold' and coalesce(btrim(p_note), '') = '' then
    raise exception 'say what you are waiting for' using errcode = '22023';
  end if;
  if p_status = 'completed' then
    perform private.complete_project(p_id, 'Milkywayy', 'status');
  else
    update public.projects set status = p_status,
      status_note = case when p_status = 'on_hold' then left(btrim(p_note), 500) else null end,
      shoot_date = coalesce(p_date, shoot_date), slot = coalesce(nullif(btrim(coalesce(p_slot, '')), ''), slot),
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end
      where id = p_id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
      values (p_id, 'status', p.status, p_status, nullif(btrim(coalesce(p_note, '')), ''), 'Milkywayy', true);
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || p.status || ' → ' || p_status);
  v_event := case p_status when 'confirmed' then 'booking_confirmed' when 'shot' then 'shoot_done'
    when 'delivered' then 'delivered' when 'script_ready' then 'script_ready' else 'status_update' end;
  return jsonb_build_object('event', v_event,
    'recipients', case when p.account_id is null then '[]'::jsonb else private.event_recipients(p_id, v_event) end);
end $$;

-- The board/list: as Phase 10, plus the latest script's state and how many raw files are in.
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
        and (v_q is null or lower(p.ref) like '%' || v_q || '%' or lower(p.title) like '%' || v_q || '%'
          or lower(coalesce(a.name, '')) like '%' || v_q || '%' or lower(coalesce(l.name, '')) like '%' || v_q || '%')
      limit 500
    ) x
  ), '[]'::jsonb);
end $$;

-- One project: as Phase 10, plus scripts and who submitted it (their WhatsApp number comes first).
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
    'submitter', (select jsonb_build_object('name', pr.full_name, 'email', coalesce(pr.email, u.email),
        'phone', coalesce(pr.phone_e164, case when coalesce(u.phone, '') <> '' then '+' || u.phone end))
        from public.projects p join auth.users u on u.id = p.created_by
        left join public.profiles pr on pr.user_id = p.created_by where p.id = p_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at desc) from public.project_events e where e.project_id = p_id), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(to_jsonb(f) order by f.delivery_no nulls first, f.created_at) from public.project_files f
        where f.project_id = p_id and f.deleted_at is null), '[]'::jsonb),
    'scripts', coalesce((select jsonb_agg(to_jsonb(s) order by s.version desc) from public.project_scripts s where s.project_id = p_id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.at) from public.project_messages m where m.project_id = p_id), '[]'::jsonb),
    'line_items', coalesce((select jsonb_agg(to_jsonb(li) order by li.created_at) from public.line_items li where li.project_id = p_id), '[]'::jsonb),
    'notes', (select n.notes from private.project_notes n where n.project_id = p_id),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.at desc) from
        (select * from public.notification_log where project_id = p_id order by at desc limit 30) n), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function public.portal_admin_post_script(text, text, uuid, text, text) from public;
grant execute on function public.portal_admin_post_script(text, text, uuid, text, text) to anon, authenticated;
