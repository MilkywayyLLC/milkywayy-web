-- Performance advisor: one permissive policy per role and action, and auth/admin checks wrapped
-- in (select …) so Postgres evaluates them once per query instead of once per row.
-- Same access rules as before: anon reads published content; admins (editors + owner) write
-- content; owner writes prices, settings and the admin list.
-- anon has no access to the private schema, so anon policies never call is_admin().

-- ---------- content with a published flag ----------
do $$
declare t text;
begin
  foreach t in array array[
    'portfolio_items', 'case_studies', 'before_after', 'avatars', 'reviews', 'faqs', 'stats', 'clients'
  ] loop
    execute format('drop policy "public reads published" on public.%I', t);
    execute format('drop policy "admins read all" on public.%I', t);
    execute format('drop policy "admins write" on public.%I', t);
    execute format('create policy "anon reads published" on public.%I for select to anon using (published)', t);
    execute format('create policy "signed in reads published, admins read all" on public.%I for select to authenticated using (published or (select public.is_admin()))', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- ---------- placements follow their item ----------
drop policy "public reads placements of published items" on public.portfolio_placements;
drop policy "admins write placements" on public.portfolio_placements;
create policy "anon reads placements of published items" on public.portfolio_placements
  for select to anon
  using (exists (select 1 from public.portfolio_items i where i.id = item_id and i.published));
create policy "signed in reads placements" on public.portfolio_placements
  for select to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.portfolio_items i where i.id = item_id and i.published));
create policy "admins insert" on public.portfolio_placements
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update" on public.portfolio_placements
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete" on public.portfolio_placements
  for delete to authenticated using ((select public.is_admin()));

-- ---------- public read; admins write (proof strip, SEO) ----------
drop policy "public reads proof strip" on public.proof_strip_pages;
drop policy "admins write proof strip" on public.proof_strip_pages;
drop policy "public reads seo" on public.seo_pages;
drop policy "admins write seo" on public.seo_pages;
do $$
declare t text;
begin
  foreach t in array array['proof_strip_pages', 'seo_pages'] loop
    execute format('create policy "public reads" on public.%I for select using (true)', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- ---------- public read; owner writes (prices, settings) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'pricing_property', 'pricing_commercial_tiers', 'pricing_twilight', 'pricing_other', 'site_settings'
  ] loop
    execute format('drop policy "owner writes" on public.%I', t);
    execute format('create policy "owner inserts" on public.%I for insert to authenticated with check ((select public.is_owner()))', t);
    execute format('create policy "owner updates" on public.%I for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
    execute format('create policy "owner deletes" on public.%I for delete to authenticated using ((select public.is_owner()))', t);
  end loop;
end $$;

-- ---------- admins list ----------
drop policy "admins see themselves" on public.admins;
drop policy "owner manages admins" on public.admins;
create policy "admins see themselves, owner sees all" on public.admins
  for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email') or (select public.is_owner()));
create policy "owner inserts admins" on public.admins
  for insert to authenticated with check ((select public.is_owner()));
create policy "owner updates admins" on public.admins
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "owner deletes admins" on public.admins
  for delete to authenticated using ((select public.is_owner()));

-- ---------- leads, change log: wrap checks ----------
drop policy "owner manages leads" on public.leads;
create policy "owner manages leads" on public.leads
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy "admins read change log" on public.change_log;
drop policy "admins append change log" on public.change_log;
create policy "admins read change log" on public.change_log
  for select to authenticated using ((select public.is_admin()));
create policy "admins append change log" on public.change_log
  for insert to authenticated with check ((select public.is_admin()));
