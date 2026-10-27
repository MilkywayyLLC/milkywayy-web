-- Phase 1 part 4 (27 Oct 2026): value packages carry unused allowance (AED) and shoot days into the
-- next months. Until now nothing carried over (19 Oct: "no rollover").
--   * Rules per package template and per client; the client's rule beats the template's. With no
--     rule: on, 1 month, allowance and shoot days both.
--   * A change applies from the next month (a rule row has its from_month); credit already carried
--     keeps the expiry it was given.
--   * Carried credit is used first, oldest first; what's left after its last month expires.
--   * Credit carries from October 2026 (the first month with rollover) onward.
-- Additive: a rules table, a pure step function (tested directly), the carry for a month, and
-- package_month adding the carried credit to the month's pool.

create table if not exists private.rollover_rules (
  id bigserial primary key,
  package_id uuid references public.packages (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  from_month date not null check (extract(day from from_month) = 1),
  use_template boolean not null default false,
  enabled boolean not null default true,
  months int not null default 1 check (months between 0 and 3),
  allowance boolean not null default true,
  days boolean not null default true,
  set_by text,
  created_at timestamptz not null default now(),
  check ((package_id is null) <> (account_id is null))
);
create unique index if not exists rollover_rules_pkg_idx on private.rollover_rules (package_id, from_month)
  where package_id is not null;
create unique index if not exists rollover_rules_acct_idx on private.rollover_rules (account_id, from_month)
  where account_id is not null;

-- The rule in force for a month: the client's (unless it says "use the template"), else the package's,
-- else the default.
create or replace function private.rollover_for(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r private.rollover_rules%rowtype; v_pkg uuid; v_source text := 'client';
begin
  select * into r from private.rollover_rules where account_id = p_account and from_month <= p_month
    order by from_month desc limit 1;
  if r.id is null or r.use_template then
    select package_id into v_pkg from public.account_plans where account_id = p_account;
    select * into r from private.rollover_rules where package_id = v_pkg and from_month <= p_month
      order by from_month desc limit 1;
    v_source := 'package';
  end if;
  if r.id is null then
    return jsonb_build_object('enabled', true, 'months', 1, 'allowance', true, 'days', true, 'source', 'default');
  end if;
  return jsonb_build_object('enabled', r.enabled, 'months', r.months, 'allowance', r.allowance, 'days', r.days,
    'source', v_source);
end $$;

-- One month of carried credit. p_lots: [{from, allowance, half_days, expires}] at the start of the month
-- (expires = the last month the credit can be used). Used (what the month's bookings took from the
-- package, carried + base) comes off carried lots first, oldest first, then the month's own allowance.
-- Returns the lots for next month, what each lot gave, what expired, and what this month carries out.
create or replace function private.carry_step(p_lots jsonb, p_month date, p_base_allowance numeric,
  p_base_half_days numeric, p_used numeric, p_used_half_days numeric, p_rule jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare lot jsonb; v_a numeric := greatest(coalesce(p_used, 0), 0); v_h numeric := greatest(coalesce(p_used_half_days, 0), 0);
  ta numeric; th numeric; la numeric; lh numeric; v_next jsonb := '[]'::jsonb; v_used jsonb := '[]'::jsonb;
  v_expired jsonb := '[]'::jsonb; v_out jsonb; v_ca numeric := 0; v_ch numeric := 0; ba numeric; bh numeric;
  v_in_a numeric := 0; v_in_h numeric := 0;
begin
  for lot in select x from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb)) x
    order by (x ->> 'from')::date loop
    -- Only credit still valid this month.
    if (lot ->> 'expires')::date < p_month then continue; end if;
    v_in_a := v_in_a + (lot ->> 'allowance')::numeric;
    v_in_h := v_in_h + (lot ->> 'half_days')::numeric;
    ta := least((lot ->> 'allowance')::numeric, v_a);
    th := least((lot ->> 'half_days')::numeric, v_h);
    v_a := v_a - ta; v_h := v_h - th; v_ca := v_ca + ta; v_ch := v_ch + th;
    la := (lot ->> 'allowance')::numeric - ta;
    lh := (lot ->> 'half_days')::numeric - th;
    v_used := v_used || jsonb_build_array(jsonb_build_object('from', lot ->> 'from', 'allowance', ta, 'half_days', th));
    if (lot ->> 'expires')::date <= p_month then
      if la > 0 or lh > 0 then
        v_expired := v_expired || jsonb_build_array(jsonb_build_object('from', lot ->> 'from', 'allowance', la,
          'half_days', lh, 'expires', lot ->> 'expires'));
      end if;
    elsif la > 0 or lh > 0 then
      v_next := v_next || jsonb_build_array(lot || jsonb_build_object('allowance', la, 'half_days', lh));
    end if;
  end loop;
  -- What's left of this month's own allowance and days.
  ba := greatest(coalesce(p_base_allowance, 0) - v_a, 0);
  bh := greatest(coalesce(p_base_half_days, 0) - v_h, 0);
  if coalesce((p_rule ->> 'enabled')::boolean, false) and coalesce((p_rule ->> 'months')::int, 0) > 0 then
    ba := case when (p_rule ->> 'allowance')::boolean then ba else 0 end;
    bh := case when (p_rule ->> 'days')::boolean then bh else 0 end;
    if ba > 0 or bh > 0 then
      v_out := jsonb_build_object('from', p_month, 'allowance', ba, 'half_days', bh,
        'expires', (p_month + make_interval(months => (p_rule ->> 'months')::int))::date);
      v_next := v_next || jsonb_build_array(v_out);
    end if;
  end if;
  return jsonb_build_object('lots', v_next, 'used', v_used, 'used_allowance', v_ca, 'used_half_days', v_ch,
    'expired', v_expired, 'out', v_out, 'in_allowance', v_in_a, 'in_half_days', v_in_h);
end $$;

-- The carried credit for a client's month: runs the months from the first one with rollover (October
-- 2026, or the plan start, at most two years back) up to p_month.
create or replace function private.package_carry(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; k public.packages%rowtype; v_target date := date_trunc('month', p_month)::date;
  v_m date; v_next date; v_start date; v_frac numeric; v_ba numeric; v_bh numeric; v_lots jsonb := '[]'::jsonb;
  v_in jsonb; v_in_a numeric; v_in_h numeric; l jsonb; st jsonb;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null or k.allowance is null or k.half_day_cap is null then return null; end if;
  v_m := greatest(date_trunc('month', coalesce(pl.started_on, v_target))::date, date '2026-10-01',
    (v_target - interval '24 months')::date);
  while v_m <= v_target loop
    v_next := (v_m + interval '1 month')::date;
    v_start := greatest(v_m, coalesce(pl.started_on, v_m));
    v_in := coalesce((select jsonb_agg(x) from jsonb_array_elements(v_lots) x where (x ->> 'expires')::date >= v_m),
      '[]'::jsonb);
    select coalesce(sum((x ->> 'allowance')::numeric), 0), coalesce(sum((x ->> 'half_days')::numeric), 0)
      into v_in_a, v_in_h from jsonb_array_elements(v_in) x;
    if v_start < v_next then
      v_frac := (v_next - v_start)::numeric / (v_next - v_m);
      v_ba := round(k.allowance * v_frac, 0);
      v_bh := (case when v_frac < 1 then round(k.half_day_cap * v_frac) else k.half_day_cap end);
      l := private.value_ledger(p_account, v_start, v_next, v_ba + v_in_a, v_bh + v_in_h);
      st := private.carry_step(v_in, v_m, v_ba, v_bh, (l ->> 'used')::numeric,
        least((l ->> 'half_days_used')::numeric, v_bh + v_in_h), private.rollover_for(p_account, v_m));
    else
      st := private.carry_step(v_in, v_m, 0, 0, 0, 0, '{}'::jsonb);
    end if;
    if v_m = v_target then
      return jsonb_build_object('in', v_in, 'allowance', v_in_a, 'half_days', v_in_h,
        'used', st -> 'used', 'used_allowance', st -> 'used_allowance', 'used_half_days', st -> 'used_half_days',
        'expired', st -> 'expired', 'out', st -> 'out', 'rule', private.rollover_for(p_account, v_m));
    end if;
    v_lots := st -> 'lots';
    v_m := v_next;
  end loop;
  return jsonb_build_object('in', '[]'::jsonb, 'allowance', 0, 'half_days', 0, 'used', '[]'::jsonb,
    'used_allowance', 0, 'used_half_days', 0, 'expired', '[]'::jsonb, 'out', null,
    'rule', private.rollover_for(p_account, v_target));
end $$;

revoke all on function private.rollover_for(uuid, date), private.carry_step(jsonb, date, numeric, numeric, numeric,
  numeric, jsonb), private.package_carry(uuid, date) from public, anon, authenticated;

-- package_month: a value package's pool is its own allowance and days plus what's carried in.
create or replace function private.package_month(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_month date := date_trunc('month', p_month)::date; v_next date; v_start date; v_frac numeric;
  v_full numeric; v_price numeric; v_cur text; v_inc jsonb; u jsonb; v_first date; v_ends date;
  v_no int; v_age interval; v_before jsonb; v_before_total numeric; v_allow numeric; v_cap numeric; l jsonb;
  v_value boolean; v_fees jsonb; v_fees_total numeric; v_carry jsonb;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null then return null; end if;
  select * into a from public.accounts where id = p_account;
  v_value := k.allowance is not null and k.half_day_cap is not null;
  v_next := (v_month + interval '1 month')::date;
  v_start := greatest(v_month, coalesce(pl.started_on, v_month));
  if v_start >= v_next then return null; end if;
  v_frac := (v_next - v_start)::numeric / (v_next - v_month);
  v_full := private.pkg_price(k.id, a.currency);
  v_cur := (case when v_full is null then k.currency else a.currency end);
  v_full := round(coalesce(v_full, k.monthly_price)
    * (case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end), 0);
  -- Whole dirhams (25 Oct 2026), pro-rated amounts too.
  v_price := round(v_full * v_frac, 0);
  if v_value then
    v_inc := '[]'::jsonb;
    v_allow := round(k.allowance * v_frac, 0);
    -- Pro-rated shoot days in 0.5-day steps (whole half-days).
    v_cap := (case when v_frac < 1 then round(k.half_day_cap * v_frac) else k.half_day_cap end);
    v_carry := private.package_carry(p_account, v_month);
    l := private.value_ledger(p_account, v_start, v_next, v_allow + coalesce((v_carry ->> 'allowance')::numeric, 0),
      v_cap + coalesce((v_carry ->> 'half_days')::numeric, 0));
    -- Late-cancellation fees (when the half-days had run out) are extras too.
    select coalesce(jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'qty', li.qty,
        'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by li.created_at), '[]'::jsonb),
      coalesce(round(sum(li.qty * li.unit_price), 2), 0)
      into v_fees, v_fees_total
    from public.line_items li left join public.projects p on p.id = li.project_id
    where li.account_id = p_account and li.kind = 'cancel_fee' and li.billed_invoice_id is null
      and private.item_day(li.service_date, null, li.created_at) >= v_start
      and private.item_day(li.service_date, null, li.created_at) < v_next;
    u := jsonb_build_object('usage', '[]'::jsonb, 'overage_total', 0,
      'extras', coalesce((select jsonb_agg(jsonb_build_object('id', null, 'description',
          coalesce(r ->> 'title', 'Booking') || (case when (r ->> 'included')::numeric > 0 then ' (beyond the package)' else '' end),
          'qty', 1, 'unit_price', (r ->> 'extra')::numeric, 'kind', 'package_extra', 'ref', r ->> 'ref'))
        from jsonb_array_elements(l -> 'rows') r where (r ->> 'extra')::numeric > 0), '[]'::jsonb) || v_fees,
      'extras_total', (l ->> 'extras_total')::numeric + v_fees_total,
      'value', jsonb_build_object(
        'allowance', v_allow + coalesce((v_carry ->> 'allowance')::numeric, 0),
        'half_day_cap', v_cap + coalesce((v_carry ->> 'half_days')::numeric, 0),
        'base_allowance', v_allow, 'base_half_day_cap', v_cap, 'carry', v_carry,
        'used', (l ->> 'used')::numeric,
        'half_days_used', (l ->> 'half_days_used')::numeric, 'bookings', l -> 'rows'));
  else
    select coalesce(jsonb_agg(jsonb_set(t.i, '{qty}', to_jsonb(
        (case when v_frac < 1 then round((t.i ->> 'qty')::numeric * v_frac) else (t.i ->> 'qty')::numeric end)))
        order by t.ord), '[]'::jsonb)
      into v_inc
    from jsonb_array_elements(k.inclusions) with ordinality t(i, ord);
    u := private.package_usage(p_account, k.id, v_inc, v_cur, v_start, v_next);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by li.created_at), '[]'::jsonb),
    coalesce(round(sum(li.qty * li.unit_price), 2), 0)
    into v_before, v_before_total
  from public.line_items li left join public.projects p on p.id = li.project_id
  where li.account_id = p_account
    and private.item_day(li.service_date, p.delivered_at, li.created_at) >= v_month
    and private.item_day(li.service_date, p.delivered_at, li.created_at) < v_start
    and not (v_value and p.id is not null and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date,
      (p.created_at at time zone 'Asia/Dubai')::date) >= v_start);
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

-- ---------- admin ----------
-- The rule a package or client has now, and a change waiting for next month.
create or replace function public.portal_admin_rollover(p_secret text, p_actor text, p_package uuid, p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_now date := date_trunc('month', (now() at time zone 'Asia/Dubai'))::date;
  v_next date := (date_trunc('month', (now() at time zone 'Asia/Dubai')) + interval '1 month')::date;
  r private.rollover_rules%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_account is not null then
    select * into r from private.rollover_rules where account_id = p_account and from_month <= v_next
      order by from_month desc limit 1;
    return jsonb_build_object('now', private.rollover_for(p_account, v_now),
      'next', private.rollover_for(p_account, v_next), 'next_month', v_next,
      'override', r.id is not null and not r.use_template,
      'carry', private.package_carry(p_account, v_now));
  end if;
  select * into r from private.rollover_rules where package_id = p_package and from_month <= v_next
    order by from_month desc limit 1;
  return jsonb_build_object('next_month', v_next,
    'now', coalesce((select jsonb_build_object('enabled', x.enabled, 'months', x.months, 'allowance', x.allowance,
        'days', x.days) from private.rollover_rules x where x.package_id = p_package and x.from_month <= v_now
        order by x.from_month desc limit 1),
      jsonb_build_object('enabled', true, 'months', 1, 'allowance', true, 'days', true)),
    'next', case when r.id is null then jsonb_build_object('enabled', true, 'months', 1, 'allowance', true, 'days', true)
      else jsonb_build_object('enabled', r.enabled, 'months', r.months, 'allowance', r.allowance, 'days', r.days) end);
end $$;

-- p: {enabled, months, allowance, days} or {use_template: true} (clients only). Takes effect next month.
create or replace function public.portal_admin_set_rollover(p_secret text, p_actor text, p_package uuid,
  p_account uuid, p jsonb) returns date
language plpgsql security definer set search_path = '' as $$
declare v_next date := (date_trunc('month', (now() at time zone 'Asia/Dubai')) + interval '1 month')::date;
  v_months int := coalesce((p ->> 'months')::int, 1);
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if (p_package is null) = (p_account is null) then raise exception 'package or client' using errcode = '22023'; end if;
  if v_months not between 0 and 3 then raise exception 'roll over for 0 to 3 months' using errcode = '22023'; end if;
  if p_account is null and coalesce((p ->> 'use_template')::boolean, false) then
    raise exception 'a template has no template' using errcode = '22023';
  end if;
  if p_account is not null then
    delete from private.rollover_rules where account_id = p_account and from_month = v_next;
  else
    delete from private.rollover_rules where package_id = p_package and from_month = v_next;
  end if;
  insert into private.rollover_rules (package_id, account_id, from_month, use_template, enabled, months, allowance,
      days, set_by)
    values (p_package, p_account, v_next, coalesce((p ->> 'use_template')::boolean, false),
      coalesce((p ->> 'enabled')::boolean, true), v_months, coalesce((p ->> 'allowance')::boolean, true),
      coalesce((p ->> 'days')::boolean, true), p_actor);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Rollover from ' || to_char(v_next, 'Mon YYYY') || ': ' || case
      when coalesce((p ->> 'use_template')::boolean, false) then 'package default'
      when not coalesce((p ->> 'enabled')::boolean, true) or v_months = 0 then 'off'
      else v_months || ' month(s)' end);
  return v_next;
end $$;

-- Tests: the carry over a run of months without bookings in the database (pure; gated anyway).
-- p_months: [{month, base_allowance, base_half_days, used, used_half_days, rule}]
create or replace function public.portal_admin_carry_sim(p_secret text, p_actor text, p_months jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_lots jsonb := '[]'::jsonb; st jsonb; v_out jsonb := '[]'::jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for m in select x from jsonb_array_elements(p_months) x loop
    st := private.carry_step(v_lots, (m ->> 'month')::date, (m ->> 'base_allowance')::numeric,
      (m ->> 'base_half_days')::numeric, (m ->> 'used')::numeric, (m ->> 'used_half_days')::numeric, m -> 'rule');
    v_out := v_out || jsonb_build_array(st);
    v_lots := st -> 'lots';
  end loop;
  return v_out;
end $$;

revoke all on function public.portal_admin_rollover(text, text, uuid, uuid),
  public.portal_admin_set_rollover(text, text, uuid, uuid, jsonb),
  public.portal_admin_carry_sim(text, text, jsonb) from public;
grant execute on function public.portal_admin_rollover(text, text, uuid, uuid),
  public.portal_admin_set_rollover(text, text, uuid, uuid, jsonb),
  public.portal_admin_carry_sim(text, text, jsonb) to anon, authenticated;
