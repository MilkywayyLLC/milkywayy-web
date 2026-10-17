-- Edit or revise AI requests (owner, 17 Oct 2026). Additive: wider event kinds, new functions.
--
-- * Before work starts (Brief received) the client can edit the brief of an AI character or an
--   avatar video: the brief is replaced, the change is logged ("Brief edited") and Milkywayy is
--   emailed by the server. Reference images can be added or removed then.
-- * Once work has started the client asks for a revision instead: a note (plus optional images,
--   uploaded as references or project files), logged as a new round. Characters with variations
--   go to Revision requested as before; an approved character stays approved (videos use it) and
--   the revision is logged for Milkywayy. Avatar videos: a delivered one uses request_revision
--   (rounds); before delivery the request is logged and posted to the project's messages.

-- ---------- wider checks ----------
alter table public.ai_character_events drop constraint ai_character_events_kind_check;
alter table public.ai_character_events add constraint ai_character_events_kind_check check (kind in (
  'brief', 'variations', 'picked', 'changes', 'approved', 'renamed', 'edited', 'revision'));

alter table public.project_events drop constraint project_events_kind_check;
alter table public.project_events add constraint project_events_kind_check check (kind in (
  'created', 'status', 'delivery', 'revision_requested', 'revision_in_progress', 'revision_delivered',
  'approved', 'auto_completed', 'note', 'files_added', 'script_posted', 'script_approved', 'script_changes',
  'logged', 'deliverable', 'brief_edited'));

-- ---------- characters ----------
create or replace function public.edit_ai_character(p_character uuid, p_brief jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype; v_purpose text := p_brief ->> 'purpose';
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = p_character for update;
  if c.status <> 'brief_received' or c.round > 0 then
    raise exception 'work has started: ask for a revision' using errcode = '22023';
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
  update public.ai_characters set brief = p_brief, updated_at = now() where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, actor_name)
    select p_character, 'edited', 0, coalesce(pr.full_name, u.email) from auth.users u
      left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
end $$;

-- Remove a reference image while the brief can still be edited. Returns the R2 key to delete.
create or replace function public.remove_ai_character_reference(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare f public.ai_character_files%rowtype; c public.ai_characters%rowtype;
begin
  select * into f from public.ai_character_files where id = p_file;
  if f.id is null or f.kind <> 'reference' or not private.sees_character(f.character_id) then
    raise exception 'not your file' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = f.character_id;
  if c.status <> 'brief_received' or c.round > 0 then
    raise exception 'work has started: ask for a revision' using errcode = '22023';
  end if;
  delete from public.ai_character_files where id = p_file;
  return f.r2_key;
end $$;

-- A revision once work has started: a new round of changes (variations with the client), or a
-- logged revision on an approved character (it stays approved: videos use it).
create or replace function public.request_ai_character_revision(p_character uuid, p_file uuid, p_note text)
returns text
language plpgsql security definer set search_path = '' as $$
declare c public.ai_characters%rowtype;
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = p_character for update;
  if c.status not in ('variations_ready', 'picked', 'approved') then
    raise exception 'isn''t waiting for you' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'say what should change' using errcode = '22023';
  end if;
  if p_file is not null and not exists (select 1 from public.ai_character_files where id = p_file
      and character_id = p_character and kind = 'variation') then
    raise exception 'bad file' using errcode = '22023';
  end if;
  if c.status = 'approved' then
    update public.ai_characters set updated_at = now() where id = p_character;
    insert into public.ai_character_events (character_id, kind, round, file_id, note, actor_name)
      select p_character, 'revision', c.round, p_file, left(btrim(p_note), 2000), coalesce(pr.full_name, u.email)
        from auth.users u left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
    return 'approved';
  end if;
  update public.ai_characters set status = 'revision_requested', picked_file_id = null, updated_at = now()
    where id = p_character;
  insert into public.ai_character_events (character_id, kind, round, file_id, note, actor_name)
    select p_character, 'changes', c.round, p_file, left(btrim(p_note), 2000), coalesce(pr.full_name, u.email)
      from auth.users u left join public.profiles pr on pr.user_id = u.id where u.id = auth.uid();
  return 'revision_requested';
end $$;

-- Reference images for a revision count beyond the brief's 12 (up to 24 in all).
create or replace function public.add_ai_character_revision_image(p_character uuid, p_label text,
  p_r2_key text, p_bytes bigint default null, p_content_type text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; c public.ai_characters%rowtype;
begin
  if not private.sees_character(p_character) then
    raise exception 'not your character' using errcode = '42501';
  end if;
  select * into c from public.ai_characters where id = p_character;
  if p_r2_key is null or p_r2_key !~ ('^characters/' || p_character || '/ref/') then
    raise exception 'bad file' using errcode = '22023';
  end if;
  if (select count(*) from public.ai_character_files where character_id = p_character and kind = 'reference') >= 24 then
    raise exception 'too many references' using errcode = '22023';
  end if;
  insert into public.ai_character_files (character_id, kind, round, label, r2_key, bytes, content_type)
    values (p_character, 'reference', c.round, left(btrim(coalesce(nullif(p_label, ''), 'Reference')), 160),
      p_r2_key, p_bytes, left(p_content_type, 120))
    returning id into v;
  return v;
end $$;

-- ---------- avatar videos ----------
create or replace function public.edit_avatar_brief(p_project uuid, p_title text, p_kind text,
  p_notes text, p_references text[], p_script_by text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_refs text[];
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.type <> 'avatar' then raise exception 'not an avatar video' using errcode = '22023'; end if;
  if p.status <> 'brief_received' then
    raise exception 'work has started: ask for a revision' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'give it a title' using errcode = '22023';
  end if;
  if coalesce(p_kind, '') not in ('30s', '60s', '90s', 'longer') then
    raise exception 'choose what it is' using errcode = '22023';
  end if;
  if coalesce(p_script_by, '') not in ('milkywayy', 'client') then
    raise exception 'say who writes the script' using errcode = '22023';
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
  update public.projects set title = btrim(p_title),
    meta = (coalesce(meta, '{}'::jsonb) - 'notes' - 'references') || jsonb_strip_nulls(jsonb_build_object(
      'kind', p_kind, 'notes', nullif(btrim(coalesce(p_notes, '')), ''), 'references', to_jsonb(v_refs),
      'script_by', p_script_by)),
    updated_at = now()
  where id = p_project;
  insert into public.project_events (project_id, kind, note, actor_name)
    values (p_project, 'brief_edited', 'Brief edited', private.my_name());
end $$;

-- Before delivery: a revision request is logged and posted to the project's messages (the
-- status stays: script changes still go through the script, production carries on with it).
create or replace function public.request_avatar_revision(p_project uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.type <> 'avatar' or p.status not in ('script_ready', 'in_production', 'on_hold') then
    raise exception 'that isn''t possible right now' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'say what should change' using errcode = '22023';
  end if;
  insert into public.project_events (project_id, kind, note, actor_name)
    values (p_project, 'revision_requested', left(btrim(p_note), 1000), private.my_name());
  insert into public.project_messages (project_id, author_id, author_name, body)
    values (p_project, auth.uid(), private.my_name(), 'Revision request: ' || btrim(p_note));
  update public.projects set updated_at = now() where id = p_project;
end $$;

revoke all on function public.edit_ai_character(uuid, jsonb), public.remove_ai_character_reference(uuid),
  public.request_ai_character_revision(uuid, uuid, text),
  public.add_ai_character_revision_image(uuid, text, text, bigint, text),
  public.edit_avatar_brief(uuid, text, text, text, text[], text),
  public.request_avatar_revision(uuid, text) from public, anon;
grant execute on function public.edit_ai_character(uuid, jsonb), public.remove_ai_character_reference(uuid),
  public.request_ai_character_revision(uuid, uuid, text),
  public.add_ai_character_revision_image(uuid, text, text, bigint, text),
  public.edit_avatar_brief(uuid, text, text, text, text[], text),
  public.request_avatar_revision(uuid, text) to authenticated;
