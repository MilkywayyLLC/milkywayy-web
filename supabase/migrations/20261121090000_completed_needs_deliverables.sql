-- A project can't show Completed while a deliverable is still Editing (owner, 3 Nov 2026).
-- Additive: one new check on the way to Completed. Delivered stays allowed, so photos can go out
-- before the reels. Rows that already break the rule are left alone; Akash fixes those by hand.

create or replace function private.needs_deliverables_done() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status <> 'completed'
      and exists (select 1 from public.project_deliverables d
        where d.project_id = new.id and d.status = 'editing') then
    raise exception 'some deliverables are still editing' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists projects_need_deliverables on public.projects;
create trigger projects_need_deliverables before update of status on public.projects
  for each row execute function private.needs_deliverables_done();
revoke all on function private.needs_deliverables_done() from public, anon, authenticated;

-- And a completed project can't go back to Editing: moved back is refused, added later counts as
-- delivered (a deliverable added after completion describes work that's already out).
create or replace function private.no_editing_when_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'editing' and (tg_op = 'INSERT' or old.status <> 'editing')
      and exists (select 1 from public.projects p where p.id = new.project_id and p.status = 'completed') then
    if tg_op = 'UPDATE' then
      raise exception 'this project is completed: a deliverable cannot go back to editing' using errcode = '22023';
    end if;
    new.status := 'delivered';
    new.delivered_at := now();
  end if;
  return new;
end $$;
drop trigger if exists project_deliverables_no_editing on public.project_deliverables;
create trigger project_deliverables_no_editing before insert or update of status on public.project_deliverables
  for each row execute function private.no_editing_when_completed();
revoke all on function private.no_editing_when_completed() from public, anon, authenticated;

-- The 7-day auto-complete skips those projects instead of failing the whole daily run.
create or replace function public.portal_admin_housekeeping(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_done int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select p.id from public.projects p
    where p.status = 'delivered' and p.delivered_at < now() - interval '7 days'
      and coalesce(p.revision_state, 'delivered') = 'delivered'
      and not exists (select 1 from public.project_deliverables d
        where d.project_id = p.id and d.status = 'editing')
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
