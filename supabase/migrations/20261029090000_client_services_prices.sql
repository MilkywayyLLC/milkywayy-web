-- Client services, price lists and packages (owner, 17 Oct 2026). Extends billing; nothing rebuilt.
--
-- * Services per client: Production (shoots), Post-production (editing), AI avatars. A disabled
--   service can't be booked: checked in the database on every client-created project and character.
-- * A client price list: every rate-card service with its default and this client's price (blank =
--   default). A saved price applies from today; logged items keep the price they were logged at.
-- * Monthly packages are the client's own copy (a template only prefills it): amount, term, start,
--   billed in advance or at month end, and inclusions (service × quantity per month).
-- * Every logged item is "Included" (AED 0, counts down this month's inclusion) while the package
--   has that service left, else an "Extra" at the client's price. Month end = package + extras.
-- * Booking: "Shot & edited" or "Shoot only (raw files)"; Morning / Afternoon / Full day is
--   scheduling only, with an optional preferred start time.
-- Additive (new columns, rows and functions; replaced functions keep their behaviour otherwise).

-- ---------- services per client ----------
alter table public.accounts
  add column svc_production boolean not null default true,
  add column svc_post boolean not null default false,
  add column svc_avatars boolean not null default false;
-- Existing clients keep what they already use.
update public.accounts a set svc_post = true
  where 'post' = any (a.services_interest)
    or exists (select 1 from public.projects p where p.account_id = a.id and p.type = 'edit');
update public.accounts a set svc_avatars = true
  where 'avatars' = any (a.services_interest)
    or exists (select 1 from public.projects p where p.account_id = a.id and p.type = 'avatar')
    or exists (select 1 from public.ai_characters c where c.account_id = a.id);

create or replace function private.service_on(p_account uuid, p_service text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_service when 'production' then a.svc_production when 'post' then a.svc_post
    when 'avatars' then a.svc_avatars else false end
  from public.accounts a where a.id = p_account
$$;

-- A signed-in client (not Milkywayy's admin functions or the website) creating work.
create or replace function private.by_client() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' = 'authenticated'
$$;

create or replace function private.guard_project_service() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_svc text := case new.type when 'shoot' then 'production' when 'edit' then 'post'
  when 'avatar' then 'avatars' end;
begin
  if new.account_id is not null and v_svc is not null and private.by_client()
      and not coalesce(private.service_on(new.account_id, v_svc), false) then
    raise exception 'that service isn''t enabled for your account' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger projects_service_enabled before insert on public.projects
  for each row execute function private.guard_project_service();

create or replace function private.guard_character_service() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.by_client() and not coalesce(private.service_on(new.account_id, 'avatars'), false) then
    raise exception 'that service isn''t enabled for your account' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger ai_characters_service_enabled before insert on public.ai_characters
  for each row execute function private.guard_character_service();
revoke all on function private.service_on(uuid, text), private.by_client(),
  private.guard_project_service(), private.guard_character_service() from public, anon, authenticated;

create or replace function public.portal_admin_set_services(p_secret text, p_actor text, p_account uuid,
  p_production boolean, p_post boolean, p_avatars boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set svc_production = coalesce(p_production, svc_production),
    svc_post = coalesce(p_post, svc_post), svc_avatars = coalesce(p_avatars, svc_avatars)
  where id = p_account;
  if not found then raise exception 'no such client' using errcode = '22023'; end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Services: production ' || coalesce(p_production::text, '-')
      || ', post ' || coalesce(p_post::text, '-') || ', avatars ' || coalesce(p_avatars::text, '-'));
end $$;

-- ---------- the rate card as a client price list ----------
-- grp: which block of the price list a service sits in (null = internal, not listed).
-- includes: what the price covers, shown beside it.
alter table public.rate_card
  add column grp text check (grp in ('property', 'production', 'post', 'avatars')),
  add column includes text check (length(includes) <= 80);

-- Property shoot, shot & edited: blank defaults mean "the website price list" (by size).
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort) values
  ('prop_photo_apt_0', 'Photos · Apartment, size 1', 'shoot', null, null, 100),
  ('prop_photo_apt_1', 'Photos · Apartment, size 2', 'shoot', null, null, 101),
  ('prop_photo_apt_2', 'Photos · Apartment, size 3', 'shoot', null, null, 102),
  ('prop_photo_apt_3', 'Photos · Apartment, size 4', 'shoot', null, null, 103),
  ('prop_photo_apt_4', 'Photos · Apartment, size 5', 'shoot', null, null, 104),
  ('prop_photo_apt_5', 'Photos · Apartment, size 6', 'shoot', null, null, 105),
  ('prop_photo_villa_0', 'Photos · Villa, size 1', 'shoot', null, null, 110),
  ('prop_photo_villa_1', 'Photos · Villa, size 2', 'shoot', null, null, 111),
  ('prop_photo_villa_2', 'Photos · Villa, size 3', 'shoot', null, null, 112),
  ('prop_photo_villa_3', 'Photos · Villa, size 4', 'shoot', null, null, 113),
  ('prop_photo_villa_4', 'Photos · Villa, size 5', 'shoot', null, null, 114),
  ('prop_photo_villa_5', 'Photos · Villa, size 6', 'shoot', null, null, 115),
  ('prop_short', 'Videography · short-form', 'video', null, null, 120),
  ('prop_long', 'Videography · long-form', 'video', null, null, 121),
  ('prop_tour', '360° tour', 'tour', null, null, 122),
  ('prop_twilight', 'Twilight photo', 'image', null, null, 123),
  ('prop_raw', 'Property shoot, shoot only', 'shoot', null, null, 130)
on conflict (key) do nothing;
update public.rate_card set grp = 'property', includes = 'Shoot + edit' where key like 'prop\_%' and key <> 'prop_raw';
update public.rate_card set grp = 'production', includes = 'Shoot only, raw files', sort = 130 where key = 'prop_raw';
update public.rate_card set grp = 'production', includes = 'Shoot + edit', label = 'Reel, shot & edited', sort = 140
  where key = 'reel_shoot';
update public.rate_card set grp = 'production', includes = 'Shoot + edit', label = 'Long-form, shot & edited', sort = 141
  where key = 'long_form_shoot';
update public.rate_card set grp = 'production', includes = 'Shoot only, raw files',
  label = 'Shoot only · half day (morning or afternoon)', sort = 150 where key = 'half_day';
update public.rate_card set grp = 'production', includes = 'Shoot only, raw files',
  label = 'Shoot only · full day', sort = 151 where key = 'full_day';
update public.rate_card set grp = 'post', includes = 'Edit only (you send the files)', label = 'HDR photo edit', sort = 160
  where key = 'photo';
update public.rate_card set grp = 'post', includes = 'Edit only (you send the files)', label = 'Short-form edit', sort = 161
  where key = 'reel';
update public.rate_card set grp = 'post', includes = 'Edit only (you send the files)', label = 'Long-form edit', sort = 162
  where key = 'long_form';
update public.rate_card set grp = 'avatars', includes = 'AI', label = 'AI character creation', sort = 170
  where key = 'avatar_setup';
update public.rate_card set grp = 'avatars', includes = 'AI', label = 'AI avatar · short video', sort = 171
  where key = 'avatar_short';
update public.rate_card set grp = 'avatars', includes = 'AI', label = 'AI avatar · long video', sort = 172
  where key = 'avatar_long';

-- "Back to default" from a date: a dated row without an amount.
alter table public.client_rates alter column amount drop not null;

-- The dated client price in force (null amount = the default from then), else the standing
-- override, else the rate card in their currency.
create or replace function private.rate_on(p_account uuid, p_key text, p_date date) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare v_found boolean := false; v_amount numeric;
begin
  select true, r.amount into v_found, v_amount from public.client_rates r
    where r.account_id = p_account and r.key = p_key and r.effective_from <= p_date
    order by r.effective_from desc, r.created_at desc limit 1;
  if v_found and v_amount is not null then return v_amount; end if;
  if not coalesce(v_found, false) then
    select o.amount into v_amount from public.rate_overrides o where o.account_id = p_account and o.key = p_key;
    if v_amount is not null then return v_amount; end if;
  end if;
  return (select case a.currency when 'USD' then c.amount_usd else c.amount_aed end
    from public.rate_card c, public.accounts a where c.key = p_key and a.id = p_account);
end $$;

-- The client's own price (their price, not the default) in force today, or null.
create or replace function private.client_price(p_account uuid, p_key text) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare v_found boolean := false; v_amount numeric; v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select true, r.amount into v_found, v_amount from public.client_rates r
    where r.account_id = p_account and r.key = p_key and r.effective_from <= v_today
    order by r.effective_from desc, r.created_at desc limit 1;
  if coalesce(v_found, false) then return v_amount; end if;
  return (select o.amount from public.rate_overrides o where o.account_id = p_account and o.key = p_key);
end $$;

-- Save the whole price list: [{key, amount|null}]. Only changed prices are written, from today.
create or replace function public.portal_admin_save_client_prices(p_secret text, p_actor text, p_account uuid,
  p_prices jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare x jsonb; v_key text; v_amount numeric; v_n int := 0; v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) > 100 then
    raise exception 'prices must be a list' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'no such client' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_prices) loop
    v_key := x ->> 'key';
    if not exists (select 1 from public.rate_card where key = v_key and grp is not null) then
      raise exception 'unknown service %', v_key using errcode = '22023';
    end if;
    v_amount := nullif(x ->> 'amount', '')::numeric;
    if v_amount is not null and (v_amount < 0 or v_amount > 10000000) then
      raise exception 'prices of 0 or more' using errcode = '22023';
    end if;
    v_amount := round(v_amount, 2);
    if v_amount is distinct from private.client_price(p_account, v_key) then
      insert into public.client_rates (account_id, key, amount, effective_from, created_by)
        values (p_account, v_key, v_amount, v_today, p_actor)
      on conflict (account_id, key, effective_from) do update set amount = excluded.amount,
        created_by = excluded.created_by, created_at = now();
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 then
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'update', p_account, 'Price list: ' || v_n || ' price' || case when v_n = 1 then '' else 's' end
        || ' from ' || v_today);
  end if;
  return v_n;
end $$;

-- ---------- packages: billed in advance too ----------
create or replace function public.portal_admin_set_billing_switches(p_secret text, p_actor text, p_account uuid,
  p_show_budget boolean, p_payg_invoicing text, p_advance boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_payg_invoicing is not null and p_payg_invoicing not in ('per_project', 'month_end') then
    raise exception 'unknown invoicing' using errcode = '22023';
  end if;
  update public.accounts set show_budget = p_show_budget,
    payg_invoicing = coalesce(p_payg_invoicing, payg_invoicing) where id = p_account;
  if p_advance is not null then
    update public.account_plans set bill_in_advance = p_advance, updated_at = now()
      where account_id = p_account and mode in ('budget', 'package');
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Billing switches');
end $$;

-- The inclusion kinds a package may count: the listed services, plus a whole property shoot.
create or replace function private.inclusion_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_key = 'shoot' or exists (select 1 from public.rate_card where key = p_key and grp is not null
    and key not like 'prop\_photo\_%' and key not in ('prop_short', 'prop_long', 'prop_tour', 'prop_twilight'))
$$;

-- A client's monthly package, saved as their own package (a template only prefills it, and is
-- never changed): {template_id?, name?, amount, term, started, ends?, advance, inclusions}.
create or replace function public.portal_admin_save_client_package(p_secret text, p_actor text, p_account uuid,
  p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; t public.packages%rowtype; v uuid;
  v_amount numeric := nullif(p ->> 'amount', '')::numeric; v_term int := coalesce(nullif(p ->> 'term', '')::int, 1);
  v_start date := nullif(p ->> 'started', '')::date; v_ends date := nullif(p ->> 'ends', '')::date;
  v_inc jsonb := coalesce(p -> 'inclusions', '[]'::jsonb); v_clean jsonb := '[]'::jsonb; i jsonb; v_name text;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  if a.id is null then raise exception 'no such client' using errcode = '22023'; end if;
  if v_amount is null or v_amount < 0 then raise exception 'enter the monthly amount' using errcode = '22023'; end if;
  if v_start is null then raise exception 'choose the start date' using errcode = '22023'; end if;
  if v_term not in (1, 6) then raise exception 'term is monthly or 6 months' using errcode = '22023'; end if;
  if jsonb_typeof(v_inc) <> 'array' or jsonb_array_length(v_inc) > 30 then
    raise exception 'inclusions must be a list (30 at most)' using errcode = '22023';
  end if;
  for i in select * from jsonb_array_elements(v_inc) loop
    if not private.inclusion_key_ok(i ->> 'key') then
      raise exception 'unknown service in the inclusions' using errcode = '22023';
    end if;
    if coalesce(nullif(i ->> 'qty', '')::numeric, 0) <= 0 or (i ->> 'qty')::numeric <> trunc((i ->> 'qty')::numeric)
      or (i ->> 'qty')::numeric > 10000 then
      raise exception 'each inclusion needs a whole quantity above 0' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_clean) c where c ->> 'key' = i ->> 'key') then
      raise exception 'each service once in the inclusions' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('key', i ->> 'key',
      'label', coalesce(nullif(left(btrim(coalesce(i ->> 'label', '')), 60), ''),
        (select label from public.rate_card where key = i ->> 'key'), 'Property shoot'),
      'qty', (i ->> 'qty')::numeric));
  end loop;
  if nullif(p ->> 'template_id', '') is not null then
    select * into t from public.packages where id = (p ->> 'template_id')::uuid and account_id is null;
  end if;
  v_name := coalesce(nullif(left(btrim(coalesce(p ->> 'name', '')), 60), ''), t.name, 'Monthly package');
  select * into pl from public.account_plans where account_id = p_account;
  -- Edit the client's own package in place; never a template or another client's.
  select id into v from public.packages where id = pl.package_id and account_id = p_account;
  if v is null then
    insert into public.packages (account_id, name, monthly_price, currency, inclusions, overage, visible,
      six_month_discount_pct, suggest)
    values (p_account, v_name, round(v_amount, 2), a.currency, v_clean, '[]', false, 0, false)
    returning id into v;
  else
    update public.packages set name = v_name, monthly_price = round(v_amount, 2), currency = a.currency,
      inclusions = v_clean, six_month_discount_pct = 0, updated_at = now()
    where id = v;
  end if;
  insert into public.account_plans (account_id, mode, package_id, started_on, renews_on, term_months, ends_on,
    bill_in_advance)
  values (p_account, 'package', v, v_start, (date_trunc('month', v_start) + interval '1 month')::date, v_term,
    case when v_term = 6 then v_ends end, coalesce((p ->> 'advance')::boolean, false))
  on conflict (account_id) do update set mode = 'package', package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, term_months = excluded.term_months,
    ends_on = excluded.ends_on, bill_in_advance = excluded.bill_in_advance, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Monthly package ' || v_name || ': ' || round(v_amount, 2) || ' ' || a.currency
      || ', ' || jsonb_array_length(v_clean) || ' inclusions');
  return v;
end $$;

-- Everything the client page's Services / Price list / Plan blocks need.
create or replace function public.portal_admin_client_setup(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  if a.id is null then return null; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into k from public.packages where id = pl.package_id;
  return jsonb_build_object(
    'currency', a.currency,
    'services', jsonb_build_object('production', a.svc_production, 'post', a.svc_post, 'avatars', a.svc_avatars),
    'payg_invoicing', a.payg_invoicing,
    'prices', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'label', r.label, 'unit', r.unit,
        'grp', r.grp, 'includes', r.includes,
        'default', case a.currency when 'USD' then r.amount_usd else r.amount_aed end,
        'client', private.client_price(p_account, r.key)) order by r.sort, r.key)
      from public.rate_card r where r.grp is not null), '[]'::jsonb),
    'plan', jsonb_build_object('mode', coalesce(pl.mode, 'payg'), 'package_id', pl.package_id,
      'own', k.account_id is not null, 'name', k.name, 'amount', k.monthly_price,
      'inclusions', coalesce(k.inclusions, '[]'::jsonb), 'term', coalesce(pl.term_months, 1),
      'started_on', pl.started_on, 'ends_on', pl.ends_on, 'advance', coalesce(pl.bill_in_advance, false)),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name,
        'price', private.pkg_price(x.id, a.currency), 'inclusions', x.inclusions) order by x.name)
      from public.packages x where x.account_id is null and private.pkg_price(x.id, a.currency) is not null), '[]'::jsonb));
end $$;

-- ---------- included or extra, item by item ----------
alter table public.line_items add column included boolean;

-- The day an item counts in: its service day, else delivery, else when it was logged.
create or replace function private.item_day(p_service date, p_delivered timestamptz, p_created timestamptz)
returns date
language sql immutable set search_path = '' as $$
  select coalesce(p_service, (p_delivered at time zone 'Asia/Dubai')::date, (p_created at time zone 'Asia/Dubai')::date)
$$;

-- Before an item is stored: on a package with that service left this month, it's Included (price 0,
-- and the part beyond what's left becomes a separate Extra); otherwise an Extra at its price.
-- Manual and overridden prices are Milkywayy's call: always Extra.
create or replace function private.apply_inclusions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text := coalesce(new.kind, new.rate_key); v_day date; v_pm jsonb; v_qty numeric; v_used numeric;
  v_left numeric; v_rate numeric; pl public.account_plans%rowtype;
begin
  if new.included is not null or new.account_id is null then return new; end if;
  new.included := false;
  if new.price_basis in ('override', 'manual') or v_key is null then return new; end if;
  select * into pl from public.account_plans where account_id = new.account_id;
  if pl.mode is distinct from 'package' then return new; end if;
  v_day := coalesce(new.service_date, (now() at time zone 'Asia/Dubai')::date);
  new.service_date := v_day;
  v_pm := private.package_month(new.account_id, v_day);
  if v_pm is null or v_day < (v_pm ->> 'period_start')::date then return new; end if;
  select (i ->> 'qty')::numeric into v_qty from jsonb_array_elements(v_pm -> 'inclusions') i
    where i ->> 'key' = v_key limit 1;
  if v_qty is null then return new; end if;
  select coalesce(sum(li.qty), 0) into v_used from public.line_items li
    left join public.projects p on p.id = li.project_id
    where li.account_id = new.account_id and li.included and coalesce(li.kind, li.rate_key) = v_key
      and private.item_day(li.service_date, p.delivered_at, li.created_at) >= (v_pm ->> 'period_start')::date
      and private.item_day(li.service_date, p.delivered_at, li.created_at) < (v_pm ->> 'renews_on')::date;
  v_left := greatest(v_qty - v_used, 0);
  -- A package's own extra rate for this service, if it has one; else the client's price as logged.
  select nullif(o ->> 'amount', '')::numeric into v_rate
    from public.packages k, jsonb_array_elements(k.overage) o
    where k.id = pl.package_id and o ->> 'key' = v_key limit 1;
  if v_left <= 0 then
    new.unit_price := coalesce(v_rate, new.unit_price);
    return new;
  end if;
  if new.qty > v_left then
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, override_reason, logged, sort, included)
    values (new.project_id, new.account_id, new.description, new.qty - v_left, coalesce(v_rate, new.unit_price),
      new.currency, new.kind, new.delivered_month, new.service_date, new.rate_key, new.price_basis, new.list_price,
      new.override_reason, new.logged, new.sort, false);
    new.qty := v_left;
  end if;
  new.included := true;
  new.list_price := coalesce(new.list_price, new.unit_price);
  new.unit_price := 0;
  return new;
end $$;
-- After line_items_kind (triggers fire in name order), so the kind is known.
create trigger line_items_package_inclusions before insert on public.line_items
  for each row execute function private.apply_inclusions();
revoke all on function private.apply_inclusions(), private.item_day(date, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Usage over a range: Included items count down each inclusion; everything else is an Extra at
-- the price it was logged at (no separate overage charge any more).
create or replace function private.package_usage(p_account uuid, p_pkg uuid, p_inclusions jsonb,
  p_cur text, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select li.*, p.ref from public.line_items li left join public.projects p on p.id = li.project_id
    where li.account_id = p_account
      and private.item_day(li.service_date, p.delivered_at, li.created_at) >= p_from
      and private.item_day(li.service_date, p.delivered_at, li.created_at) < p_to
  ), usage as (
    select t.ord, t.i ->> 'key' as key, t.i ->> 'label' as label, (t.i ->> 'qty')::numeric as qty,
      coalesce((select sum(it.qty) from items it where coalesce(it.kind, it.rate_key) = t.i ->> 'key'
        and coalesce(it.included, false)), 0) as used,
      coalesce((select sum(it.qty) from items it where coalesce(it.kind, it.rate_key) = t.i ->> 'key'
        and not coalesce(it.included, false)), 0) as extra,
      private.rate_for(p_account, t.i ->> 'key') as rate
    from jsonb_array_elements(p_inclusions) with ordinality t(i, ord)
  ), extras as (
    select it.* from items it where not coalesce(it.included, false)
  )
  select jsonb_build_object(
    'usage', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'qty', qty,
        'used', used, 'remaining', greatest(qty - used, 0), 'over', extra,
        'rate', rate, 'overage', 0) order by ord)
      from usage), '[]'::jsonb),
    'overage_total', 0,
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'description', description, 'qty', qty,
        'unit_price', unit_price, 'kind', kind, 'ref', ref) order by created_at) from extras), '[]'::jsonb),
    'extras_total', coalesce((select round(sum(qty * unit_price), 2) from extras), 0))
$$;

-- One package month (calendar): as before, with "before the package" by the same item day.
create or replace function private.package_month(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_month date := date_trunc('month', p_month)::date; v_next date; v_start date; v_frac numeric;
  v_full numeric; v_price numeric; v_cur text; v_inc jsonb; u jsonb; v_first date; v_ends date;
  v_no int; v_age interval; v_before jsonb; v_before_total numeric;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null then return null; end if;
  select * into a from public.accounts where id = p_account;
  v_next := (v_month + interval '1 month')::date;
  v_start := greatest(v_month, coalesce(pl.started_on, v_month));
  if v_start >= v_next then return null; end if;
  v_frac := (v_next - v_start)::numeric / (v_next - v_month);
  v_full := private.pkg_price(k.id, a.currency);
  v_cur := (case when v_full is null then k.currency else a.currency end);
  v_full := round(coalesce(v_full, k.monthly_price)
    * (case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end), 2);
  v_price := round(v_full * v_frac, 2);
  select coalesce(jsonb_agg(jsonb_set(t.i, '{qty}', to_jsonb(
      (case when v_frac < 1 then round((t.i ->> 'qty')::numeric * v_frac) else (t.i ->> 'qty')::numeric end)))
      order by t.ord), '[]'::jsonb)
    into v_inc
  from jsonb_array_elements(k.inclusions) with ordinality t(i, ord);
  u := private.package_usage(p_account, k.id, v_inc, v_cur, v_start, v_next);
  select coalesce(jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by li.created_at), '[]'::jsonb),
    coalesce(round(sum(li.qty * li.unit_price), 2), 0)
    into v_before, v_before_total
  from public.line_items li left join public.projects p on p.id = li.project_id
  where li.account_id = p_account
    and private.item_day(li.service_date, p.delivered_at, li.created_at) >= v_month
    and private.item_day(li.service_date, p.delivered_at, li.created_at) < v_start;
  v_first := (case when pl.started_on is null or extract(day from pl.started_on) = 1
    then coalesce(pl.started_on, v_month)
    else (date_trunc('month', pl.started_on) + interval '1 month')::date end);
  v_ends := coalesce(pl.ends_on, (case when pl.term_months = 6
    then (v_first + interval '6 months' - interval '1 day')::date end));
  if v_month < v_first then
    v_no := null;
  else
    v_age := age(v_month, v_first);
    v_no := (extract(year from v_age) * 12 + extract(month from v_age))::int + 1;
  end if;
  return jsonb_build_object('name', k.name, 'currency', v_cur, 'full_price', v_full, 'price', v_price,
    'prorated', v_frac < 1, 'days', v_next - v_start, 'month_days', v_next - v_month,
    'inclusions', v_inc, 'term_months', pl.term_months,
    'discount_pct', (case when pl.term_months = 6 then k.six_month_discount_pct end),
    'month_no', v_no, 'started_on', pl.started_on, 'ends_on', v_ends, 'month', v_month,
    'period_start', v_start, 'renews_on', v_next, 'advance', pl.bill_in_advance)
    || u || jsonb_build_object('before', v_before, 'before_total', v_before_total,
      'estimate', v_price + (u ->> 'extras_total')::numeric + v_before_total);
end $$;

-- Month-end lines: a package is its amount (unless billed in advance) plus each Extra item;
-- billed in advance, the advance invoice is the package amount alone.
create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb;
begin
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  if pl.mode = 'budget' then
    v_cat := 'budget';
    v_budget := private.budget_for(p_account, v_month);
    if p_advance then
      if v_budget is not null then
        v_lines := jsonb_build_array(jsonb_build_object('description', 'Monthly package · ' || private.month_label(v_month),
          'qty', 1, 'unit_price', v_budget));
      end if;
      v_basis := v_budget;
    else
      select coalesce(round(sum(qty * unit_price), 2), 0),
        coalesce(jsonb_agg(jsonb_build_object('line_item_id', id)), '[]'::jsonb)
        into v_used, v_items
      from public.line_items where account_id = p_account and delivered_month = v_month;
      if v_budget is null then return null; end if;
      if not pl.bill_in_advance then
        v_lines := jsonb_build_array(jsonb_build_object('description', 'Monthly package · ' || private.month_label(v_month),
          'qty', 1, 'unit_price', v_budget));
      end if;
      if v_used > v_budget then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
          'Additional content beyond the monthly package · ' || private.month_label(v_month)
          || ' (' || to_char(v_used, 'FM999,999,990.00') || ' produced)',
          'qty', 1, 'unit_price', v_used - v_budget));
      end if;
      v_lines := v_lines || coalesce((select jsonb_agg(jsonb_build_object('mark', x ->> 'line_item_id'))
        from jsonb_array_elements(v_items) x), '[]'::jsonb);
      v_basis := v_used;
    end if;
  elsif pl.mode = 'package' then
    v_cat := 'fixed';
    v_pm := private.package_month(p_account, v_month);
    if v_pm is null then return null; end if;
    if p_advance or not coalesce(pl.bill_in_advance, false) then
      v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
        || private.month_label(v_month) || (case when (v_pm ->> 'prorated')::boolean then ' (pro-rated)' else '' end),
        'qty', 1, 'unit_price', (v_pm ->> 'price')::numeric));
    end if;
    if p_advance then
      v_basis := (v_pm ->> 'price')::numeric;
    else
      for e in select * from jsonb_array_elements(coalesce(v_pm -> 'extras', '[]'::jsonb) || coalesce(v_pm -> 'before', '[]'::jsonb)) loop
        v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
          'Extra · ' || (e ->> 'description') || coalesce(' · ' || (e ->> 'ref'), ''),
          'qty', (e ->> 'qty')::numeric, 'unit_price', (e ->> 'unit_price')::numeric,
          'line_item_id', e ->> 'id', 'kind', e ->> 'kind')));
      end loop;
      v_basis := (v_pm ->> 'estimate')::numeric;
    end if;
  else
    v_cat := 'payg';
    select coalesce(jsonb_agg(jsonb_build_object('description', li.description || coalesce(' · ' || p.ref, ''),
        'qty', li.qty, 'unit_price', li.unit_price, 'line_item_id', li.id, 'kind', li.kind)
        order by li.delivered_month, li.created_at), '[]'::jsonb),
      coalesce(round(sum(li.qty * li.unit_price), 2), 0)
      into v_lines, v_basis
    from public.line_items li left join public.projects p on p.id = li.project_id
    where li.account_id = p_account and li.billed_invoice_id is null
      and li.delivered_month is not null and li.delivered_month <= v_month;
    if jsonb_array_length(v_lines) = 0 then return null; end if;
  end if;
  return jsonb_build_object('category', v_cat, 'lines', v_lines, 'basis', v_basis);
end $$;

-- The 25th: month-end drafts, and next month's advance drafts for budget and package clients.
create or replace function public.portal_admin_generate_drafts(p_secret text, p_actor text, p_today date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := coalesce(p_today, (now() at time zone 'Asia/Dubai')::date);
  v_month date := date_trunc('month', v_today)::date; r record; v uuid; v_ids uuid[] := '{}';
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if extract(day from v_today) < 25 then
    return jsonb_build_object('created', 0, 'ids', '[]'::jsonb, 'note', 'drafts are made from the 25th');
  end if;
  for r in select a.id, pl.mode, pl.bill_in_advance, a.payg_invoicing
    from public.accounts a left join public.account_plans pl on pl.account_id = a.id
  loop
    if r.mode in ('budget', 'package') or (coalesce(r.mode, 'payg') = 'payg' and r.payg_invoicing = 'month_end') then
      v := private.month_end_draft(r.id, v_month, false, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    if r.mode in ('budget', 'package') and r.bill_in_advance then
      v := private.month_end_draft(r.id, (v_month + interval '1 month')::date, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into private.portal_admin_log (actor, action, detail)
      values (p_actor, 'create', 'Invoice drafts for ' || private.month_label(v_month) || ': ' || array_length(v_ids, 1));
  end if;
  return jsonb_build_object('created', coalesce(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
end $$;

-- ---------- the client's Billing page: usage counts and this month's extras ----------
create or replace function public.my_billing(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; s public.billing_settings%rowtype; v_online boolean;
  v_plan jsonb; v_offer jsonb; pl public.account_plans%rowtype; v_show boolean; v_bm jsonb;
  v_month date := private.dubai_month(now());
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin') then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  select * into a from public.accounts where id = p_account;
  select * into s from public.billing_settings where id;
  select * into pl from public.account_plans where account_id = p_account;
  v_online := private.pays_online(p_account);
  v_show := private.shows_budget(p_account);
  if pl.mode = 'budget' then
    v_bm := private.budget_month(p_account, v_month);
  else
    v_plan := private.plan_view(p_account);
    v_offer := private.suggestion_for(p_account);
  end if;
  return jsonb_build_object(
    'currency', a.currency,
    'mode', (case when pl.mode = 'budget' then 'budget' when v_plan is not null then 'package' else 'payg' end),
    'show_budget', v_show,
    'budget', (case when pl.mode = 'budget' and v_show then v_bm end),
    'activity', (case when v_show and pl.mode is distinct from 'budget'
      then private.budget_month(p_account, v_month) -> 'activity' end),
    'plan', (case when v_plan is not null then jsonb_build_object(
      'name', v_plan ->> 'name', 'prorated', (v_plan ->> 'prorated')::boolean,
      'term_months', (v_plan ->> 'term_months')::int, 'month_no', (v_plan ->> 'month_no')::int,
      'started_on', v_plan ->> 'started_on', 'ends_on', v_plan ->> 'ends_on',
      'renews_on', v_plan ->> 'renews_on',
      'usage', coalesce((select jsonb_agg(jsonb_build_object('key', u ->> 'key', 'label', u ->> 'label',
          'qty', (u ->> 'qty')::numeric, 'used', (u ->> 'used')::numeric,
          'remaining', (u ->> 'remaining')::numeric, 'over', (u ->> 'over')::numeric))
        from jsonb_array_elements(v_plan -> 'usage') u), '[]'::jsonb),
      -- This month's extras (Owner/Admins only reach this function).
      'extras', coalesce((select jsonb_agg(jsonb_build_object('description', e ->> 'description',
          'qty', (e ->> 'qty')::numeric, 'amount', round((e ->> 'qty')::numeric * (e ->> 'unit_price')::numeric, 2),
          'ref', e ->> 'ref'))
        from jsonb_array_elements(v_plan -> 'extras') e), '[]'::jsonb),
      'extras_total', (v_plan ->> 'extras_total')::numeric) end),
    'suggestion', (case when v_offer is not null then jsonb_build_object(
      'package_id', v_offer ->> 'package_id', 'package', v_offer ->> 'package',
      'inclusions', v_offer -> 'inclusions', 'currency', v_offer ->> 'currency',
      'price', (v_offer ->> 'price')::numeric, 'price_6', (v_offer ->> 'price_6')::numeric,
      'discount_pct', (v_offer ->> 'discount_pct')::numeric, 'pinned', (v_offer ->> 'pinned')::boolean,
      'show_saving', (v_offer ->> 'show_saving')::boolean,
      'saving', (case when (v_offer ->> 'show_saving')::boolean then (v_offer ->> 'saving')::numeric end),
      'saving_6', (case when (v_offer ->> 'show_saving')::boolean then (v_offer ->> 'saving_6')::numeric end)) end),
    'pay_online', v_online,
    'bank', (case when not v_online and s.bank_iban is not null then jsonb_build_object(
      'account_name', s.bank_account_name, 'bank', s.bank_name, 'iban', s.bank_iban, 'swift', s.bank_swift) end)
  );
end $$;

-- ---------- booking: the client's services, prices and what's left this month ----------
create or replace function public.my_booking_options(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.account_role(p_account); pl public.account_plans%rowtype; a public.accounts%rowtype;
  v_today date := (now() at time zone 'Asia/Dubai')::date; v_mode text; v_money boolean; v_pm jsonb;
begin
  if v_role is null then raise exception 'not a member of that account' using errcode = '42501'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  v_mode := coalesce(pl.mode, 'payg');
  v_money := v_role in ('owner', 'admin')
    or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing'));
  if v_mode = 'package' and v_money then v_pm := private.plan_view(p_account); end if;
  return jsonb_build_object(
    'can_book', private.sees_area(p_account, 'shoot') and a.svc_production,
    'services', jsonb_build_object('production', a.svc_production, 'post', a.svc_post, 'avatars', a.svc_avatars),
    'mode', v_mode,
    'currency', a.currency,
    'sees_prices', v_money,
    'show_amount', v_money and (v_mode = 'payg' or private.shows_budget(p_account)),
    'rates', (case when v_money then (select jsonb_object_agg(r.key, private.rate_on(p_account, r.key, v_today))
      from public.rate_card r where r.grp is not null or r.key in ('reel', 'long_form')) end),
    -- Package clients with price access: what's left of each inclusion this month.
    'left', (case when v_pm is not null then (select jsonb_object_agg(u ->> 'key', jsonb_build_object(
        'qty', (u ->> 'qty')::numeric, 'remaining', (u ->> 'remaining')::numeric))
      from jsonb_array_elements(v_pm -> 'usage') u) end));
end $$;

-- What a portal booking may ask for: Shot & edited (reels and long-form by quantity) or Shoot only
-- (reels and long-form by half or full day; a property at the shoot-only price).
create or replace function private.check_shoot_services(p_services jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare s jsonb; v_raw boolean;
begin
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ? 'mode' and s ->> 'mode' not in ('edited', 'raw') then
      raise exception 'shot and edited, or shoot only' using errcode = '22023';
    end if;
    v_raw := coalesce(s ->> 'mode' = 'raw', false);
    if s ? 'day' and s ->> 'day' not in ('half', 'full') then
      raise exception 'choose half day or full day' using errcode = '22023';
    end if;
    if s ->> 'service' <> 'property' then
      if v_raw and not s ? 'day' then raise exception 'choose half day or full day' using errcode = '22023'; end if;
      if not v_raw and coalesce((s ->> 'qty')::int, 0) not between 1 and 100 then
        raise exception 'quantity between 1 and 100' using errcode = '22023';
      end if;
    elsif not v_raw and jsonb_typeof(s -> 'property') is distinct from 'object' then
      raise exception 'choose the property details' using errcode = '22023';
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
end $$;

drop function if exists public.book_shoot(uuid, date, text, jsonb, jsonb, text, numeric);
create or replace function public.book_shoot(p_account uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null, p_start_time text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ref text; v_addr text; v_title text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' when 'flexible' then 'Flexible' end;
begin
  if v_uid is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if not private.sees_area(p_account, 'shoot') then
    raise exception 'your access doesn''t include shoots' using errcode = '42501';
  end if;
  if not coalesce(private.service_on(p_account, 'production'), false) then
    raise exception 'that service isn''t enabled for your account' using errcode = '42501';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  if p_start_time is not null and p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'preferred start time as HH:MM' using errcode = '22023';
  end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if length(coalesce(p_location ->> 'unit', '')) > 200 or length(coalesce(p_location ->> 'access', '')) > 1000 then
    raise exception 'location details too long' using errcode = '22023';
  end if;
  perform private.check_shoot_services(p_services);
  if (select count(*) from public.projects where account_id = p_account and created_at > now() - interval '1 day'
      and created_by is not null) >= 30 then
    raise exception 'too many new projects today' using errcode = '22023';
  end if;
  v_title := 'Shoot · ' || left(split_part(v_addr, ',', 1), 120);
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, shoot_date, slot, meta, created_by, requested_by)
  values (p_account, 'shoot', v_ref, v_title, 'requested', p_date, v_slot,
    jsonb_build_object('source', 'portal', 'booking', jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''),
        'building', nullif(left(btrim(coalesce(p_location ->> 'building', '')), 200), ''),
        'community', nullif(left(btrim(coalesce(p_location ->> 'community', '')), 200), ''))),
      'services', p_services, 'slot', p_slot, 'start_time', p_start_time,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    v_uid, v_uid)
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name)
    values (v_id, 'created', 'requested', private.my_name());
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

drop function if exists public.update_booking(uuid, date, text, jsonb, jsonb, text, numeric);
create or replace function public.update_booking(p_project uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null, p_start_time text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_addr text; v_note text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' end;
begin
  p := private.changeable_shoot(p_project);
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  if p_start_time is not null and p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'preferred start time as HH:MM' using errcode = '22023';
  end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  perform private.check_shoot_services(p_services);
  v_note := case when p.status = 'confirmed' then 'Change requested' else 'Details edited' end;
  update public.projects set
    shoot_date = p_date, slot = v_slot, status = 'requested',
    title = 'Shoot · ' || left(split_part(v_addr, ',', 1), 120),
    meta = jsonb_set(meta, '{booking}', (coalesce(meta -> 'booking', '{}'::jsonb) - 'start_time') || jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''),
        'building', nullif(left(btrim(coalesce(p_location ->> 'building', '')), 200), ''),
        'community', nullif(left(btrim(coalesce(p_location ->> 'community', '')), 200), ''))),
      'services', p_services, 'slot', p_slot, 'start_time', p_start_time,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    updated_at = now()
  where id = p.id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name)
    values (p.id, 'status', p.status, 'requested', v_note, private.my_name());
  return jsonb_build_object('id', p.id, 'ref', p.ref, 'was', p.status, 'note', v_note);
end $$;

-- ---------- privileges ----------
revoke all on function private.rate_on(uuid, text, date), private.client_price(uuid, text),
  private.inclusion_key_ok(text), private.check_shoot_services(jsonb) from public, anon, authenticated;
revoke all on function
  public.portal_admin_set_services(text, text, uuid, boolean, boolean, boolean),
  public.portal_admin_save_client_prices(text, text, uuid, jsonb),
  public.portal_admin_save_client_package(text, text, uuid, jsonb),
  public.portal_admin_client_setup(text, text, uuid),
  public.portal_admin_set_billing_switches(text, text, uuid, boolean, text, boolean),
  public.portal_admin_generate_drafts(text, text, date)
  from public;
grant execute on function
  public.portal_admin_set_services(text, text, uuid, boolean, boolean, boolean),
  public.portal_admin_save_client_prices(text, text, uuid, jsonb),
  public.portal_admin_save_client_package(text, text, uuid, jsonb),
  public.portal_admin_client_setup(text, text, uuid),
  public.portal_admin_set_billing_switches(text, text, uuid, boolean, text, boolean),
  public.portal_admin_generate_drafts(text, text, date)
  to anon, authenticated;
revoke all on function public.my_billing(uuid), public.my_booking_options(uuid),
  public.book_shoot(uuid, date, text, jsonb, jsonb, text, numeric, text),
  public.update_booking(uuid, date, text, jsonb, jsonb, text, numeric, text) from public, anon;
grant execute on function public.my_billing(uuid), public.my_booking_options(uuid),
  public.book_shoot(uuid, date, text, jsonb, jsonb, text, numeric, text),
  public.update_booking(uuid, date, text, jsonb, jsonb, text, numeric, text) to authenticated;
