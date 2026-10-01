-- Phase 5B: admin panel.
--
-- 1. The Owner needs two-factor (TOTP). Enforced here, not only in the UI: until the Owner's
--    session is verified with a code (aal2), the database treats them as a non-admin.
-- 2. Drafts for single documents (property prices, other prices, site settings, the AI avatar
--    hero) so they can be previewed before publishing.
-- 3. Change log records who (taken from the session, can't be faked), and old → new details.
-- 4. Publishing property prices is one transaction: all tables change together or not at all.

-- ---------- 1. two-factor for the Owner ----------
create or replace function private.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select a.role from public.admins a
  where a.email = lower(auth.jwt() ->> 'email')
    and (a.role <> 'owner' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

-- ---------- 2. drafts ----------
create table public.drafts (
  key text primary key check (key in ('pricing_property', 'pricing_other', 'site', 'avatar_hero')),
  value jsonb not null,
  updated_by text not null default lower(auth.jwt() ->> 'email'),
  updated_at timestamptz not null default now()
);
create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();
alter table public.drafts enable row level security;
-- Prices and settings: Owner. The AI avatar hero is content: any admin.
create policy "admins manage drafts they may publish" on public.drafts for all to authenticated
  using ((select public.is_owner()) or (key = 'avatar_hero' and (select public.is_admin())))
  with check ((select public.is_owner()) or (key = 'avatar_hero' and (select public.is_admin())));

-- The AI avatar hero lives in site_settings but is content, so Editors may update that one key.
drop policy "owner updates" on public.site_settings;
create policy "owner updates, admins update the avatar hero" on public.site_settings
  for update to authenticated
  using ((select public.is_owner()) or (key = 'avatar_hero' and (select public.is_admin())))
  with check ((select public.is_owner()) or (key = 'avatar_hero' and (select public.is_admin())));

-- ---------- 3. change log ----------
alter table public.change_log add column details jsonb not null default '[]';
alter table public.change_log alter column admin_email set default lower(auth.jwt() ->> 'email');
alter table public.change_log drop constraint change_log_action_check;
alter table public.change_log add constraint change_log_action_check
  check (action in ('create', 'update', 'delete', 'reorder', 'publish', 'unpublish', 'upload'));
drop policy "admins append change log" on public.change_log;
create policy "admins append change log as themselves" on public.change_log
  for insert to authenticated
  with check ((select public.is_admin()) and admin_email = lower((select auth.jwt()) ->> 'email'));
create index change_log_at_idx on public.change_log (at desc);

-- ---------- 4. publish property prices atomically ----------
-- SECURITY INVOKER: every statement runs under the caller's row-level security (Owner only).
create or replace function public.publish_property_pricing(
  sizes jsonb, tiers jsonb, twilight jsonb, meta jsonb, summary text, details jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only the Owner can change prices' using errcode = '42501';
  end if;
  delete from public.pricing_property where true;
  insert into public.pricing_property (type, size_index, size_label, service, price)
    select type, size_index, size_label, service, price
    from jsonb_to_recordset(sizes) as x(type text, size_index int, size_label text, service text, price int);
  delete from public.pricing_commercial_tiers where true;
  insert into public.pricing_commercial_tiers
    (tier_index, label, description, popular, photo, short, long, tour, photos, reel, walkthrough, tour_hotspots)
    select tier_index, label, description, popular, photo, short, long, tour, photos, reel, walkthrough, tour_hotspots
    from jsonb_to_recordset(tiers) as x(tier_index int, label text, description text, popular boolean,
      photo int, short int, long int, tour int, photos text, reel text, walkthrough text, tour_hotspots text);
  delete from public.pricing_twilight where true;
  insert into public.pricing_twilight (grp, qty, price)
    select grp, qty, price from jsonb_to_recordset(twilight) as x(grp text, qty int, price int);
  update public.pricing_other set value = meta where key = 'property_meta';
  if not found then
    raise exception 'pricing_other.property_meta is missing';
  end if;
  delete from public.drafts where key = 'pricing_property';
  insert into public.change_log (entity, entity_id, action, summary, details)
    values ('pricing', 'property', 'publish', summary, details);
end $$;
revoke all on function public.publish_property_pricing(jsonb, jsonb, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.publish_property_pricing(jsonb, jsonb, jsonb, jsonb, text, jsonb) to authenticated;
