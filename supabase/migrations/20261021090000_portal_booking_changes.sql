-- Client shoot changes (owner, 10 Oct 2026): a Requested shoot can be edited or cancelled by the
-- client; a Confirmed one can be changed (back to Requested, "Change requested") or cancelled.
-- Nothing once it's Shot. Cancelled shoots never reach billing: their unbilled line items go.

alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check (
  (type = 'shoot' and status in ('requested', 'confirmed', 'shot', 'editing', 'delivered', 'completed', 'cancelled'))
  or (type = 'edit' and status in ('submitted', 'files_received', 'in_editing', 'on_hold', 'delivered', 'completed'))
  or (type = 'avatar' and status in ('brief_received', 'script_ready', 'in_production', 'on_hold', 'delivered', 'completed'))
);

-- However it's cancelled (client or admin), nothing unbilled stays on it.
create or replace function private.cancelled_shoot_items() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    delete from public.line_items where project_id = new.id and billed_invoice_id is null;
  end if;
  return new;
end $$;
drop trigger if exists projects_cancelled on public.projects;
create trigger projects_cancelled after update of status on public.projects
  for each row execute function private.cancelled_shoot_items();

-- The shoot the caller may change: theirs to see, in their shoots area, not yet shot.
create or replace function private.changeable_shoot(p_project uuid) returns public.projects
language plpgsql stable security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project and type = 'shoot';
  if p.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids)
     or not private.sees_area(p.account_id, 'shoot') then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if p.status not in ('requested', 'confirmed') then
    raise exception 'this shoot can''t be changed any more' using errcode = '22023';
  end if;
  return p;
end $$;
revoke all on function private.changeable_shoot(uuid) from public, anon;
grant execute on function private.changeable_shoot(uuid) to authenticated;

create or replace function public.update_booking(p_project uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; s jsonb; v_addr text; v_note text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' end;
begin
  p := private.changeable_shoot(p_project);
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property')
       or (s ->> 'service' <> 'property' and coalesce((s ->> 'qty')::int, 0) not between 1 and 100)
       or (s ? 'day' and s ->> 'day' not in ('half', 'full')) then
      raise exception 'check the services' using errcode = '22023';
    end if;
  end loop;
  v_note := case when p.status = 'confirmed' then 'Change requested' else 'Details edited' end;
  update public.projects set
    shoot_date = p_date, slot = v_slot, status = 'requested',
    title = 'Shoot · ' || left(split_part(v_addr, ',', 1), 120),
    meta = jsonb_set(meta, '{booking}', coalesce(meta -> 'booking', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''))),
      'services', p_services, 'slot', p_slot,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    updated_at = now()
  where id = p.id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name)
    values (p.id, 'status', p.status, 'requested', v_note, private.my_name());
  return jsonb_build_object('id', p.id, 'ref', p.ref, 'was', p.status, 'note', v_note);
end $$;

create or replace function public.cancel_booking(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  p := private.changeable_shoot(p_project);
  update public.projects set status = 'cancelled', updated_at = now() where id = p.id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name)
    values (p.id, 'status', p.status, 'cancelled', 'Cancelled by the client', private.my_name());
  return jsonb_build_object('id', p.id, 'ref', p.ref, 'title', p.title, 'was', p.status);
end $$;

revoke all on function public.update_booking(uuid, date, text, jsonb, jsonb, text, numeric),
  public.cancel_booking(uuid) from public, anon;
grant execute on function public.update_booking(uuid, date, text, jsonb, jsonb, text, numeric),
  public.cancel_booking(uuid) to authenticated;
