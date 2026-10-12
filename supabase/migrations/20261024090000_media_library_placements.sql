-- Media library + auto-placement (site-refine, 24 Oct 2026). ADDITIVE ONLY: no drops, no renames.
-- portfolio_items.category / format and portfolio_placements stay readable (and keep being
-- written by the admin) until the owner confirms, so rolling back the code is safe.
--
--   media_categories      reusable categories (Property, Brand, Holiday home, …), editable
--   portfolio_items       + media_type, orientation, category_id, show_on_work
--   placement_pins        an item held in a section's slot (also the manual hero slots)
--   placement_modes       'manual' = the section shows only its pins (what every existing
--                         placement becomes, so the site doesn't change); no row = automatic

create table if not exists public.media_categories (
  id text primary key,
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.media_categories (id, label, sort_order) values
  ('property', 'Property', 1),
  ('brand', 'Brand', 2),
  ('holiday-home', 'Holiday home', 3),
  -- Existing post-production work is filed as "editing"; kept so its sections still match.
  ('editing', 'Editing', 4)
on conflict (id) do nothing;

alter table public.portfolio_items
  add column if not exists media_type text
    check (media_type in ('photo', 'video', 'avatar', 'tour')),
  add column if not exists orientation text check (orientation in ('9:16', '16:9')),
  add column if not exists category_id text
    references public.media_categories (id) on update cascade on delete set null,
  add column if not exists show_on_work boolean not null default true;

-- Backfill from the current fields.
update public.portfolio_items set
  media_type = case
    when category = 'ai-avatar' then 'avatar'
    when format = 'photo' then 'photo'
    when format = '360' then 'tour'
    else 'video' end,
  orientation = case
    when format = 'long-form' then '16:9'
    when format = 'reel' then '9:16'
    when category = 'ai-avatar' then '9:16'
    else null end,
  category_id = case when category in ('property', 'brand', 'editing') then category else null end
where media_type is null;

update public.portfolio_items i
set show_on_work = exists (
  select 1 from public.portfolio_placements p where p.item_id = i.id and p.placement = 'work');

create table if not exists public.placement_pins (
  section text not null,
  slot int not null check (slot >= 0),
  -- A portfolio item id, or a before/after pair id for the Property shoots hero. No foreign key
  -- for that reason; pins to deleted or unpublished items are skipped when the site renders.
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (section, slot)
);
create index if not exists placement_pins_item on public.placement_pins (item_id);

create table if not exists public.placement_modes (
  section text primary key,
  mode text not null check (mode in ('auto', 'manual')),
  updated_at timestamptz not null default now()
);

-- Current manual placements → pins, in their current order. "home-reels" isn't on any page and
-- "property-hero" (portfolio) was replaced by the before/after slider, so neither is carried over.
insert into public.placement_pins (section, slot, item_id)
select placement,
       (row_number() over (partition by placement order by sort_order, item_id) - 1)::int,
       item_id
from public.portfolio_placements
where placement not in ('home-reels', 'property-hero')
on conflict do nothing;

-- Every section that exists today keeps showing exactly what it shows now until "Reset to
-- automatic". The Work page stays automatic: its pins hold the current order, and anything new
-- with "Show on Work page" on follows them.
insert into public.placement_modes (section, mode)
select s, 'manual' from unnest(array[
  'home-row-production', 'home-row-post', 'home-row-avatars',
  'property-gallery-photo', 'property-gallery-video', 'property-gallery-360',
  'post-service-cards', 'post-hero',
  'avatars-carousel', 'showcase-photos'
]) as s
on conflict (section) do nothing;

-- ---------- row level security: public reads, admins write ----------
alter table public.media_categories enable row level security;
alter table public.placement_pins enable row level security;
alter table public.placement_modes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['media_categories', 'placement_pins', 'placement_modes'] loop
    execute format('create policy "anyone reads" on public.%I for select using (true)', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;
