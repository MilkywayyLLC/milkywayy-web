-- Billing add-on, owner decisions 4 Oct 2026 (second round):
-- 1. A pinned offer always shows (unless the client is set to "never show"), even with the global
--    switch off; when it doesn't save money it shows as "Your offer" without a saving line.
-- 2. Calendar months everywhere. A package's month is the calendar month; a package that starts
--    mid-month has a pro-rated first month (price and inclusions by days; inclusions rounded to
--    whole units), and work delivered earlier that month is pay as you go. The live view,
--    statements and invoices all come from one function, private.package_month().
-- Additive (replaces functions only).

-- ---------- usage over a date range, against given (possibly pro-rated) inclusions ----------
drop function if exists private.package_usage(uuid, uuid, text, date, date);
create or replace function private.package_usage(p_account uuid, p_pkg uuid, p_inclusions jsonb,
  p_cur text, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select li.*, p.ref from public.line_items li join public.projects p on p.id = li.project_id
    where li.account_id = p_account and p.delivered_at is not null
      and (p.delivered_at at time zone 'Asia/Dubai')::date >= p_from
      and (p.delivered_at at time zone 'Asia/Dubai')::date < p_to
  ), usage as (
    select t.ord, t.i ->> 'key' as key, t.i ->> 'label' as label, (t.i ->> 'qty')::numeric as qty,
      coalesce((select sum(it.qty) from items it where it.kind = t.i ->> 'key'), 0) as used,
      private.pkg_overage_rate(p_pkg, p_account, t.i ->> 'key', p_cur) as rate
    from jsonb_array_elements(p_inclusions) with ordinality t(i, ord)
  ), extras as (
    select it.* from items it
    where it.kind is null or it.kind not in (select x ->> 'key' from jsonb_array_elements(p_inclusions) x)
  )
  select jsonb_build_object(
    'usage', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'qty', qty,
        'used', used, 'remaining', greatest(qty - used, 0), 'over', greatest(used - qty, 0),
        'rate', rate, 'overage', round(greatest(used - qty, 0) * coalesce(rate, 0), 2)) order by ord)
      from usage), '[]'::jsonb),
    'overage_total', coalesce((select round(sum(greatest(used - qty, 0) * coalesce(rate, 0)), 2) from usage), 0),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('description', description, 'qty', qty,
        'unit_price', unit_price, 'kind', kind, 'ref', ref) order by created_at) from extras), '[]'::jsonb),
    'extras_total', coalesce((select round(sum(qty * unit_price), 2) from extras), 0))
$$;

-- ---------- one package month (calendar), or null when no package covers it ----------
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
  if v_start >= v_next then return null; end if; -- the package starts in a later month
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
  -- Work delivered earlier in the start month, before the package began: pay as you go.
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by p.delivered_at), '[]'::jsonb),
    coalesce(round(sum(li.qty * li.unit_price), 2), 0)
    into v_before, v_before_total
  from public.line_items li join public.projects p on p.id = li.project_id
  where li.account_id = p_account and p.delivered_at is not null
    and (p.delivered_at at time zone 'Asia/Dubai')::date >= v_month
    and (p.delivered_at at time zone 'Asia/Dubai')::date < v_start;
  -- The contract counts full calendar months: from the start month if it began on the 1st, else
  -- from the next one (the pro-rated month comes first).
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
    'period_start', v_start, 'renews_on', v_next)
    || u || jsonb_build_object('before', v_before, 'before_total', v_before_total,
      'estimate', v_price + (u ->> 'overage_total')::numeric + (u ->> 'extras_total')::numeric + v_before_total);
end $$;

-- The live view is this calendar month.
create or replace function private.plan_view(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.package_month(p_account, private.dubai_month(now()))
$$;

-- A month's statement: the same package month as the live view, else the pay-as-you-go total.
create or replace function private.build_statement(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_vat_on boolean; v_lines jsonb; v_sub numeric; v_pm jsonb; v_vat numeric;
  v_month date := date_trunc('month', p_month)::date;
begin
  select * into a from public.accounts where id = p_account;
  select vat_registered into v_vat_on from public.billing_settings where id;
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref, 'amount', round(li.qty * li.unit_price, 2))
      order by p.delivered_at, li.created_at), '[]'::jsonb)
    into v_lines
  from public.line_items li join public.projects p on p.id = li.project_id
  where li.account_id = p_account and li.delivered_month = v_month;
  v_pm := private.package_month(p_account, v_month);
  if v_pm is not null then
    v_sub := (v_pm ->> 'estimate')::numeric;
  else
    select coalesce(sum((l ->> 'amount')::numeric), 0) into v_sub from jsonb_array_elements(v_lines) l;
  end if;
  v_vat := (case when coalesce(v_vat_on, false) then round(v_sub * 0.05, 2) else 0 end);
  return jsonb_build_object('account_id', p_account, 'month', v_month, 'currency', a.currency,
    'mode', (case when v_pm is not null then 'package' else 'payg' end),
    'package', (case when v_pm is not null then jsonb_build_object('name', v_pm ->> 'name',
      'price', (v_pm ->> 'price')::numeric, 'full_price', (v_pm ->> 'full_price')::numeric,
      'prorated', (v_pm ->> 'prorated')::boolean, 'term_months', (v_pm ->> 'term_months')::int,
      'overage_total', (v_pm ->> 'overage_total')::numeric, 'extras_total', (v_pm ->> 'extras_total')::numeric,
      'before_total', (v_pm ->> 'before_total')::numeric) end),
    'lines', v_lines, 'overage', coalesce(v_pm -> 'usage', '[]'::jsonb),
    'subtotal', round(v_sub, 2), 'vat_rate', (case when coalesce(v_vat_on, false) then 5 else 0 end),
    'vat', v_vat, 'total', round(v_sub, 2) + v_vat);
end $$;

-- ---------- offers ----------
-- One package for one client: its price (and 6-month price) in their currency, and — for a
-- pay-as-you-go client with work in at least 2 of the last 3 complete months — what it would
-- have cost them and the saving. Without that history, or on a package, no saving.
create or replace function private.offer_for(p_account uuid, p_pkg uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; k public.packages%rowtype; v_m0 date := private.dubai_month(now());
  v_from date; v_active int; v_avg numeric; v_price numeric; v_price6 numeric; v_over numeric;
  v_unc numeric; v_cost numeric; v_saving numeric; v_base jsonb;
begin
  select * into a from public.accounts where id = p_account;
  select * into k from public.packages where id = p_pkg;
  if a.id is null or k.id is null then return null; end if;
  v_price := private.pkg_price(k.id, a.currency);
  if v_price is null then return null; end if;
  v_price6 := round(v_price * (1 - k.six_month_discount_pct / 100), 2);
  v_base := jsonb_build_object('package_id', k.id, 'package', k.name, 'inclusions', k.inclusions,
    'currency', a.currency, 'price', v_price, 'discount_pct', k.six_month_discount_pct, 'price_6', v_price6,
    'pinned', a.pinned_package_id is not distinct from k.id, 'saving', null, 'saving_6', null,
    'show_saving', false);
  if private.plan_view(p_account) is not null then return v_base; end if;
  v_from := (v_m0 - interval '3 months')::date;
  select count(*) filter (where total > 0), coalesce(sum(total), 0) / 3 into v_active, v_avg
  from (select (select coalesce(sum(li.qty * li.unit_price), 0) from public.line_items li
          where li.account_id = p_account and li.delivered_month = m::date) as total
        from generate_series(v_from, (v_m0 - interval '1 month')::date, interval '1 month') m) x;
  if v_active < 2 then return v_base || jsonb_build_object('active_months', v_active); end if;
  select coalesce(sum(case when inc.qty is not null then greatest(u.qty / 3 - inc.qty, 0)
           * coalesce(private.pkg_overage_rate(k.id, p_account, u.kind, a.currency), u.amount / nullif(u.qty, 0)) end), 0),
         coalesce(sum(case when inc.qty is null then u.amount / 3 end), 0)
    into v_over, v_unc
  from (select coalesce(li.kind, 'other') as kind, sum(li.qty) as qty, sum(li.qty * li.unit_price) as amount
        from public.line_items li
        where li.account_id = p_account and li.delivered_month >= v_from and li.delivered_month < v_m0
        group by 1) u
  left join lateral (select sum((i ->> 'qty')::numeric) as qty from jsonb_array_elements(k.inclusions) i
    where i ->> 'key' = u.kind) inc on true;
  v_cost := v_price + v_over + v_unc;
  v_saving := v_avg - v_cost;
  return v_base || jsonb_build_object('average', round(v_avg, 2), 'overage', round(v_over, 2),
    'uncovered', round(v_unc, 2), 'cost', round(v_cost, 2), 'saving', round(v_saving, 2),
    'saving_6', round(v_avg - (v_cost - v_price + v_price6), 2), 'active_months', v_active,
    'show_saving', v_saving > 0);
end $$;

-- The best offer the engine sees (shown to the admin): the pinned offer if there is one, else the
-- template with the biggest saving (pay-as-you-go clients with enough history only).
create or replace function private.best_offer(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; k record; o jsonb; v_best jsonb;
begin
  select * into a from public.accounts where id = p_account;
  if a.id is null then return null; end if;
  if a.pinned_package_id is not null then return private.offer_for(p_account, a.pinned_package_id); end if;
  if private.plan_view(p_account) is not null then return null; end if;
  for k in select p.id from public.packages p where p.account_id is null and p.suggest loop
    o := private.offer_for(p_account, k.id);
    continue when o is null or o -> 'saving' is null or o ->> 'saving' is null;
    if v_best is null or (o ->> 'saving')::numeric > (v_best ->> 'saving')::numeric then v_best := o; end if;
  end loop;
  return v_best;
end $$;

-- What the client sees. A pinned offer always (unless "never show"); otherwise the best template,
-- when switched on and the saving is at least the minimum.
create or replace function private.suggestion_for(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.billing_settings%rowtype; a public.accounts%rowtype; v_offer jsonb; v_min numeric;
begin
  select * into a from public.accounts where id = p_account;
  if a.id is null or a.hide_suggestions then return null; end if;
  if a.pinned_package_id is not null then return private.offer_for(p_account, a.pinned_package_id); end if;
  select * into s from public.billing_settings where id;
  if not coalesce(s.suggestions_enabled, false) then return null; end if;
  v_offer := private.best_offer(p_account);
  v_min := (case when a.currency = 'USD' then s.min_saving_usd else s.min_saving_aed end);
  if v_offer is null or (v_offer ->> 'saving')::numeric < v_min then return null; end if;
  return v_offer;
end $$;

revoke all on function private.package_usage(uuid, uuid, jsonb, text, date, date),
  private.package_month(uuid, date), private.plan_view(uuid), private.build_statement(uuid, date),
  private.offer_for(uuid, uuid), private.best_offer(uuid), private.suggestion_for(uuid)
  from public, anon, authenticated;

-- ---------- plans: a start date; renewal is the 1st of each month ----------
create or replace function public.portal_admin_set_plan(p_secret text, p_actor text, p_account uuid,
  p_mode text, p_package uuid, p_started date, p_renews date, p_term int default 1, p_ends date default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_mode = 'package' and (p_package is null or p_started is null) then
    raise exception 'choose the package and its start date' using errcode = '22023';
  end if;
  insert into public.account_plans (account_id, mode, package_id, started_on, renews_on, term_months, ends_on)
    values (p_account, p_mode, (case when p_mode = 'package' then p_package end),
      (case when p_mode = 'package' then p_started end),
      (case when p_mode = 'package' then (date_trunc('month', p_started) + interval '1 month')::date end),
      (case when p_mode = 'package' then coalesce(p_term, 1) else 1 end),
      (case when p_mode = 'package' and p_term = 6 then p_ends end))
  on conflict (account_id) do update set mode = excluded.mode, package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, term_months = excluded.term_months,
    ends_on = excluded.ends_on, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Plan: ' || p_mode || (case when p_term = 6 then ' (6 months)' else '' end));
end $$;
