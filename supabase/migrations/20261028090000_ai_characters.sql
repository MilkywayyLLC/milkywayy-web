-- AI avatar characters (site-refine, 17 Oct 2026). Additive only.
-- A client briefs a character; Milkywayy uploads 3 variations per round; the client picks one or
-- asks for changes (unlimited rounds, each logged); Milkywayy approves it with a name, which logs
-- an "AI character creation" billing item. Avatar videos then name the character(s) they use.
-- Status 'picked' is internal: the client chose, Milkywayy is finalising (shown as "Picked").

create table public.ai_characters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text check (name is null or length(btrim(name)) between 1 and 60),
  status text not null default 'brief_received'
    check (status in ('brief_received', 'variations_ready', 'revision_requested', 'picked', 'approved')),
  -- {brand, purpose, purpose_other, look, setting, voice, language, links[], similar_note}
  brief jsonb not null check (jsonb_typeof(brief) = 'object'),
  round int not null default 0,
  picked_file_id uuid,
  approved_file_id uuid,
  approved_at timestamptz,
  line_item_id uuid references public.line_items (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_characters_account on public.ai_characters (account_id, created_at desc);

create table public.ai_character_files (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.ai_characters (id) on delete cascade,
  kind text not null check (kind in ('variation', 'pack', 'reference')),
  round int not null default 0,
  label text not null check (length(btrim(label)) between 1 and 160),
  r2_key text,
  url text check (url is null or url ~ '^https://'),
  bytes bigint,
  content_type text,
  created_at timestamptz not null default now(),
  check (r2_key is not null or url is not null)
);
create index ai_character_files_char on public.ai_character_files (character_id, kind, round);

create table public.ai_character_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.ai_characters (id) on delete cascade,
  kind text not null check (kind in ('brief', 'variations', 'picked', 'changes', 'approved', 'renamed')),
  round int not null default 0,
  file_id uuid references public.ai_character_files (id) on delete set null,
  note text check (note is null or length(note) <= 2000),
  actor_name text,
  by_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_character_events_char on public.ai_character_events (character_id, created_at);

create table public.project_characters (
  project_id uuid not null references public.projects (id) on delete cascade,
  character_id uuid not null references public.ai_characters (id) on delete cascade,
  primary key (project_id, character_id)
);

alter table public.ai_characters enable row level security;
alter table public.ai_character_files enable row level security;
alter table public.ai_character_events enable row level security;
alter table public.project_characters enable row level security;

-- Characters are the account's brand assets: every member who works in Avatars sees them.
create or replace function private.sees_character(p_character uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ai_characters c where c.id = p_character
    and c.account_id in (select private.my_account_ids()) and private.sees_area(c.account_id, 'avatar'))
$$;
revoke all on function private.sees_character(uuid) from public, anon;
grant execute on function private.sees_character(uuid) to authenticated;

create policy "avatar members read characters" on public.ai_characters
  for select to authenticated using ((select private.sees_character(id)));
-- Pack files (face pack, voice sample, notes) are Milkywayy's working files.
create policy "avatar members read character files" on public.ai_character_files
  for select to authenticated using (kind <> 'pack' and (select private.sees_character(character_id)));
-- Variations of a round still being prepared stay Milkywayy's until "Send to client".
drop policy "avatar members read character files" on public.ai_character_files;
create policy "avatar members read character files" on public.ai_character_files
  for select to authenticated using (kind <> 'pack' and (select private.sees_character(character_id))
    and (kind <> 'variation'
      or round <= (select c.round from public.ai_characters c where c.id = character_id)));
create policy "avatar members read character events" on public.ai_character_events
  for select to authenticated using ((select private.sees_character(character_id)));
create policy "members read project characters" on public.project_characters
  for select to authenticated using (project_id in (select id from public.projects));

-- The rate card item (already there as avatar_setup): one-time, per character.
update public.rate_card set label = 'AI character creation', unit = 'character', updated_at = now()
  where key = 'avatar_setup';
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort)
  values ('avatar_setup', 'AI character creation', 'character', null, null, 70)
  on conflict (key) do nothing;

-- Who hears "variations ready": members working in Avatars, plus the account's project CCs.
create or replace function private.character_recipients(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', email, 'name', name)), '[]'::jsonb)
  from (
    select lower(coalesce(pr.email, u.email)) as email, coalesce(pr.full_name, '') as name
    from public.account_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.user_id = m.user_id
    where m.account_id = p_account and coalesce(pr.email, u.email) is not null
      and private.member_can(m.role, m.access, 'avatars')
      and coalesce((pr.notification_prefs -> 'character_variations' ->> 'email')::boolean, true)
    union
    select lower(x), '' from public.accounts a,
      jsonb_array_elements_text(coalesce(a.notify_cc -> 'projects', '[]'::jsonb)) x
    where a.id = p_account
  ) r
$$;
revoke all on function private.character_recipients(uuid) from public, anon, authenticated;

-- ---------- the client ----------
create or replace function public.create_ai_character(p_account uuid, p_brief jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; v_purpose text := p_brief ->> 'purpose';
begin
  if auth.uid() is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if not private.sees_area(p_account, 'avatar') then
    raise exception 'your access doesn''t include avatars' using errcode = '42501';
  end if;
  if jsonb_typeof(p_brief) <> 'object' or length(p_brief::text) > 12000 then
    raise exception 'brief too long' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_brief ->> 'brand')), 0) < 2 then
    raise exception 'say what the brand does' using errcode = '22023';
  end if;
  if v_purpose is null or v_purpose not in ('ads', 'engagement', 'explainers', 'other') then
    raise exception 'choose the purpose' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_brief ->> 'look')), 0) < 2 then
    raise exception 'describe the look' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_brief -> 'links', '[]'::jsonb)) l
      where l !~ '^https://\S+$') then
    raise exception 'links need a full https:// link' using errcode = '22023';
  end if;
  if (select count(*) from public.ai_characters where account_id = p_account
      and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many characters today' using errcode = '22023';
  end if;
  insert into public.ai_characters (account_id, brief) values (p_account, p_brief) returning id into v;
  insert into public.ai_character_events (character_id, kind, actor_name)
    select v, 'brief', coalesce(pr.full_name, u.email) from auth.users u
      left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
  return v;
end $$;

create or replace function public.add_ai_character_reference(p_character uuid, p_label text,
  p_r2_key text, p_url text, p_bytes bigint default null, p_content_type text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  if p_r2_key is not null and p_r2_key !~ ('^characters/' || p_character || '/ref/') then
    raise exception 'bad file' using errcode = '22023';
  end if;
  if (select count(*) from public.ai_character_files where character_id = p_character and kind = 'reference') >= 12 then
    raise exception 'too many references' using errcode = '22023';
  end if;
  insert into public.ai_character_files (character_id, kind, label, r2_key, url, bytes, content_type)
    values (p_character, 'reference', left(btrim(coalesce(nullif(p_label, ''), 'Reference')), 160),
      p_r2_key, nullif(btrim(coalesce(p_url, '')), ''), p_bytes, left(p_content_type, 120))
    returning id into v;
  return v;
end $$;

-- Pick one of the current round's variations.
create or replace function public.pick_ai_character(p_character uuid, p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype;
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = p_character for update;
  if c.status <> 'variations_ready' then
    raise exception 'isn''t waiting for you' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ai_character_files where id = p_file and character_id = p_character
      and kind = 'variation' and round = c.round) then
    raise exception 'pick one of this round''s variations' using errcode = '22023';
  end if;
  update public.ai_characters set status = 'picked', picked_file_id = p_file, updated_at = now()
    where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, file_id, actor_name)
    select p_character, 'picked', c.round, p_file, coalesce(pr.full_name, u.email) from auth.users u
      left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
end $$;

-- Ask for another round, optionally pointing at one variation.
create or replace function public.request_ai_character_changes(p_character uuid, p_file uuid, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype;
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = p_character for update;
  if c.status not in ('variations_ready', 'picked') then
    raise exception 'isn''t waiting for you' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'say what should change' using errcode = '22023';
  end if;
  if p_file is not null and not exists (select 1 from public.ai_character_files where id = p_file
      and character_id = p_character and kind = 'variation') then
    raise exception 'bad file' using errcode = '22023';
  end if;
  update public.ai_characters set status = 'revision_requested', picked_file_id = null, updated_at = now()
    where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, file_id, note, actor_name)
    select p_character, 'changes', c.round, p_file, left(btrim(p_note), 2000), coalesce(pr.full_name, u.email)
      from auth.users u left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
end $$;

-- An avatar video's presenter(s): approved characters of the project's account.
create or replace function public.set_project_characters(p_project uuid, p_characters uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or p.type <> 'avatar' or p.created_by is distinct from auth.uid() then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if coalesce(array_length(p_characters, 1), 0) not between 1 and 4 then
    raise exception 'choose 1 to 4 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.ai_characters where id = any (p_characters)
      and account_id = p.account_id and status = 'approved') <> array_length(p_characters, 1) then
    raise exception 'choose approved characters' using errcode = '22023';
  end if;
  delete from public.project_characters where project_id = p_project;
  insert into public.project_characters (project_id, character_id) select p_project, unnest(p_characters);
end $$;

revoke all on function public.create_ai_character(uuid, jsonb),
  public.add_ai_character_reference(uuid, text, text, text, bigint, text),
  public.pick_ai_character(uuid, uuid), public.request_ai_character_changes(uuid, uuid, text),
  public.set_project_characters(uuid, uuid[]) from public, anon;
grant execute on function public.create_ai_character(uuid, jsonb),
  public.add_ai_character_reference(uuid, text, text, text, bigint, text),
  public.pick_ai_character(uuid, uuid), public.request_ai_character_changes(uuid, uuid, text),
  public.set_project_characters(uuid, uuid[]) to authenticated;

-- ---------- the admin (secret-gated, like every portal_admin_*) ----------
-- One account's characters, or every account's (p_account null: the global queue).
create or replace function public.portal_admin_ai_characters(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'account_id', c.account_id, 'account_name', a.name, 'name', c.name, 'status', c.status,
      'brief', c.brief, 'round', c.round, 'picked_file_id', c.picked_file_id,
      'approved_file_id', c.approved_file_id, 'approved_at', c.approved_at, 'created_at', c.created_at,
      'updated_at', c.updated_at, 'line_item_id', c.line_item_id,
      'files', coalesce((select jsonb_agg(to_jsonb(f) order by f.kind, f.round, f.created_at)
        from public.ai_character_files f where f.character_id = c.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at)
        from public.ai_character_events e where e.character_id = c.id), '[]'::jsonb))
      order by (c.status = 'approved'), c.updated_at desc)
    from public.ai_characters c join public.accounts a on a.id = c.account_id
    where p_account is null or c.account_id = p_account), '[]'::jsonb);
end $$;

-- Variations go into the next round (unpublished until "Send to client"); pack files any time.
create or replace function public.portal_admin_ai_character_add_file(p_secret text, p_actor text,
  p_character uuid, p_kind text, p_label text, p_r2_key text, p_url text, p_bytes bigint, p_content_type text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype; v uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into c from public.ai_characters where id = p_character for update;
  if c.id is null then raise exception 'no such character' using errcode = '22023'; end if;
  if p_kind not in ('variation', 'pack') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_kind = 'variation' then
    if c.status not in ('brief_received', 'revision_requested') then
      raise exception 'variations are with the client: wait for their answer' using errcode = '22023';
    end if;
    if (select count(*) from public.ai_character_files where character_id = p_character
        and kind = 'variation' and round = c.round + 1) >= 3 then
      raise exception 'three variations per round' using errcode = '22023';
    end if;
  end if;
  insert into public.ai_character_files (character_id, kind, round, label, r2_key, url, bytes, content_type)
    values (p_character, p_kind, case when p_kind = 'variation' then c.round + 1 else 0 end,
      left(btrim(p_label), 160), p_r2_key, nullif(btrim(coalesce(p_url, '')), ''), p_bytes, left(p_content_type, 120))
    returning id into v;
  update public.ai_characters set updated_at = now() where id = p_character;
  return v;
end $$;

create or replace function public.portal_admin_ai_character_remove_file(p_secret text, p_actor text, p_file uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare f public.ai_character_files%rowtype; c public.ai_characters%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into f from public.ai_character_files where id = p_file;
  select * into c from public.ai_characters where id = f.character_id;
  if f.id is null or (f.kind = 'variation' and f.round <= c.round) or f.kind = 'reference' then
    raise exception 'only unsent variations and pack files can be removed' using errcode = '22023';
  end if;
  delete from public.ai_character_files where id = p_file;
  return f.r2_key;
end $$;

-- Send the round's 3 variations to the client. Returns who to email.
create or replace function public.portal_admin_ai_character_publish(p_secret text, p_actor text, p_character uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into c from public.ai_characters where id = p_character for update;
  if c.status not in ('brief_received', 'revision_requested') then
    raise exception 'this round is already with the client' using errcode = '22023';
  end if;
  if (select count(*) from public.ai_character_files where character_id = p_character
      and kind = 'variation' and round = c.round + 1) <> 3 then
    raise exception 'upload three variations first' using errcode = '22023';
  end if;
  update public.ai_characters set status = 'variations_ready', round = c.round + 1, updated_at = now()
    where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, actor_name, by_admin)
    values (p_character, 'variations', c.round + 1, 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', c.account_id, 'AI character: round ' || (c.round + 1) || ' sent');
  return jsonb_build_object('round', c.round + 1, 'recipients', private.character_recipients(c.account_id));
end $$;

-- Approve with a name and the chosen image; logs the one-time "AI character creation" item.
create or replace function public.portal_admin_ai_character_approve(p_secret text, p_actor text,
  p_character uuid, p_name text, p_file uuid, p_price numeric default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype; v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_price numeric; v_line uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into c from public.ai_characters where id = p_character for update;
  if c.id is null then raise exception 'no such character' using errcode = '22023'; end if;
  if c.status = 'approved' then raise exception 'already approved' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'give the character a name' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ai_character_files where id = p_file and character_id = p_character
      and kind = 'variation' and round <= c.round) then
    raise exception 'choose a sent variation' using errcode = '22023';
  end if;
  v_price := coalesce(p_price, private.rate_on(c.account_id, 'avatar_setup', v_today));
  if v_price is null or v_price < 0 then
    raise exception 'no rate for AI character creation yet: set it in the client''s rates or enter a price'
      using errcode = '22023';
  end if;
  insert into public.line_items (account_id, description, qty, unit_price, currency, kind, delivered_month,
    service_date, rate_key, price_basis, list_price)
  select c.account_id, 'AI character creation: ' || btrim(p_name), 1, v_price, a.currency, 'avatar_setup',
    private.dubai_month(now()), v_today, 'avatar_setup',
    case when p_price is null then 'client_rate' else 'manual' end,
    private.rate_on(c.account_id, 'avatar_setup', v_today)
  from public.accounts a where a.id = c.account_id
  returning id into v_line;
  update public.ai_characters set status = 'approved', name = btrim(p_name), approved_file_id = p_file,
    picked_file_id = coalesce(picked_file_id, p_file), approved_at = now(), line_item_id = v_line,
    updated_at = now() where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, file_id, note, actor_name, by_admin)
    values (p_character, 'approved', c.round, p_file, btrim(p_name), 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', c.account_id, 'AI character approved: ' || btrim(p_name));
  return v_line;
end $$;

create or replace function public.portal_admin_ai_character_rename(p_secret text, p_actor text,
  p_character uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'give the character a name' using errcode = '22023';
  end if;
  update public.ai_characters set name = btrim(p_name), updated_at = now() where id = p_character;
  insert into public.ai_character_events (character_id, kind, note, actor_name, by_admin)
    values (p_character, 'renamed', btrim(p_name), 'Milkywayy', true);
end $$;

-- Which characters an avatar video uses (the admin project page).
create or replace function public.portal_admin_project_characters(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'account_id', c.account_id,
      'r2_key', f.r2_key, 'url', f.url) order by c.name)
    from public.project_characters pc join public.ai_characters c on c.id = pc.character_id
    left join public.ai_character_files f on f.id = c.approved_file_id
    where pc.project_id = p_project), '[]'::jsonb);
end $$;
