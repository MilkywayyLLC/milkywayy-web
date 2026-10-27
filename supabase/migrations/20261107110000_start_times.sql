-- Phase 1 part 5 (27 Oct 2026): every shoot shows its real date and start time ("Wed 29 Oct · 10:15"),
-- never Morning / Afternoon / Evening. The slot column stays (bookings still send one) but nothing shows
-- it. Additive: a setter for the admin's confirm / new-project start time, and a backfill that gives
-- old shoots a start time from their slot (Morning 09:00, Afternoon 14:00, Evening 17:00, Twilight
-- 17:30, Full day 09:00). An existing start time is never changed.

create or replace function private.slot_start(p_slot text) returns text
language sql immutable set search_path = '' as $$
  select case lower(replace(coalesce(p_slot, ''), ' ', '_'))
    when 'morning' then '09:00' when 'afternoon' then '14:00' when 'evening' then '17:00'
    when 'twilight' then '17:30' when 'full_day' then '09:00' else null end
$$;
revoke all on function private.slot_start(text) from public, anon, authenticated;

-- The admin sets the start time (confirming a shoot, or a shoot made by hand). A portal booking keeps
-- it in meta.booking.start_time (where the booking flow puts it); others in meta.start_time.
create or replace function public.portal_admin_set_start_time(p_secret text, p_actor text, p_project uuid,
  p_start text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_start !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'bad time' using errcode = '22023'; end if;
  update public.projects set meta = case when meta ? 'booking'
      then jsonb_set(meta, '{booking,start_time}', to_jsonb(p_start), true)
      else coalesce(meta, '{}'::jsonb) || jsonb_build_object('start_time', p_start) end
    where id = p_project and type = 'shoot';
end $$;
revoke all on function public.portal_admin_set_start_time(text, text, uuid, text) from public;
grant execute on function public.portal_admin_set_start_time(text, text, uuid, text) to anon, authenticated;

-- Backfill: old shoots without a start time get their slot's start.
update public.projects set meta = jsonb_set(meta, '{booking,start_time}', to_jsonb(private.slot_start(slot)), true)
  where type = 'shoot' and meta ? 'booking' and jsonb_typeof(meta -> 'booking') = 'object'
    and nullif(meta -> 'booking' ->> 'start_time', '') is null and private.slot_start(slot) is not null;
update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('start_time', private.slot_start(slot))
  where type = 'shoot' and not (coalesce(meta, '{}'::jsonb) ? 'booking')
    and nullif(meta ->> 'start_time', '') is null and private.slot_start(slot) is not null;
