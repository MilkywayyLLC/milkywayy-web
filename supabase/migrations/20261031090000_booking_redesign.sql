-- Booking redesign (site-refine, 18 Oct 2026; docs/AUDIT.md items 1, 2, 17). Additive.
--
-- * "What do you need?": Photos (type + size; Twilight and 360 tour as add-ons) and/or Videos.
--   Videos: short-form (up to 60s) and long-form (up to 5 min, then per extra minute) counters,
--   or "Not sure how many?": a half or full day, edited or raw files only.
-- * Flexible edited booking (by time, not raw): billed per finished video at the client's rates,
--   or the half/full-day minimum if that's higher. The shoot log adds a "Minimum charge top-up"
--   line for the difference. No minimum on a monthly package (videos draw from the inclusions;
--   extras at the client's rate, as before).
-- * Rate card: defaults for the video and day rates (only where none is set yet), three new items
--   (long-form extra minute, the two edited minimums), the retired items hidden (grp null: off the
--   price lists and booking, never dropped: anything logged keeps its price).
-- * Older bookings keep their stored services; the app reads them (lib/portal/booking).

-- ---------- rate card ----------
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort) values
  ('long_form_extra_min', 'Long-form, extra minute', 'minute', 100, 27, 142),
  ('min_half_day', 'Not sure how many · half day minimum', 'half day', 1600, 436, 145),
  ('min_full_day', 'Not sure how many · full day minimum', 'day', 2800, 763, 146)
on conflict (key) do nothing;

update public.rate_card set amount_aed = 400, amount_usd = 109 where key = 'reel_shoot' and amount_aed is null;
update public.rate_card set amount_aed = 1000, amount_usd = 272 where key = 'long_form_shoot' and amount_aed is null;
update public.rate_card set amount_aed = 1200, amount_usd = 327 where key = 'half_day' and amount_aed is null;
update public.rate_card set amount_aed = 1800, amount_usd = 490 where key = 'full_day' and amount_aed is null;

update public.rate_card set grp = 'production', includes = 'Shot & edited',
  label = 'Short-form video (up to 60s)', unit = 'video', sort = 140 where key = 'reel_shoot';
update public.rate_card set grp = 'production', includes = 'Shot & edited',
  label = 'Long-form video (up to 5 min)', unit = 'video', sort = 141 where key = 'long_form_shoot';
update public.rate_card set grp = 'production', includes = 'Shot & edited, beyond 5 minutes'
  where key = 'long_form_extra_min';
update public.rate_card set grp = 'production', includes = 'Billed per finished video, at least this'
  where key in ('min_half_day', 'min_full_day');
update public.rate_card set grp = 'production', includes = 'Raw files, no editing',
  label = 'Raw files only · half day', sort = 150 where key = 'half_day';
update public.rate_card set grp = 'production', includes = 'Raw files, no editing',
  label = 'Raw files only · full day', sort = 151 where key = 'full_day';

-- Retired: videography by size, the shoot-only property, the old day and avatar items.
update public.rate_card set grp = null where key in ('prop_short', 'prop_long', 'prop_raw', 'shoot_day', 'avatar_video');
-- The property price list's own item (photos, twilight, 360 tour by size).
update public.rate_card set label = 'Photo shoot' where key = 'shoot';

-- A package may count services, never a minimum.
create or replace function private.inclusion_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_key = 'shoot' or exists (select 1 from public.rate_card where key = p_key and grp is not null
    and key not like 'prop\_photo\_%' and key not in ('prop_short', 'prop_long', 'prop_tour', 'prop_twilight',
      'min_half_day', 'min_full_day'))
$$;

-- ---------- what a booking may ask for ----------
-- Today: {service: 'property', property: {...}} (photos) and {service: 'videos', videos: {by, ...}}.
-- Older shapes (reels / long_form, Shot & edited / Shoot only) stay valid for stored bookings.
create or replace function private.check_shoot_services(p_services jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare s jsonb; v jsonb; v_raw boolean;
begin
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property', 'videos') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ->> 'service' = 'videos' then
      v := s -> 'videos';
      if jsonb_typeof(v) is distinct from 'object' or v ->> 'by' not in ('count', 'time') then
        raise exception 'choose how many videos, or half day or full day' using errcode = '22023';
      end if;
      if v ->> 'by' = 'count' then
        if coalesce((v ->> 'short')::int, 0) not between 0 and 100 or coalesce((v ->> 'long')::int, 0) not between 0 and 100
          or coalesce((v ->> 'short')::int, 0) + coalesce((v ->> 'long')::int, 0) < 1 then
          raise exception 'quantity between 1 and 100' using errcode = '22023';
        end if;
        if coalesce((v ->> 'extra_min')::int, 0) not between 0 and 600 then
          raise exception 'extra minutes between 0 and 600' using errcode = '22023';
        end if;
      else
        if v ->> 'day' is null or v ->> 'day' not in ('half', 'full') then
          raise exception 'choose half day or full day' using errcode = '22023';
        end if;
        if length(coalesce(v ->> 'approx', '')) > 300 then raise exception 'notes too long' using errcode = '22023'; end if;
      end if;
    else
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
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
end $$;

-- ---------- admin: log what we shot, with a day minimum ----------
-- A line with "minimum": true (key min_half_day / min_full_day) isn't an item: after the items,
-- if the client isn't on a monthly package and the finished videos (short-form, long-form, extra
-- minutes) come to less than their minimum, a "Minimum charge top-up" item makes up the
-- difference. Otherwise as before.
create or replace function public.portal_admin_log_shoot(p_secret text, p_actor text, p_project uuid,
  p_lines jsonb, p_deliverables jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; l jsonb; v_date date; v_month date; v_mode text; v_price numeric;
  v_list numeric; v_basis text; v_n int := 0; v_sort int := 0; d jsonb;
  v_min_key text; v_min numeric; v_videos numeric;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null or p.account_id is null then
    raise exception 'log against a client''s shoot' using errcode = '22023';
  end if;
  if exists (select 1 from public.line_items where project_id = p_project and logged and billed_invoice_id is not null) then
    raise exception 'already on an invoice: change it on the invoice draft instead' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 60 then
    raise exception 'up to 60 lines' using errcode = '22023';
  end if;
  v_date := coalesce(p.shoot_date, (now() at time zone 'Asia/Dubai')::date);
  select mode into v_mode from public.account_plans where account_id = p.account_id;
  -- Budget clients see it in this month's activity straight away; others when it's delivered.
  v_month := case when v_mode = 'budget' then date_trunc('month', v_date)::date
    when p.delivered_at is not null then private.dubai_month(p.delivered_at) end;
  delete from public.line_items where project_id = p_project and logged;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l ->> 'minimum')::boolean, false) then
      if l ->> 'key' not in ('min_half_day', 'min_full_day') then
        raise exception 'a day minimum is half day or full day' using errcode = '22023';
      end if;
      if v_min_key is not null then raise exception 'one day minimum per shoot' using errcode = '22023'; end if;
      v_min_key := l ->> 'key';
      continue;
    end if;
    if coalesce(length(btrim(l ->> 'description')), 0) not between 1 and 200 then
      raise exception 'every line needs a description' using errcode = '22023';
    end if;
    if coalesce((l ->> 'qty')::numeric, 0) <= 0 then raise exception 'quantities above 0' using errcode = '22023'; end if;
    v_basis := coalesce(l ->> 'basis', 'client_rate');
    if v_basis = 'client_rate' then
      v_list := private.rate_on(p.account_id, l ->> 'key', v_date);
      if v_list is null then
        raise exception 'no rate for % yet: set it in the client''s rates or override the price', l ->> 'key'
          using errcode = '22023';
      end if;
      v_price := v_list;
    elsif v_basis = 'price_list' then
      v_list := (l ->> 'unit_price')::numeric;
      v_price := v_list;
    elsif v_basis = 'override' then
      if length(btrim(coalesce(l ->> 'reason', ''))) < 3 then
        raise exception 'say why the price was changed' using errcode = '22023';
      end if;
      v_price := (l ->> 'unit_price')::numeric;
      v_list := (l ->> 'list_price')::numeric;
    else
      raise exception 'unknown price basis' using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 then raise exception 'prices of 0 or more' using errcode = '22023'; end if;
    v_sort := v_sort + 1;
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, override_reason, logged, sort)
    select p_project, p.account_id, btrim(l ->> 'description'), (l ->> 'qty')::numeric, v_price, a.currency,
      coalesce(l ->> 'kind', l ->> 'key'), v_month, v_date, l ->> 'key', v_basis, v_list,
      case when v_basis = 'override' then btrim(l ->> 'reason') end, true, v_sort
    from public.accounts a where a.id = p.account_id;
    v_n := v_n + 1;
  end loop;
  -- The day minimum: never on a monthly package.
  if v_min_key is not null and coalesce(v_mode, 'payg') <> 'package' then
    v_min := private.rate_on(p.account_id, v_min_key, v_date);
    if v_min is null then
      raise exception 'no rate for % yet: set it in the client''s rates', v_min_key using errcode = '22023';
    end if;
    select coalesce(sum(li.qty * li.unit_price), 0) into v_videos from public.line_items li
      where li.project_id = p_project and li.logged
        and li.rate_key in ('reel_shoot', 'long_form_shoot', 'long_form_extra_min');
    if v_min > v_videos then
      v_sort := v_sort + 1;
      insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
        delivered_month, service_date, rate_key, price_basis, list_price, logged, sort)
      select p_project, p.account_id,
        'Minimum charge top-up · ' || case v_min_key when 'min_full_day' then 'full day' else 'half day' end,
        1, v_min - v_videos, a.currency, 'day_minimum', v_month, v_date, v_min_key, 'client_rate', v_min, true, v_sort
      from public.accounts a where a.id = p.account_id;
      v_n := v_n + 1;
    end if;
  end if;
  -- Deliverables from the log, the first time (after that they're edited on their own).
  if p_deliverables is not null and not exists (select 1 from public.project_deliverables where project_id = p_project) then
    v_sort := 0;
    for d in select * from jsonb_array_elements(p_deliverables) loop
      v_sort := v_sort + 1;
      insert into public.project_deliverables (project_id, label, kind, sort)
        values (p_project, left(btrim(d ->> 'label'), 80), d ->> 'kind', v_sort);
    end loop;
  end if;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p_project, 'logged', 'Logged what was shot: ' || v_n || ' item' || case when v_n = 1 then '' else 's' end,
      'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': logged ' || v_n || ' items');
  return jsonb_build_object('logged', v_n);
end $$;

-- The shoot log's data, plus the client's plan (no day minimum on a package).
create or replace function public.portal_admin_deliverables(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return jsonb_build_object(
    'deliverables', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('revisions',
        coalesce((select jsonb_agg(to_jsonb(r) order by r.round) from public.deliverable_revisions r
          where r.deliverable_id = d.id), '[]'::jsonb)) order by d.sort)
      from public.project_deliverables d where d.project_id = p_project), '[]'::jsonb),
    'logged', coalesce((select jsonb_agg(to_jsonb(li) order by li.sort, li.created_at) from public.line_items li
      where li.project_id = p_project and li.logged), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'unit', c.unit,
        'amount', private.rate_on(p.account_id, c.key, coalesce(p.shoot_date, (now() at time zone 'Asia/Dubai')::date)))
        order by c.sort)
      from public.rate_card c, public.projects p where p.id = p_project), '[]'::jsonb),
    'plan_mode', (select coalesce(pl.mode, 'payg') from public.projects p
      left join public.account_plans pl on pl.account_id = p.account_id where p.id = p_project));
end $$;

revoke all on function private.inclusion_key_ok(text), private.check_shoot_services(jsonb) from public, anon, authenticated;
