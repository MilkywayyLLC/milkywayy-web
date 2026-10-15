-- Admin Library / Pages (site-refine, 26 Oct 2026). ADDITIVE ONLY: no drops, no renames.
--   portfolio_items.library_order   the Library's drag order. It is the order on the Work page and
--                                   the order automatic sections pick in (replaces "newest first").
--                                   Backfilled newest-first, so nothing moves until someone drags.
--                                   Items added later have no value and sort to the top.
--   placement_heroes                the chosen hero template per page (3 vertical, 1 vertical, …).
--                                   No row = the page's default template, so the site is unchanged.

alter table public.portfolio_items add column if not exists library_order int;

update public.portfolio_items i
set library_order = r.n
from (
  select id, (row_number() over (order by created_at desc nulls last, id) - 1)::int as n
  from public.portfolio_items
) r
where i.id = r.id and i.library_order is null;

create table if not exists public.placement_heroes (
  section text primary key,
  template text not null check (template in ('v3', 'v1', 'h1', 'ba', 'photo')),
  updated_at timestamptz not null default now()
);

alter table public.placement_heroes enable row level security;
create policy "anyone reads" on public.placement_heroes for select using (true);
create policy "admins insert" on public.placement_heroes for insert to authenticated with check ((select public.is_admin()));
create policy "admins update" on public.placement_heroes for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete" on public.placement_heroes for delete to authenticated using ((select public.is_admin()));
