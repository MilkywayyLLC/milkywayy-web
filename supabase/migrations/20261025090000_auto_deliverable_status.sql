-- Publishing a delivery marks its deliverables Delivered (owner, 13 Oct 2026), so the client's
-- "Request revision" works straight away. ADDITIVE ONLY; the admin's status control stays.
--
-- Each newly published file marks one deliverable: the one it's tied to, else the next open one
-- of the same kind (photos, reel, long_form, tour, video) on that project. "Open" = Editing or
-- In revision (a re-delivery after a revision). Approved items are never touched.

create or replace function private.deliver_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.project_deliverables%rowtype;
begin
  if new.deliverable_id is not null then
    select * into d from public.project_deliverables
      where id = new.deliverable_id and status in ('editing', 'in_revision');
  elsif new.kind in ('photos', 'reel', 'long_form', 'tour', 'video') then
    select * into d from public.project_deliverables
      where project_id = new.project_id and kind = new.kind and status in ('editing', 'in_revision')
      order by sort, created_at
      limit 1;
  end if;
  if d.id is null then
    return new;
  end if;
  update public.project_deliverables set status = 'delivered', delivered_at = now() where id = d.id;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (d.project_id, 'deliverable', d.label || ': delivered', 'Milkywayy', true);
  return new;
end $$;

revoke all on function private.deliver_on_publish() from public, anon, authenticated;

drop trigger if exists project_files_deliver_on_publish on public.project_files;
create trigger project_files_deliver_on_publish
  after update of published on public.project_files
  for each row when (new.published and not old.published and new.deleted_at is null)
  execute function private.deliver_on_publish();
