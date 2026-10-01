-- milkywayy.com website: content, pricing, settings, leads (guide §18.4).
-- Public visitors (anon) can only read published content; only admins (listed in `admins`) can
-- write. Editors manage content; prices, settings, leads and admins are Owner-only (guide §18.1).

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.admins (
  email text primary key,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

-- Role of the signed-in user, or null. SECURITY DEFINER so policies can read `admins` safely.
create or replace function public.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admins where email = lower(auth.jwt() ->> 'email')
$$;
create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$ select public.admin_role() is not null $$;
create or replace function public.is_owner() returns boolean
language sql stable set search_path = public as $$ select public.admin_role() = 'owner' $$;

-- ---------- content ----------
create table public.portfolio_items (
  id text primary key,
  title text not null,
  client text,
  category text not null check (category in ('property', 'brand', 'ai-avatar', 'editing')),
  format text not null check (format in ('photo', 'reel', 'long-form', '360')),
  media jsonb not null,
  duration text,
  tag text,
  meta text,
  featured boolean not null default false,
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_placements (
  item_id text not null references public.portfolio_items (id) on delete cascade,
  placement text not null,
  sort_order int not null default 0,
  primary key (item_id, placement)
);

create table public.case_studies (
  id text primary key,
  slug text not null unique,
  client text not null,
  title text not null,
  hero_lines text[],
  summary text not null,
  brief text not null,
  what_we_did text[] not null default '{}',
  results jsonb not null default '[]',
  quote jsonb,
  cover jsonb not null,
  gallery jsonb not null default '[]',
  related text[] not null default '{}',
  category text not null,
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.before_after (
  id text primary key,
  tab text not null,
  title text not null,
  description text not null,
  before jsonb not null,
  after jsonb not null,
  placeholder_before_filter text,
  in_hero boolean not null default false,
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.avatars (
  id text primary key,
  name text not null,
  niche text not null,
  poster jsonb not null,
  clip text,
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id text primary key,
  name text,
  role text not null,
  company text,
  rating int not null default 5 check (rating between 1 and 5),
  text text not null,
  source text not null default 'google' check (source in ('google', 'other')),
  link text,
  placements text[] not null default '{}',
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faqs (
  id text primary key,
  page text not null,
  question text not null,
  answer text not null,
  draft boolean not null default true,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stats (
  id text primary key,
  value text not null,
  label text not null,
  label_by_placement jsonb not null default '{}',
  placement_order jsonb not null default '{}',
  placements text[] not null default '{}',
  sample boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id text primary key,
  name text not null,
  logo text,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proof_strip_pages (
  page text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.seo_pages (
  page text primary key,
  title text,
  description text,
  og_image text,
  updated_at timestamptz not null default now()
);

-- ---------- pricing ----------
create table public.pricing_property (
  type text not null check (type in ('apartment', 'villa')),
  size_index int not null,
  size_label text not null,
  service text not null check (service in ('photo', 'short', 'lf_day', 'lf_night', 'lf_day_night', 'tour')),
  price int not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (type, size_index, service)
);

create table public.pricing_commercial_tiers (
  tier_index int primary key,
  label text not null,
  description text not null,
  popular boolean not null default false,
  photo int not null,
  short int not null,
  long int,            -- null = not available in this tier
  tour int,            -- null = not available in this tier
  photos text not null,
  reel text not null,
  walkthrough text,    -- null = "Not included"
  tour_hotspots text,  -- null = "Not included"
  updated_at timestamptz not null default now()
);

create table public.pricing_twilight (
  grp text not null check (grp in ('standard', 'villa')),
  qty int not null check (qty in (5, 10, 20)),
  price int not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (grp, qty)
);

-- Labels, default sizes, delivery times, production/post-production/AI pricing (JSON blobs).
create table public.pricing_other (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- settings ----------
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- leads (written by /api/lead with the service role; Phase 6) ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  type text not null check (type in ('production', 'property', 'post', 'avatars', 'contact', 'free-test')),
  name text,
  company text,
  phone text,
  email text,
  preferred_reply text,
  data jsonb not null default '{}',     -- every form field, builder state + estimate at the time
  page text,
  utm jsonb not null default '{}',
  referrer text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_created_at_idx on public.leads (created_at desc);
-- A future `bookings` table will reference leads(id) (guide §18.5).

create table public.change_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_email text,
  entity text not null,
  entity_id text,
  action text not null check (action in ('create', 'update', 'delete', 'reorder', 'publish', 'unpublish')),
  summary text
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array[
    'portfolio_items', 'case_studies', 'before_after', 'avatars', 'reviews', 'faqs', 'stats',
    'clients', 'proof_strip_pages', 'seo_pages', 'pricing_property', 'pricing_commercial_tiers',
    'pricing_twilight', 'pricing_other', 'site_settings', 'leads'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t);
  end loop;
end $$;

-- ---------- row level security ----------
alter table public.admins enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.portfolio_placements enable row level security;
alter table public.case_studies enable row level security;
alter table public.before_after enable row level security;
alter table public.avatars enable row level security;
alter table public.reviews enable row level security;
alter table public.faqs enable row level security;
alter table public.stats enable row level security;
alter table public.clients enable row level security;
alter table public.proof_strip_pages enable row level security;
alter table public.seo_pages enable row level security;
alter table public.pricing_property enable row level security;
alter table public.pricing_commercial_tiers enable row level security;
alter table public.pricing_twilight enable row level security;
alter table public.pricing_other enable row level security;
alter table public.site_settings enable row level security;
alter table public.leads enable row level security;
alter table public.change_log enable row level security;

-- Content with a published flag: everyone reads published rows; admins read and write all.
do $$
declare t text;
begin
  foreach t in array array[
    'portfolio_items', 'case_studies', 'before_after', 'avatars', 'reviews', 'faqs', 'stats', 'clients'
  ] loop
    execute format('create policy "public reads published" on public.%I for select using (published)', t);
    execute format('create policy "admins read all" on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Placements follow their item's visibility.
create policy "public reads placements of published items" on public.portfolio_placements
  for select using (exists (select 1 from public.portfolio_items i where i.id = item_id and i.published));
create policy "admins write placements" on public.portfolio_placements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Content without a published flag: public read; editors and owners write.
create policy "public reads proof strip" on public.proof_strip_pages for select using (true);
create policy "admins write proof strip" on public.proof_strip_pages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public reads seo" on public.seo_pages for select using (true);
create policy "admins write seo" on public.seo_pages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Prices and settings: public read; Owner-only write.
do $$
declare t text;
begin
  foreach t in array array[
    'pricing_property', 'pricing_commercial_tiers', 'pricing_twilight', 'pricing_other', 'site_settings'
  ] loop
    execute format('create policy "public reads" on public.%I for select using (true)', t);
    execute format('create policy "owner writes" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- Leads: Owner only (the lead route inserts with the service role, which bypasses RLS).
create policy "owner manages leads" on public.leads
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Admins: everyone signed in can see their own row; Owner manages the list.
create policy "admins see themselves" on public.admins
  for select to authenticated using (email = lower(auth.jwt() ->> 'email') or public.is_owner());
create policy "owner manages admins" on public.admins
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Change log: admins read and append.
create policy "admins read change log" on public.change_log for select to authenticated using (public.is_admin());
create policy "admins append change log" on public.change_log for insert to authenticated with check (public.is_admin());

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 15728640), ('private', 'private', false, 15728640)
on conflict (id) do nothing;

create policy "public reads media" on storage.objects for select using (bucket_id = 'media');
create policy "admins write media" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
create policy "admins use private" on storage.objects for all to authenticated
  using (bucket_id = 'private' and public.is_admin()) with check (bucket_id = 'private' and public.is_admin());

-- The first Owner (guide §16 ADMIN_ALLOWED_EMAILS).
insert into public.admins (email, role) values ('hello@milkywayy.com', 'owner') on conflict do nothing;
