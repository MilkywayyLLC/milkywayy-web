-- Client portal, Phase 13 (CLIENT_PORTAL_GUIDE §5.6, §6, §7.4; owner decisions 3 Oct 2026):
-- listing share pages (/l/<slug>) and collections (/c/<slug>) made from delivered property
-- shoots, with contact pills, views and WhatsApp/Call taps, pause/expiry, and an admin switch.
--
-- Rules, in the database:
-- * Everyone in an account (Members too) makes share pages from the shoots they can see. Authors
--   and the Owner/Admins edit, pause and delete them. No prices of ours are involved.
-- * The public pages read through share_page() (PORTAL_ADMIN_SECRET; only our server calls it),
--   and only while a page is live: not paused, not past its expiry date, not disabled by us.
-- * Every R2 key a public page signs is pinned to its account or project by a check here, so a
--   client can never point a page at someone else's file.
-- * Media for pages: photos get a web WebP and a share-preview JPEG next to the original; reels
--   get a web MP4 (≤ 40 MB) and a poster, attached by the admin. Downloads stay on the originals.
-- * share_aliases keeps old share-link slugs (Phase 14 may fill it) so /l/ and /c/ can redirect.
-- Additive.

-- ---------- media versions on delivered files ----------
alter table public.project_files
  add column web_key text check (length(web_key) <= 540),
  add column og_key text check (length(og_key) <= 540),
  add column poster_key text check (length(poster_key) <= 540),
  add column web_bytes bigint check (web_bytes >= 0);

-- ---------- branding, contact photos, saved listing details ----------
alter table public.accounts
  add column brand_name text check (length(btrim(brand_name)) between 1 and 80),
  add column brand_logo_key text check (brand_logo_key like 'brands/' || id || '/%'
    and brand_logo_key not like '%..%' and length(brand_logo_key) <= 200);
grant update (brand_name, brand_logo_key) on public.accounts to authenticated;

alter table public.contacts add constraint contacts_photo_key check (photo_url is null
  or (photo_url like 'contacts/' || account_id || '/%' and photo_url not like '%..%'));

-- "The details are saved to the property, so the next share is one tap" (§6.1).
alter table public.projects add column listing_defaults jsonb;

-- ---------- listings, collections, aliases, stats, reports ----------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  title text not null check (length(btrim(title)) between 3 and 120),
  purpose text not null check (purpose in ('sale', 'rent', 'holiday')),
  price numeric(14, 2) not null check (price > 0 and price < 1e12),
  currency text not null default 'AED' check (currency in ('AED', 'USD')),
  location text check (length(location) <= 160),
  property_type text check (length(property_type) <= 40),
  beds text check (length(beds) <= 20),
  baths numeric(3, 1) check (baths >= 0 and baths <= 50),
  size_sqft int check (size_sqft > 0 and size_sqft < 1000000),
  furnishing text check (furnishing in ('furnished', 'unfurnished', 'partly')),
  description text check (length(description) <= 4000),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 12),
  permit_no text check (length(btrim(permit_no)) between 3 and 40),
  permit_qr_key text check (permit_qr_key like 'listings/' || account_id || '/%'
    and permit_qr_key not like '%..%' and length(permit_qr_key) <= 200),
  contact_ids uuid[] not null check (cardinality(contact_ids) between 1 and 2),
  photo_ids uuid[] not null check (cardinality(photo_ids) between 1 and 80),
  reel_id uuid references public.project_files (id) on delete set null,
  video_url text check (video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/'
    and length(video_url) <= 300),
  tour_url text check (tour_url ~ '^https://[^\s]+$' and length(tour_url) <= 500),
  show_brand boolean not null default true,
  status text not null default 'live' check (status in ('live', 'paused')),
  expires_on date,
  disabled_at timestamptz,
  disabled_reason text check (length(disabled_reason) <= 300),
  disabled_by text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_account_idx on public.listings (account_id, created_at desc);
create index listings_project_idx on public.listings (project_id);
create index listings_created_by_idx on public.listings (created_by);
create index listings_reel_idx on public.listings (reel_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  title text not null check (length(btrim(title)) between 3 and 120),
  note text check (length(note) <= 600),
  listing_ids uuid[] not null check (cardinality(listing_ids) between 1 and 30),
  contact_ids uuid[] not null check (cardinality(contact_ids) between 1 and 2),
  status text not null default 'live' check (status in ('live', 'paused')),
  expires_on date,
  disabled_at timestamptz,
  disabled_reason text check (length(disabled_reason) <= 300),
  disabled_by text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_account_idx on public.collections (account_id, created_at desc);
create index collections_created_by_idx on public.collections (created_by);

-- Old share links (the old portal's /l/ and /c/ slugs) → the new pages. Filled at migration.
create table public.share_aliases (
  kind text not null check (kind in ('l', 'c')),
  slug text not null check (slug ~ '^[A-Za-z0-9_-]{1,120}$'),
  listing_id uuid references public.listings (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete cascade,
  source text not null default 'old_portal' check (length(source) <= 40),
  created_at timestamptz not null default now(),
  primary key (kind, slug),
  check ((kind = 'l' and listing_id is not null and collection_id is null)
    or (kind = 'c' and collection_id is not null and listing_id is null))
);
create index share_aliases_listing_idx on public.share_aliases (listing_id);
create index share_aliases_collection_idx on public.share_aliases (collection_id);

-- One row per page per Dubai day. Bots are filtered before anything is counted (the app).
create table public.share_stats (
  listing_id uuid references public.listings (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete cascade,
  day date not null,
  views int not null default 0 check (views >= 0),
  wa_taps int not null default 0 check (wa_taps >= 0),
  call_taps int not null default 0 check (call_taps >= 0),
  check (num_nonnulls(listing_id, collection_id) = 1)
);
create unique index share_stats_listing_day on public.share_stats (listing_id, day) where listing_id is not null;
create unique index share_stats_collection_day on public.share_stats (collection_id, day) where collection_id is not null;

-- "Report this page" on public pages; the admin's Reported filter (§7.4). Clients never read it.
create table public.share_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(listing_id, collection_id) = 1)
);
create index share_reports_listing_idx on public.share_reports (listing_id) where resolved_at is null;
create index share_reports_collection_idx on public.share_reports (collection_id) where resolved_at is null;

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
create trigger collections_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

revoke all on public.listings, public.collections, public.share_aliases, public.share_stats,
  public.share_reports from public, anon, authenticated;
grant select on public.listings, public.collections, public.share_stats to authenticated;

alter table public.listings enable row level security;
alter table public.collections enable row level security;
alter table public.share_aliases enable row level security;
alter table public.share_stats enable row level security;
alter table public.share_reports enable row level security;

-- Same visibility as projects: Owner/Admins and open accounts see all; otherwise your own.
create or replace function private.sees_share(p_account uuid, p_created uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_admin_account_ids())
    or p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids()) and auth.uid() = p_created), false)
$$;
-- Authors and the Owner/Admins change a page.
create or replace function private.edits_share(p_account uuid, p_created uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_admin_account_ids())
    or (p_account in (select private.my_account_ids()) and auth.uid() = p_created), false)
$$;
revoke all on function private.sees_share(uuid, uuid), private.edits_share(uuid, uuid) from public, anon;
grant execute on function private.sees_share(uuid, uuid), private.edits_share(uuid, uuid) to authenticated;

create policy "read visible listings" on public.listings
  for select to authenticated using ((select private.sees_share(account_id, created_by)));
create policy "read visible collections" on public.collections
  for select to authenticated using ((select private.sees_share(account_id, created_by)));
create policy "read stats of visible pages" on public.share_stats
  for select to authenticated
  using (listing_id in (select id from public.listings) or collection_id in (select id from public.collections));
-- share_aliases, share_reports: no client access.

-- ---------- helpers ----------
create or replace function private.dubai_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Dubai')::date $$;

create or replace function private.share_live(p_status text, p_disabled timestamptz, p_expires date)
returns boolean
language sql stable set search_path = '' as $$
  select p_status = 'live' and p_disabled is null and (p_expires is null or p_expires >= private.dubai_today())
$$;

-- "sky-high-3-bed-penthouse-k3x9": readable, and the 4 random characters keep it unguessable
-- enough that nobody walks the list. One namespace for listings, collections and old slugs.
create or replace function private.new_share_slug(p_title text) returns text
language plpgsql volatile set search_path = '' as $$
declare v_base text; v text;
begin
  v_base := btrim(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 48), '-');
  if length(v_base) < 2 then v_base := 'home'; end if;
  loop
    v := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.listings where slug = v)
      and not exists (select 1 from public.collections where slug = v)
      and not exists (select 1 from public.share_aliases where slug = v);
  end loop;
  return v;
end $$;

revoke all on function private.dubai_today(), private.share_live(text, timestamptz, date),
  private.new_share_slug(text) from public, anon, authenticated;

-- ---------- client functions (signed in) ----------

-- Create or edit a listing from a delivered shoot. Returns {id, slug}.
create or replace function public.save_listing(p_id uuid, p_project uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pr public.projects%rowtype; l public.listings%rowtype;
  v_photos uuid[]; v_contacts uuid[]; v_reel uuid; v_high text[]; v_id uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_id is not null then
    select * into l from public.listings where id = p_id;
    if not found or not private.edits_share(l.account_id, l.created_by) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    p_project := l.project_id;
  end if;
  select * into pr from public.projects where id = p_project;
  if not found or not private.sees_project(pr.account_id, pr.created_by, pr.requested_by, pr.assigned_member_ids) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if pr.type <> 'shoot' or pr.status not in ('delivered', 'completed') then
    raise exception 'only delivered shoots get share pages' using errcode = '22023';
  end if;

  v_photos := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'photo_ids', '[]')) x);
  if cardinality(v_photos) = 0 then raise exception 'choose at least one photo' using errcode = '22023'; end if;
  if cardinality(v_photos) <> (select count(distinct u) from unnest(v_photos) u)
    or exists (select 1 from unnest(v_photos) u where u not in (
      select f.id from public.project_files f where f.project_id = pr.id and f.direction = 'out'
        and f.published and f.deleted_at is null and f.kind = 'photos' and f.source = 'r2')) then
    raise exception 'a photo isn''t from this shoot' using errcode = '22023';
  end if;

  v_contacts := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'contact_ids', '[]')) x);
  if cardinality(v_contacts) not between 1 and 2
    or cardinality(v_contacts) <> (select count(distinct u) from unnest(v_contacts) u)
    or exists (select 1 from unnest(v_contacts) u
      where u not in (select c.id from public.contacts c where c.account_id = pr.account_id)) then
    raise exception 'choose one or two of your contacts' using errcode = '22023';
  end if;

  v_reel := nullif(p ->> 'reel_id', '')::uuid;
  if v_reel is not null and not exists (select 1 from public.project_files f where f.id = v_reel
      and f.project_id = pr.id and f.published and f.deleted_at is null and f.web_key is not null
      and f.kind in ('reel', 'long_form')) then
    raise exception 'that video isn''t ready for share pages' using errcode = '22023';
  end if;

  v_high := array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'highlights', '[]')) x
    where btrim(x) <> '');
  if exists (select 1 from unnest(v_high) h where length(h) > 40) then
    raise exception 'keep each highlight under 40 characters' using errcode = '22023';
  end if;

  if p_id is null then
    v_slug := private.new_share_slug(p ->> 'title');
    insert into public.listings (account_id, project_id, slug, title, purpose, price, location,
      property_type, beds, baths, size_sqft, furnishing, description, highlights, permit_no,
      permit_qr_key, contact_ids, photo_ids, reel_id, video_url, tour_url, show_brand, expires_on)
    values (pr.account_id, pr.id, v_slug, btrim(p ->> 'title'), p ->> 'purpose', (p ->> 'price')::numeric,
      nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'property_type'), ''),
      nullif(btrim(p ->> 'beds'), ''), nullif(p ->> 'baths', '')::numeric,
      nullif(p ->> 'size_sqft', '')::int, nullif(p ->> 'furnishing', ''),
      nullif(btrim(p ->> 'description'), ''), v_high, nullif(btrim(p ->> 'permit_no'), ''),
      nullif(p ->> 'permit_qr_key', ''), v_contacts, v_photos, v_reel, nullif(btrim(p ->> 'video_url'), ''),
      nullif(btrim(p ->> 'tour_url'), ''), coalesce((p ->> 'show_brand')::boolean, true),
      nullif(p ->> 'expires_on', '')::date)
    returning id into v_id;
  else
    update public.listings set title = btrim(p ->> 'title'), purpose = p ->> 'purpose',
      price = (p ->> 'price')::numeric, location = nullif(btrim(p ->> 'location'), ''),
      property_type = nullif(btrim(p ->> 'property_type'), ''), beds = nullif(btrim(p ->> 'beds'), ''),
      baths = nullif(p ->> 'baths', '')::numeric, size_sqft = nullif(p ->> 'size_sqft', '')::int,
      furnishing = nullif(p ->> 'furnishing', ''), description = nullif(btrim(p ->> 'description'), ''),
      highlights = v_high, permit_no = nullif(btrim(p ->> 'permit_no'), ''),
      permit_qr_key = nullif(p ->> 'permit_qr_key', ''), contact_ids = v_contacts, photo_ids = v_photos,
      reel_id = v_reel, video_url = nullif(btrim(p ->> 'video_url'), ''),
      tour_url = nullif(btrim(p ->> 'tour_url'), ''), show_brand = coalesce((p ->> 'show_brand')::boolean, true),
      expires_on = nullif(p ->> 'expires_on', '')::date
    where id = p_id returning id, slug into v_id, v_slug;
  end if;
  select slug into v_slug from public.listings where id = v_id;

  -- Saved to the property for next time (everything but the expiry date).
  update public.projects set listing_defaults = (p - 'expires_on') where id = pr.id;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- Create or edit a collection ("3 homes picked for you", §6.3). Returns {id, slug}.
create or replace function public.save_collection(p_id uuid, p_account uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.collections%rowtype; v_listings uuid[]; v_contacts uuid[]; v_id uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_id is not null then
    select * into c from public.collections where id = p_id;
    if not found or not private.edits_share(c.account_id, c.created_by) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    p_account := c.account_id;
  elsif p_account is null or p_account not in (select private.my_account_ids()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_listings := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'listing_ids', '[]')) x);
  if cardinality(v_listings) = 0 then raise exception 'choose at least one listing' using errcode = '22023'; end if;
  if cardinality(v_listings) <> (select count(distinct u) from unnest(v_listings) u)
    or exists (select 1 from unnest(v_listings) u where u not in (
      select l.id from public.listings l where l.account_id = p_account
        and private.sees_share(l.account_id, l.created_by))) then
    raise exception 'a listing isn''t yours to add' using errcode = '22023';
  end if;
  v_contacts := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'contact_ids', '[]')) x);
  if cardinality(v_contacts) not between 1 and 2
    or cardinality(v_contacts) <> (select count(distinct u) from unnest(v_contacts) u)
    or exists (select 1 from unnest(v_contacts) u
      where u not in (select ct.id from public.contacts ct where ct.account_id = p_account)) then
    raise exception 'choose one or two of your contacts' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.collections (account_id, slug, title, note, listing_ids, contact_ids, expires_on)
    values (p_account, private.new_share_slug(p ->> 'title'), btrim(p ->> 'title'),
      nullif(btrim(p ->> 'note'), ''), v_listings, v_contacts, nullif(p ->> 'expires_on', '')::date)
    returning id, slug into v_id, v_slug;
  else
    update public.collections set title = btrim(p ->> 'title'), note = nullif(btrim(p ->> 'note'), ''),
      listing_ids = v_listings, contact_ids = v_contacts, expires_on = nullif(p ->> 'expires_on', '')::date
    where id = p_id returning id, slug into v_id, v_slug;
  end if;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- Pause / resume (p_kind 'l' or 'c').
create or replace function public.set_share_status(p_kind text, p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_created uuid;
begin
  if p_status not in ('live', 'paused') then raise exception 'live or paused' using errcode = '22023'; end if;
  if p_kind = 'l' then select account_id, created_by into v_account, v_created from public.listings where id = p_id;
  elsif p_kind = 'c' then select account_id, created_by into v_account, v_created from public.collections where id = p_id;
  end if;
  if v_account is null or not private.edits_share(v_account, v_created) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind = 'l' then update public.listings set status = p_status where id = p_id;
  else update public.collections set status = p_status where id = p_id; end if;
end $$;

-- Delete for good (stats go with it). Returns the permit QR key so the app can remove the file.
create or replace function public.delete_share(p_kind text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_created uuid; v_key text;
begin
  if p_kind = 'l' then
    select account_id, created_by, permit_qr_key into v_account, v_created, v_key from public.listings where id = p_id;
  elsif p_kind = 'c' then
    select account_id, created_by into v_account, v_created from public.collections where id = p_id;
  end if;
  if v_account is null or not private.edits_share(v_account, v_created) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind = 'l' then
    delete from public.listings where id = p_id;
    -- Keep the QR file while the property's saved details still use it.
    if exists (select 1 from public.listings where permit_qr_key = v_key)
      or exists (select 1 from public.projects where listing_defaults ->> 'permit_qr_key' = v_key) then
      v_key := null;
    end if;
    -- A collection left empty goes too; others just lose this listing.
    update public.collections set listing_ids = array_remove(listing_ids, p_id) where p_id = any (listing_ids)
      and cardinality(listing_ids) > 1;
    delete from public.collections where listing_ids = array[p_id];
  else
    delete from public.collections where id = p_id;
  end if;
  return v_key;
end $$;

revoke all on function public.save_listing(uuid, uuid, jsonb), public.save_collection(uuid, uuid, jsonb),
  public.set_share_status(text, uuid, text), public.delete_share(text, uuid) from public, anon;
grant execute on function public.save_listing(uuid, uuid, jsonb), public.save_collection(uuid, uuid, jsonb),
  public.set_share_status(text, uuid, text), public.delete_share(text, uuid) to authenticated;

-- ---------- public pages (our server only: PORTAL_ADMIN_SECRET) ----------

create or replace function private.share_contacts(p_account uuid, p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role, 'whatsapp', c.whatsapp,
        'email', c.email, 'brn', c.brn, 'photo', c.photo_url) order by u.ord)
      from unnest(p_ids) with ordinality u(id, ord) join public.contacts c on c.id = u.id and c.account_id = p_account),
    -- Contacts deleted since: fall back to the account's default one.
    (select jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role, 'whatsapp', c.whatsapp,
        'email', c.email, 'brn', c.brn, 'photo', c.photo_url))
      from public.contacts c where c.account_id = p_account and c.is_default),
    '[]'::jsonb)
$$;

create or replace function private.share_brand(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', coalesce(a.brand_name, case when a.type = 'company' then a.name end),
    'logo', a.brand_logo_key)
  from public.accounts a where a.id = p_account
$$;

create or replace function private.share_photos(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.r2_key, 'thumb', f.thumb_key,
      'web', f.web_key, 'og', f.og_key) order by u.ord), '[]'::jsonb)
  from unnest(p_ids) with ordinality u(id, ord)
  join public.project_files f on f.id = u.id and f.published and f.deleted_at is null and f.r2_key is not null
$$;

revoke all on function private.share_contacts(uuid, uuid[]), private.share_brand(uuid),
  private.share_photos(uuid[]) from public, anon, authenticated;

-- {state: live | unavailable | moved | missing, ...}. Old slugs come back as "moved" with the new one.
create or replace function public.share_page(p_secret text, p_kind text, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.listings%rowtype; c public.collections%rowtype; v uuid; v_photos jsonb;
begin
  perform private.portal_admin_gate(p_secret, 'share-page');
  if p_kind = 'l' then
    select * into l from public.listings where slug = p_slug;
    if not found then
      select listing_id into v from public.share_aliases where kind = 'l' and slug = p_slug;
      if v is not null then
        return jsonb_build_object('state', 'moved', 'slug', (select slug from public.listings where id = v));
      end if;
      return jsonb_build_object('state', 'missing');
    end if;
    if not private.share_live(l.status, l.disabled_at, l.expires_on) then
      return jsonb_build_object('state', 'unavailable');
    end if;
    v_photos := private.share_photos(l.photo_ids);
    -- Photos deleted at the end of the retention period: the page goes with them.
    if jsonb_array_length(v_photos) = 0 then return jsonb_build_object('state', 'unavailable'); end if;
    return jsonb_build_object('state', 'live',
      'listing', jsonb_build_object('id', l.id, 'slug', l.slug, 'title', l.title, 'purpose', l.purpose,
        'price', l.price, 'currency', l.currency, 'location', l.location, 'property_type', l.property_type,
        'beds', l.beds, 'baths', l.baths, 'size_sqft', l.size_sqft, 'furnishing', l.furnishing,
        'description', l.description, 'highlights', to_jsonb(l.highlights), 'permit_no', l.permit_no,
        'permit_qr', l.permit_qr_key, 'video_url', l.video_url, 'tour_url', l.tour_url),
      'photos', v_photos,
      'reel', (select jsonb_build_object('web', f.web_key, 'poster', f.poster_key) from public.project_files f
        where f.id = l.reel_id and f.published and f.deleted_at is null and f.web_key is not null),
      'contacts', private.share_contacts(l.account_id, l.contact_ids),
      'brand', case when l.show_brand then private.share_brand(l.account_id) end);
  elsif p_kind = 'c' then
    select * into c from public.collections where slug = p_slug;
    if not found then
      select collection_id into v from public.share_aliases where kind = 'c' and slug = p_slug;
      if v is not null then
        return jsonb_build_object('state', 'moved', 'slug', (select slug from public.collections where id = v));
      end if;
      return jsonb_build_object('state', 'missing');
    end if;
    if not private.share_live(c.status, c.disabled_at, c.expires_on) then
      return jsonb_build_object('state', 'unavailable');
    end if;
    return jsonb_build_object('state', 'live',
      'collection', jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'note', c.note),
      -- Only the listings that are live themselves.
      'listings', coalesce((select jsonb_agg(jsonb_build_object('slug', l2.slug, 'title', l2.title,
          'purpose', l2.purpose, 'price', l2.price, 'currency', l2.currency, 'location', l2.location,
          'beds', l2.beds, 'baths', l2.baths, 'size_sqft', l2.size_sqft,
          'photo', private.share_photos(l2.photo_ids[1:1]) -> 0) order by u.ord)
        from unnest(c.listing_ids) with ordinality u(id, ord) join public.listings l2 on l2.id = u.id
        where private.share_live(l2.status, l2.disabled_at, l2.expires_on)
          and jsonb_array_length(private.share_photos(l2.photo_ids[1:1])) > 0), '[]'::jsonb),
      'contacts', private.share_contacts(c.account_id, c.contact_ids),
      'brand', private.share_brand(c.account_id));
  end if;
  raise exception 'l or c' using errcode = '22023';
end $$;

-- Count a view or a WhatsApp/Call tap on a live page (the app has already dropped bots).
create or replace function public.share_track(p_secret text, p_kind text, p_slug text, p_event text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid; v_day date := private.dubai_today();
  v_v int := (p_event = 'view')::int; v_w int := (p_event = 'wa')::int; v_c int := (p_event = 'call')::int;
begin
  perform private.portal_admin_gate(p_secret, 'share-page');
  if p_event is null or p_event not in ('view', 'wa', 'call') then raise exception 'view, wa or call' using errcode = '22023'; end if;
  if p_kind = 'l' then
    select id into v from public.listings where slug = p_slug and private.share_live(status, disabled_at, expires_on);
    if v is null then return false; end if;
    insert into public.share_stats (listing_id, day, views, wa_taps, call_taps) values (v, v_day, v_v, v_w, v_c)
    on conflict (listing_id, day) where listing_id is not null do update
      set views = public.share_stats.views + v_v, wa_taps = public.share_stats.wa_taps + v_w,
        call_taps = public.share_stats.call_taps + v_c;
  elsif p_kind = 'c' then
    select id into v from public.collections where slug = p_slug and private.share_live(status, disabled_at, expires_on);
    if v is null then return false; end if;
    insert into public.share_stats (collection_id, day, views, wa_taps, call_taps) values (v, v_day, v_v, v_w, v_c)
    on conflict (collection_id, day) where collection_id is not null do update
      set views = public.share_stats.views + v_v, wa_taps = public.share_stats.wa_taps + v_w,
        call_taps = public.share_stats.call_taps + v_c;
  else
    return false;
  end if;
  return true;
end $$;

-- "Report this page". At most 20 open reports per page, so nobody can fill the table.
create or replace function public.share_report(p_secret text, p_kind text, p_slug text, p_reason text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.portal_admin_gate(p_secret, 'share-page');
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'say what''s wrong' using errcode = '22023'; end if;
  if p_kind = 'l' then
    select id into v from public.listings where slug = p_slug;
    if v is null or (select count(*) from public.share_reports where listing_id = v and resolved_at is null) >= 20 then
      return false;
    end if;
    insert into public.share_reports (listing_id, reason) values (v, left(btrim(p_reason), 500));
  elsif p_kind = 'c' then
    select id into v from public.collections where slug = p_slug;
    if v is null or (select count(*) from public.share_reports where collection_id = v and resolved_at is null) >= 20 then
      return false;
    end if;
    insert into public.share_reports (collection_id, reason) values (v, left(btrim(p_reason), 500));
  else
    return false;
  end if;
  return true;
end $$;

-- ---------- admin (§7.4) ----------

create or replace function public.portal_admin_shares(
  p_secret text, p_actor text, p_q text default null, p_filter text default null, p_account uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select s.*,
        case when s.disabled_at is not null then 'disabled'
          when s.status = 'paused' then 'paused'
          when s.expires_on is not null and s.expires_on < private.dubai_today() then 'expired'
          else 'live' end as state,
        a.name as account_name
      from (
        select 'l' as kind, l.id, l.account_id, l.slug, l.title, l.status, l.expires_on, l.disabled_at,
          l.disabled_reason, l.created_at,
          (select pr.ref from public.projects pr where pr.id = l.project_id) as project_ref,
          coalesce((select sum(st.views) from public.share_stats st where st.listing_id = l.id), 0) as views,
          coalesce((select sum(st.wa_taps + st.call_taps) from public.share_stats st where st.listing_id = l.id), 0) as taps,
          (select count(*) from public.share_reports r where r.listing_id = l.id and r.resolved_at is null) as reports,
          (select r.reason from public.share_reports r where r.listing_id = l.id and r.resolved_at is null
            order by r.at desc limit 1) as last_report
        from public.listings l
        union all
        select 'c', c.id, c.account_id, c.slug, c.title, c.status, c.expires_on, c.disabled_at,
          c.disabled_reason, c.created_at, null,
          coalesce((select sum(st.views) from public.share_stats st where st.collection_id = c.id), 0),
          coalesce((select sum(st.wa_taps + st.call_taps) from public.share_stats st where st.collection_id = c.id), 0),
          (select count(*) from public.share_reports r where r.collection_id = c.id and r.resolved_at is null),
          (select r.reason from public.share_reports r where r.collection_id = c.id and r.resolved_at is null
            order by r.at desc limit 1)
        from public.collections c
      ) s
      join public.accounts a on a.id = s.account_id
      where (p_account is null or s.account_id = p_account)
        and (v_q is null or lower(s.title) like '%' || v_q || '%' or s.slug like '%' || v_q || '%'
          or lower(a.name) like '%' || v_q || '%')
        and (p_filter is null or p_filter = 'all'
          or (p_filter = 'reported' and s.reports > 0)
          or (p_filter = 'disabled' and s.disabled_at is not null)
          or (p_filter = 'live' and s.disabled_at is null and s.status = 'live'
            and (s.expires_on is null or s.expires_on >= private.dubai_today())))
      order by s.created_at desc
      limit 500
    ) x), '[]'::jsonb);
end $$;

-- Disable (with a reason the client sees) or enable any page. Disabling resolves its reports.
create or replace function public.portal_admin_disable_share(
  p_secret text, p_actor text, p_kind text, p_id uuid, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_title text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_reason is not null and length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if p_kind = 'l' then
    update public.listings set disabled_at = case when p_reason is null then null else now() end,
      disabled_reason = nullif(btrim(p_reason), ''), disabled_by = case when p_reason is null then null else p_actor end
    where id = p_id returning account_id, title into v_account, v_title;
    if p_reason is not null then update public.share_reports set resolved_at = now() where listing_id = p_id and resolved_at is null; end if;
  elsif p_kind = 'c' then
    update public.collections set disabled_at = case when p_reason is null then null else now() end,
      disabled_reason = nullif(btrim(p_reason), ''), disabled_by = case when p_reason is null then null else p_actor end
    where id = p_id returning account_id, title into v_account, v_title;
    if p_reason is not null then update public.share_reports set resolved_at = now() where collection_id = p_id and resolved_at is null; end if;
  end if;
  if v_account is null then raise exception 'no such page' using errcode = '22023'; end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', v_account, 'share page "' || v_title || '" ' ||
      case when p_reason is null then 'enabled' else 'disabled: ' || btrim(p_reason) end);
end $$;

create or replace function public.portal_admin_resolve_reports(p_secret text, p_actor text, p_kind text, p_id uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.share_reports set resolved_at = now()
    where resolved_at is null and ((p_kind = 'l' and listing_id = p_id) or (p_kind = 'c' and collection_id = p_id));
  get diagnostics v = row_count;
  return v;
end $$;

-- Web versions of a delivered file, under projects/<project>/web/<file>: photos get .webp and
-- .og.jpg (made in the admin's browser on upload); reels .mp4 and .poster.jpg. Null clears one.
-- Returns the keys replaced or cleared, so the app removes them from R2.
create or replace function public.portal_admin_set_media(
  p_secret text, p_actor text, p_file uuid, p_web text, p_og text, p_poster text, p_web_bytes bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.project_files%rowtype; v_base text; v_old text[];
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into f from public.project_files where id = p_file and direction = 'out' and deleted_at is null for update;
  if not found then raise exception 'no such file' using errcode = '22023'; end if;
  v_base := 'projects/' || f.project_id || '/web/' || f.id;
  if f.kind = 'photos' then
    if (p_web is not null and p_web <> v_base || '.webp') or (p_og is not null and p_og <> v_base || '.og.jpg')
      or p_poster is not null then
      raise exception 'wrong key for a photo' using errcode = '22023';
    end if;
  elsif f.kind in ('reel', 'long_form') then
    if (p_web is not null and p_web <> v_base || '.mp4') or (p_poster is not null and p_poster <> v_base || '.poster.jpg')
      or p_og is not null then
      raise exception 'wrong key for a video' using errcode = '22023';
    end if;
    if p_web_bytes > 41943040 then raise exception 'web version over 40 MB' using errcode = '22023'; end if;
  else
    raise exception 'only photos and videos get web versions' using errcode = '22023';
  end if;
  v_old := array_remove(array[
    case when f.web_key is distinct from p_web then f.web_key end,
    case when f.og_key is distinct from p_og then f.og_key end,
    case when f.poster_key is distinct from p_poster then f.poster_key end], null);
  update public.project_files set web_key = p_web, og_key = p_og, poster_key = p_poster,
    web_bytes = case when p_web is null then null else p_web_bytes end
  where id = p_file;
  return to_jsonb(v_old);
end $$;

revoke all on function public.share_page(text, text, text), public.share_track(text, text, text, text),
  public.share_report(text, text, text, text),
  public.portal_admin_shares(text, text, text, text, uuid),
  public.portal_admin_disable_share(text, text, text, uuid, text),
  public.portal_admin_resolve_reports(text, text, text, uuid),
  public.portal_admin_set_media(text, text, uuid, text, text, text, bigint) from public;
grant execute on function public.share_page(text, text, text), public.share_track(text, text, text, text),
  public.share_report(text, text, text, text),
  public.portal_admin_shares(text, text, text, text, uuid),
  public.portal_admin_disable_share(text, text, text, uuid, text),
  public.portal_admin_resolve_reports(text, text, text, uuid),
  public.portal_admin_set_media(text, text, uuid, text, text, text, bigint) to anon, authenticated;
