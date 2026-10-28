-- Monthly package builder (owner, 28 Oct 2026). Additive: new columns, one new table, new functions;
-- replaced functions keep their behaviour for every existing package and pay-as-you-go client.
--
-- * A package = shoot hours (half and full days only) + edits at pay-as-you-go prices, minus a volume
--   discount by the month's pay-as-you-go value (billing_settings.package_levels, admin-editable):
--   < 10K none · 10K+ 8% · 15K+ 15% · 30K+ custom. The package's allowance is that pay-as-you-go value,
--   its half-day cap the hours / 4, its edit count a tracker; the discount (packages.rate_pct) also
--   prices extras and pay-for-what-you-use months ("package rates").
-- * Clients ask for one on Billing (public.package_requests); the admin builds and publishes an offer;
--   the client accepts: upfront monthly, pay for what you use (month 1 upfront, then month end, if the
--   admin enabled it, with an optional minimum), or 6 months (10% off, two bank-transfer instalments:
--   months 1 and 4; unused value carries into month 7) which the admin confirms.
-- * One source of truth stays private.package_month → private.plan_summary: it now also returns hours
--   (included / used), edits (included / used), the package rate, and the fee due this month.
-- * A package starting on a later 1st doesn't change how this month is billed (booking_terms and the
--   month-end lines treat the client as pay as you go until the start).

-- ---------- columns ----------
alter table public.billing_settings
  add column if not exists package_levels jsonb not null default
    '[{"from": 0, "pct": 0}, {"from": 10000, "pct": 8}, {"from": 15000, "pct": 15}, {"from": 30000, "pct": null}]'
    check (jsonb_typeof(package_levels) = 'array'),
  add column if not exists six_month_pct numeric not null default 10 check (six_month_pct between 0 and 50);

alter table public.packages
  add column if not exists rate_pct numeric check (rate_pct is null or rate_pct between 0 and 60),
  add column if not exists edit_cap numeric check (edit_cap is null or (edit_cap >= 0 and edit_cap = trunc(edit_cap))),
  add column if not exists hours_split jsonb check (hours_split is null or jsonb_typeof(hours_split) = 'object');

alter table public.account_plans
  add column if not exists usage_from date check (usage_from is null or extract(day from usage_from) = 1),
  add column if not exists six_prepay boolean not null default false;

-- ---------- package requests ----------
create table if not exists public.package_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_by uuid,
  created_email text check (length(created_email) <= 320),
  needs text[] not null check (cardinality(needs) between 1 and 3
    and needs <@ array['content', 'property', 'editing']::text[]),
  -- {short, long, long_minutes, property}
  volume jsonb not null check (jsonb_typeof(volume) = 'object'),
  payment_pref text not null check (payment_pref in ('upfront', 'usage')),
  six_months boolean not null default false,
  scripting boolean not null default false,
  notes text check (length(notes) <= 1000),
  status text not null default 'new'
    check (status in ('new', 'offered', 'six_requested', 'accepted', 'closed')),
  offer jsonb check (offer is null or jsonb_typeof(offer) = 'object'),
  offered_at timestamptz,
  offered_by text,
  accepted_at timestamptz,
  accepted_option text check (accepted_option in ('upfront', 'usage', 'six')),
  accepted_by text,
  invoice_id uuid references public.invoices (id) on delete set null,
  package_id uuid references public.packages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists package_requests_account_idx on public.package_requests (account_id, created_at desc);
create index if not exists package_requests_status_idx on public.package_requests (status, created_at desc);
alter table public.package_requests enable row level security;
revoke all on public.package_requests from anon, authenticated;

-- ---------- helpers ----------
-- The discount level for a month's pay-as-you-go value: {from, pct} (pct null = custom).
create or replace function private.package_level(p_value numeric) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select l from public.billing_settings s, jsonb_array_elements(s.package_levels) l
    where s.id and coalesce(p_value, 0) >= (l ->> 'from')::numeric
    order by (l ->> 'from')::numeric desc limit 1), '{"from": 0, "pct": 0}'::jsonb)
$$;

-- Edits a project uses: an edit batch its quantity; a shoot its short + long edits (raw-only none).
create or replace function private.booking_edits(p public.projects) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p.type = 'edit' then coalesce(nullif(p.meta ->> 'quantity', '')::numeric, 1)
    when p.type <> 'shoot' then 0
    else coalesce((select sum(case
        when s ->> 'service' = 'videos' and s -> 'videos' ->> 'by' in ('hours', 'count')
          then coalesce((s -> 'videos' ->> 'short')::numeric, 0) + coalesce((s -> 'videos' ->> 'long')::numeric, 0)
        when s ->> 'service' in ('reels', 'long_form') and coalesce(s ->> 'mode', 'edited') <> 'raw'
          then coalesce((s ->> 'qty')::numeric, 0)
        else 0 end)
      from jsonb_array_elements(coalesce(p.meta -> 'booking' -> 'services', '[]'::jsonb)) s), 0) end
$$;

-- A month's billing: as private.month_mode, and pay for what you use from usage_from (month 1 upfront).
create or replace function private.plan_month_mode(p_billing text, p_upfront_from date, p_started date,
  p_month date, p_usage_from date) returns text
language sql immutable set search_path = '' as $$
  select case when p_usage_from is not null and p_month >= p_usage_from then 'usage'
    else private.month_mode(p_billing, p_upfront_from, p_started, p_month) end
$$;

-- The package fee invoiced for a month: the monthly price, or on a 6-month prepay three months in
-- months 1 and 4 and nothing in between.
create or replace function private.fee_due(p_six boolean, p_term int, p_price numeric, p_month_no int)
returns numeric
language sql immutable set search_path = '' as $$
  select case when coalesce(p_six, false) and p_term = 6 and p_month_no between 1 and 6
    then (case when p_month_no in (1, 4) then p_price * 3 else 0 end) else p_price end
$$;

-- Who may see and change billing for an account (as my_billing_payments).
create or replace function private.billing_access(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.account_role(p_account), '') in ('owner', 'admin')
    or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing'))
$$;

revoke all on function private.package_level(numeric), private.booking_edits(public.projects),
  private.plan_month_mode(text, date, date, date, date), private.fee_due(boolean, int, numeric, int),
  private.billing_access(uuid) from public, anon, authenticated;

-- ---------- booking terms: a package counts from its start ----------
create or replace function private.booking_terms(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.account_plans pl where pl.account_id = p_account
      and (pl.mode = 'budget' or (pl.mode = 'package'
        and coalesce(pl.started_on, (now() at time zone 'Asia/Dubai')::date) <= (now() at time zone 'Asia/Dubai')::date)))
    then 'month_end' else a.payment_terms end
  from public.accounts a where a.id = p_account
$$;

-- ---------- rollover: a 6-month prepay carries into month 7 ----------
create or replace function private.rollover_for(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r private.rollover_rules%rowtype; v_pkg uuid; v_source text := 'client'; pl public.account_plans%rowtype;
  v_m7 date; v_age interval;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.six_prepay and pl.term_months = 6 and pl.started_on is not null then
    v_m7 := (date_trunc('month', pl.started_on) + interval '6 months')::date;
    if p_month < v_m7 then
      v_age := age(v_m7, date_trunc('month', p_month)::date);
      return jsonb_build_object('enabled', true,
        'months', (extract(year from v_age) * 12 + extract(month from v_age))::int,
        'allowance', true, 'days', true, 'source', 'six_months');
    end if;
  end if;
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

-- ---------- carried credit: as before, with pay for what you use from usage_from ----------
create or replace function private.package_carry(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; k public.packages%rowtype; v_target date := date_trunc('month', p_month)::date;
  v_m date; v_next date; v_lots jsonb := '[]'::jsonb; v_in jsonb; v_in_a numeric; v_in_h numeric; l jsonb; st jsonb;
  v_up boolean;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null or k.allowance is null or k.half_day_cap is null then return null; end if;
  v_m := greatest(date_trunc('month', coalesce(pl.started_on, v_target))::date, date '2026-10-01',
    (v_target - interval '24 months')::date);
  while v_m <= v_target loop
    v_next := (v_m + interval '1 month')::date;
    v_up := private.plan_month_mode(pl.package_billing, pl.upfront_from, pl.started_on, v_m, pl.usage_from) = 'upfront';
    -- A usage month carries nothing in or out.
    if not v_up then v_lots := '[]'::jsonb; end if;
    v_in := coalesce((select jsonb_agg(x) from jsonb_array_elements(v_lots) x where (x ->> 'expires')::date >= v_m),
      '[]'::jsonb);
    select coalesce(sum((x ->> 'allowance')::numeric), 0), coalesce(sum((x ->> 'half_days')::numeric), 0)
      into v_in_a, v_in_h from jsonb_array_elements(v_in) x;
    if v_up then
      l := private.value_ledger(p_account, v_m, v_next, k.allowance + v_in_a, k.half_day_cap + v_in_h);
      st := private.carry_step(v_in, v_m, k.allowance, k.half_day_cap, (l ->> 'used')::numeric,
        least((l ->> 'half_days_used')::numeric, k.half_day_cap + v_in_h), private.rollover_for(p_account, v_m));
    else
      st := private.carry_step('[]'::jsonb, v_m, 0, 0, 0, 0, '{}'::jsonb);
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

-- ---------- the package month (the one source of truth) ----------
-- As in 20261110090000, plus: pay for what you use from usage_from; package rates (rate_pct) on extras
-- and on usage months; hours and edits (included / used) in `value`; the fee due this month (6-month
-- prepay: months 1 and 4).
create or replace function private.package_month(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Dubai')::date))::date;
  v_next date; v_mode text; v_full numeric; v_cur text; v_inc jsonb := '[]'::jsonb; u jsonb; v_value boolean;
  v_carry jsonb; l jsonb; v_fees jsonb := '[]'::jsonb; v_fees_total numeric := 0; v_usage numeric := 0;
  v_cr jsonb := jsonb_build_object('total', 0, 'items', '[]'::jsonb); v_min numeric; v_amount numeric;
  v_extras numeric := 0; v_first date; v_ends date; v_no int; v_age interval; v_next_on date; v_next_amt numeric;
  v_notice jsonb; v_out jsonb; v_start date; v_before jsonb := '[]'::jsonb; v_before_total numeric := 0;
  v_rate numeric; v_fee numeric; v_next_mode text; v_edits numeric := 0; v_work numeric := 0;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null then return null; end if;
  if pl.started_on is not null and v_month < date_trunc('month', pl.started_on)::date then return null; end if;
  select * into a from public.accounts where id = p_account;
  v_next := (v_month + interval '1 month')::date;
  v_mode := private.plan_month_mode(pl.package_billing, pl.upfront_from, pl.started_on, v_month, pl.usage_from);
  v_next_mode := private.plan_month_mode(pl.package_billing, pl.upfront_from, pl.started_on, v_next, pl.usage_from);
  v_value := k.allowance is not null and k.half_day_cap is not null;
  v_rate := coalesce(k.rate_pct, 0);
  v_full := private.pkg_price(k.id, a.currency);
  v_cur := (case when v_full is null then k.currency else a.currency end);
  v_full := round(coalesce(v_full, k.monthly_price)
    * (case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end), 0);
  v_min := pl.min_amount;
  v_first := date_trunc('month', coalesce(pl.started_on, v_month))::date;
  v_age := age(v_month, v_first);
  v_no := (extract(year from v_age) * 12 + extract(month from v_age))::int + 1;
  v_fee := private.fee_due(pl.six_prepay, pl.term_months, v_full, v_no);
  if v_value then
    if v_mode = 'upfront' then v_carry := private.package_carry(p_account, v_month); end if;
    l := private.value_ledger(p_account, v_month, v_next,
      k.allowance + coalesce((v_carry ->> 'allowance')::numeric, 0),
      k.half_day_cap + coalesce((v_carry ->> 'half_days')::numeric, 0));
    -- Package rates: what's beyond the package costs the package's discounted price.
    if v_rate > 0 then
      l := l || jsonb_build_object('rows', coalesce((select jsonb_agg(r || jsonb_build_object('extra',
          round((r ->> 'extra')::numeric * (1 - v_rate / 100), 2))) from jsonb_array_elements(l -> 'rows') r),
        '[]'::jsonb));
      l := l || jsonb_build_object('extras_total',
        coalesce((select sum((r ->> 'extra')::numeric) from jsonb_array_elements(l -> 'rows') r), 0));
    end if;
    -- Late-cancellation fees (when the half-days had run out) count as work too.
    select coalesce(jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'qty', li.qty,
        'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by li.created_at), '[]'::jsonb),
      coalesce(round(sum(li.qty * li.unit_price), 2), 0)
      into v_fees, v_fees_total
    from public.line_items li left join public.projects p on p.id = li.project_id
    where li.account_id = p_account and li.kind = 'cancel_fee'
      and (li.billed_invoice_id is null or exists (select 1 from public.invoices i where i.id = li.billed_invoice_id
        and i.category = 'fixed' and i.status = 'draft'))
      and private.item_day(li.service_date, null, li.created_at) >= v_month
      and private.item_day(li.service_date, null, li.created_at) < v_next;
    v_work := coalesce((select sum((r ->> 'value')::numeric) from jsonb_array_elements(l -> 'rows') r), 0);
    v_usage := round(v_work * (1 - v_rate / 100), 2) + v_fees_total;
    v_extras := (l ->> 'extras_total')::numeric + v_fees_total;
    select coalesce(sum(private.booking_edits(p)), 0) into v_edits
    from public.projects p
    where p.id in (select (r ->> 'project_id')::uuid from jsonb_array_elements(l -> 'rows') r
      where not coalesce((r ->> 'late_cancel')::boolean, false));
    if v_mode = 'usage' then
      v_cr := private.month_credits(p_account, v_month, v_next);
      v_amount := greatest(greatest(coalesce(v_min, 0), v_usage) - (v_cr ->> 'total')::numeric, 0);
    else
      v_amount := v_full;
    end if;
    u := jsonb_build_object('usage', '[]'::jsonb, 'overage_total', 0,
      'extras', coalesce((select jsonb_agg(jsonb_build_object('id', null, 'description',
          coalesce(r ->> 'title', 'Booking') || (case when (r ->> 'included')::numeric > 0 then ' (beyond the package)' else '' end),
          'qty', 1, 'unit_price', (r ->> 'extra')::numeric, 'kind', 'package_extra', 'ref', r ->> 'ref'))
        from jsonb_array_elements(l -> 'rows') r where (r ->> 'extra')::numeric > 0), '[]'::jsonb) || v_fees,
      'extras_total', v_extras,
      'value', jsonb_build_object(
        'allowance', k.allowance + coalesce((v_carry ->> 'allowance')::numeric, 0),
        'half_day_cap', k.half_day_cap + coalesce((v_carry ->> 'half_days')::numeric, 0),
        'base_allowance', k.allowance, 'base_half_day_cap', k.half_day_cap, 'carry', v_carry,
        'used', (l ->> 'used')::numeric,
        'half_days_used', (l ->> 'half_days_used')::numeric, 'bookings', l -> 'rows', 'fees', v_fees,
        -- Hours and edits (owner, 28 Oct 2026): a half day is 4 hours.
        'hours_included', (k.half_day_cap + coalesce((v_carry ->> 'half_days')::numeric, 0)) * 4,
        'base_hours', k.half_day_cap * 4,
        'hours_used', (l ->> 'half_days_used')::numeric * 4,
        'hours_split', k.hours_split,
        'edits_included', k.edit_cap, 'edits_used', v_edits,
        'rate_pct', nullif(v_rate, 0), 'work_total', v_work,
        'fee_due', v_fee, 'six_prepay', coalesce(pl.six_prepay, false) and pl.term_months = 6,
        'month_no', v_no, 'term_months', pl.term_months, 'next_mode', v_next_mode,
        'usage_from', pl.usage_from));
  else
    -- Old inclusions packages: as before.
    v_start := greatest(v_month, coalesce(pl.started_on, v_month));
    v_inc := coalesce(k.inclusions, '[]'::jsonb);
    u := private.package_usage(p_account, k.id, v_inc, v_cur, v_start, v_next);
    select coalesce(jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'qty', li.qty,
        'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref) order by li.created_at), '[]'::jsonb),
      coalesce(round(sum(li.qty * li.unit_price), 2), 0)
      into v_before, v_before_total
    from public.line_items li left join public.projects p on p.id = li.project_id
    where li.account_id = p_account
      and private.item_day(li.service_date, p.delivered_at, li.created_at) >= v_month
      and private.item_day(li.service_date, p.delivered_at, li.created_at) < v_start;
    v_extras := (u ->> 'extras_total')::numeric;
    v_usage := v_full + v_extras + v_before_total;
    v_amount := v_usage;
  end if;
  if v_mode = 'usage' then
    v_next_on := v_next - 1;
    v_next_amt := v_amount;
  elsif v_next_mode = 'usage' then
    -- Upfront now, pay for what you use next month: this month's extras go on next month's invoice.
    v_next_on := (v_next + interval '1 month')::date - 1;
    v_next_amt := v_extras;
  else
    v_next_on := v_next;
    v_next_amt := private.fee_due(pl.six_prepay, pl.term_months, v_full, v_no + 1) + v_extras;
  end if;
  -- The last 7 days of an upfront month: what's unused carries over (and when it expires).
  v_out := v_carry -> 'out';
  if v_mode = 'upfront' and v_month = date_trunc('month', v_today)::date and v_today >= v_next - 7
    and jsonb_typeof(v_out) = 'object'
    and ((v_out ->> 'allowance')::numeric > 0 or (v_out ->> 'half_days')::numeric > 0) then
    v_notice := jsonb_build_object('allowance', (v_out ->> 'allowance')::numeric,
      'half_days', (v_out ->> 'half_days')::numeric, 'month', v_next,
      'until', ((v_out ->> 'expires')::date + interval '1 month')::date - 1);
  end if;
  v_ends := coalesce(pl.ends_on, (case when pl.term_months = 6
    then (v_first + interval '6 months' - interval '1 day')::date end));
  return jsonb_build_object('name', k.name, 'currency', v_cur, 'full_price', v_full, 'price', v_full,
    'prorated', false, 'days', v_next - v_month, 'month_days', v_next - v_month,
    'inclusions', v_inc, 'term_months', pl.term_months,
    'discount_pct', (case when pl.term_months = 6 then k.six_month_discount_pct end),
    'month_no', v_no, 'started_on', pl.started_on, 'ends_on', v_ends, 'month', v_month,
    'period_start', coalesce(v_start, v_month), 'renews_on', v_next, 'month_end', v_next - 1,
    'advance', v_mode = 'upfront', 'billing', pl.package_billing, 'month_mode', v_mode,
    'upfront_from', pl.upfront_from, 'minimum', v_min, 'usage_total', v_usage,
    'credits', v_cr -> 'items', 'credits_total', (v_cr ->> 'total')::numeric, 'amount', v_amount,
    'next_invoice_on', v_next_on, 'next_invoice_amount', v_next_amt, 'carry_notice', v_notice,
    'fee_due', v_fee)
    || u || jsonb_build_object('before', v_before, 'before_total', v_before_total,
      'estimate', (case when not v_value or v_mode = 'usage' then v_amount else v_fee + v_extras end));
end $$;

-- ---------- month-end / advance lines ----------
-- As in 20261111090000, plus: a package starting on a later 1st leaves this month pay as you go; the
-- advance fee is the fee due (6-month prepay: months 1 and 4 only); a usage month at package rates
-- shows the discount as its own line.
create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb; v_sub numeric; v_cr numeric;
  v_self uuid; v_late jsonb; v_fee numeric; v_rate numeric; v_work numeric; v_mode text;
begin
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  v_mode := pl.mode;
  -- Before a package's first month the client is still on pay as you go.
  if v_mode = 'package' and pl.started_on is not null and v_month < date_trunc('month', pl.started_on)::date then
    if p_advance or a.payg_invoicing is distinct from 'month_end' then return null; end if;
    v_mode := 'payg';
  end if;
  if v_mode = 'budget' then
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
  elsif v_mode = 'package' then
    v_cat := 'fixed';
    v_pm := private.package_month(p_account, v_month);
    if v_pm is null then return null; end if;
    if not v_pm ? 'value' then
      -- Old inclusions packages: fee at month end plus extras (or in advance), as before.
      if p_advance or not coalesce(pl.bill_in_advance, false) then
        v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
          || private.month_label(v_month), 'qty', 1, 'unit_price', (v_pm ->> 'price')::numeric));
      end if;
      if p_advance then
        v_basis := (v_pm ->> 'price')::numeric;
      else
        for e in select * from jsonb_array_elements(coalesce(v_pm -> 'extras', '[]'::jsonb)
            || coalesce(v_pm -> 'before', '[]'::jsonb)) loop
          v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
            'Extra · ' || (e ->> 'description') || coalesce(' · ' || (e ->> 'ref'), ''),
            'qty', (e ->> 'qty')::numeric, 'unit_price', (e ->> 'unit_price')::numeric,
            'line_item_id', e ->> 'id', 'kind', e ->> 'kind')));
        end loop;
        v_basis := (v_pm ->> 'estimate')::numeric;
      end if;
    else
      -- The draft being refreshed, if any: its own lines don't count as billed.
      select id into v_self from public.invoices where account_id = p_account and category = 'fixed'
        and period_start = v_month and advance = p_advance and status = 'draft' limit 1;
      v_late := private.upfront_unbilled(p_account, v_month, v_self);
      if p_advance then
        if v_pm ->> 'month_mode' <> 'upfront' then return null; end if;
        v_fee := coalesce((v_pm ->> 'fee_due')::numeric, (v_pm ->> 'price')::numeric);
        if v_fee > 0 then
          v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
            || (case when (v_pm -> 'value' ->> 'six_prepay')::boolean
              then private.month_label(v_month) || ' to ' || private.month_label((v_month + interval '2 months')::date)
                || ' (6-month plan, ' || coalesce(round((v_pm ->> 'discount_pct')::numeric)::text, '0') || '% off)'
              else private.month_label(v_month) end),
            'qty', 1, 'unit_price', v_fee));
        end if;
        v_lines := v_lines || (v_late -> 'lines');
        if jsonb_array_length(v_lines) = 0 then return null; end if;
        v_basis := v_fee + (v_late ->> 'total')::numeric;
      else
        -- An upfront month has no month-end invoice: its extras go on next month's.
        if v_pm ->> 'month_mode' <> 'usage' then return null; end if;
        for e in select * from jsonb_array_elements(v_pm -> 'value' -> 'bookings')
          where (value ->> 'value')::numeric > 0 loop
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
            coalesce(nullif(e ->> 'title', ''), 'Booking') || coalesce(' · ' || (e ->> 'ref'), '') || ' · '
              || to_char((e ->> 'date')::date, 'FMDD Mon'),
            'qty', 1, 'unit_price', (e ->> 'value')::numeric, 'kind', 'package_usage'));
        end loop;
        -- Package rates: the discount on the month's work.
        v_rate := coalesce((v_pm -> 'value' ->> 'rate_pct')::numeric, 0);
        v_work := coalesce((v_pm -> 'value' ->> 'work_total')::numeric, 0);
        if v_rate > 0 and v_work > 0 then
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
            'Package rate · ' || round(v_rate)::text || '% off', 'qty', 1,
            'unit_price', -(v_work - round(v_work * (1 - v_rate / 100), 2)), 'kind', 'package_rate'));
        end if;
        for e in select * from jsonb_array_elements(coalesce(v_pm -> 'value' -> 'fees', '[]'::jsonb)) loop
          v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
            (e ->> 'description') || coalesce(' · ' || (e ->> 'ref'), ''),
            'qty', (e ->> 'qty')::numeric, 'unit_price', (e ->> 'unit_price')::numeric,
            'line_item_id', e ->> 'id', 'kind', e ->> 'kind')));
        end loop;
        v_sub := (v_pm ->> 'usage_total')::numeric;
        if coalesce((v_pm ->> 'minimum')::numeric, 0) > v_sub then
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
            'Minimum monthly amount · ' || private.month_label(v_month) || ' (top-up)',
            'qty', 1, 'unit_price', (v_pm ->> 'minimum')::numeric - v_sub));
          v_sub := (v_pm ->> 'minimum')::numeric;
        end if;
        -- Back from upfront: earlier upfront extras not billed yet.
        v_lines := v_lines || (v_late -> 'lines');
        v_sub := v_sub + (v_late ->> 'total')::numeric;
        -- Credits, never below zero.
        for e in select * from jsonb_array_elements(coalesce(v_pm -> 'credits', '[]'::jsonb)) loop
          v_cr := least((e ->> 'amount')::numeric, v_sub);
          exit when v_cr <= 0;
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', e ->> 'description',
            'qty', 1, 'unit_price', -v_cr, 'kind', 'credit'));
          v_sub := v_sub - v_cr;
        end loop;
        if jsonb_array_length(v_lines) = 0 then return null; end if;
        v_basis := (v_pm ->> 'usage_total')::numeric + (v_late ->> 'total')::numeric;
      end if;
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

-- ---------- the builder's numbers ----------
-- Rates at the client's prices (their own price, else the price list in their currency), the discount
-- levels and the 6-month discount.
create or replace function private.package_rate(p_account uuid, p_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(private.client_price(p_account, p_key),
    (select case a.currency when 'USD' then r.amount_usd else r.amount_aed end
      from public.rate_card r, public.accounts a where r.key = p_key and a.id = p_account))
$$;

create or replace function private.package_rates(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'half_day', private.package_rate(p_account, 'content_4h'),
    'full_day', private.package_rate(p_account, 'content_8h'),
    'short_edit', private.package_rate(p_account, 'content_short_edit'),
    'long_edit', private.package_rate(p_account, 'content_long_edit'),
    'long_per_min', jsonb_build_object(
      '5', private.package_rate(p_account, 'content_long_5'), '10', private.package_rate(p_account, 'content_long_10'),
      '15', private.package_rate(p_account, 'content_long_15'), '20', private.package_rate(p_account, 'content_long_20'),
      '25', private.package_rate(p_account, 'content_long_25'), '30', private.package_rate(p_account, 'content_long_30')),
    'levels', s.package_levels, 'six_month_pct', s.six_month_pct)
  from public.billing_settings s where s.id
$$;

-- An offer from the admin's numbers: prices from the rates (server-side), the discount from the level
-- unless the admin set one, the price as the admin set it (default: pay as you go less the discount).
-- p: {name, full_days, half_days, short_edits, long_edits, long_minutes, property_value, discount_pct,
--     price, start, usage_enabled, minimum, six_enabled, note}
create or replace function private.build_offer(p_account uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb := private.package_rates(p_account); a public.accounts%rowtype;
  v_f int := coalesce(nullif(p ->> 'full_days', '')::int, 0); v_h int := coalesce(nullif(p ->> 'half_days', '')::int, 0);
  v_s int := coalesce(nullif(p ->> 'short_edits', '')::int, 0); v_l int := coalesce(nullif(p ->> 'long_edits', '')::int, 0);
  v_min_len int := coalesce(nullif(p ->> 'long_minutes', '')::int, 5);
  v_prop numeric := coalesce(nullif(p ->> 'property_value', '')::numeric, 0);
  v_long numeric; v_payg numeric; v_lvl jsonb; v_pct numeric; v_price numeric; v_six numeric;
  v_start date := nullif(p ->> 'start', '')::date; v_minimum numeric := nullif(p ->> 'minimum', '')::numeric;
  v_half_rate numeric; v_save numeric; v_six_month numeric;
begin
  select * into a from public.accounts where id = p_account;
  if v_f < 0 or v_h < 0 or v_s < 0 or v_l < 0 or v_f > 60 or v_h > 60 or v_s > 500 or v_l > 200 then
    raise exception 'days and edits are whole numbers from 0' using errcode = '22023';
  end if;
  if v_f + v_h + v_s + v_l = 0 then raise exception 'add hours or edits' using errcode = '22023'; end if;
  if v_min_len not in (5, 10, 15, 20, 25, 30) then raise exception 'long-form length is 5 to 30 minutes' using errcode = '22023'; end if;
  if v_prop < 0 then raise exception 'property value is 0 or more' using errcode = '22023'; end if;
  if (v_f > 0 and r ->> 'full_day' is null) or (v_h > 0 and r ->> 'half_day' is null)
    or (v_s > 0 and r ->> 'short_edit' is null) then
    raise exception 'set the content prices first' using errcode = '22023';
  end if;
  v_long := coalesce((r -> 'long_per_min' ->> v_min_len::text)::numeric * v_min_len, (r ->> 'long_edit')::numeric);
  if v_l > 0 and v_long is null then raise exception 'set the long-form edit price first' using errcode = '22023'; end if;
  v_payg := v_f * coalesce((r ->> 'full_day')::numeric, 0) + v_h * coalesce((r ->> 'half_day')::numeric, 0)
    + v_s * coalesce((r ->> 'short_edit')::numeric, 0) + v_l * coalesce(v_long, 0) + v_prop;
  v_lvl := private.package_level(v_payg);
  v_pct := coalesce(nullif(p ->> 'discount_pct', '')::numeric, (v_lvl ->> 'pct')::numeric,
    (select max((l ->> 'pct')::numeric) from public.billing_settings s, jsonb_array_elements(s.package_levels) l where s.id), 0);
  if v_pct < 0 or v_pct > 60 then raise exception 'discount is 0 to 60%%' using errcode = '22023'; end if;
  v_price := round(coalesce(nullif(p ->> 'price', '')::numeric, v_payg * (1 - v_pct / 100)), 0);
  if v_price <= 0 then raise exception 'enter the monthly price' using errcode = '22023'; end if;
  if v_start is null or extract(day from v_start) <> 1
    or v_start < date_trunc('month', (now() at time zone 'Asia/Dubai'))::date then
    raise exception 'the package starts on the 1st of this month or later' using errcode = '22023';
  end if;
  if v_minimum is not null and v_minimum < 0 then raise exception 'the minimum is 0 or more' using errcode = '22023'; end if;
  v_six := (r ->> 'six_month_pct')::numeric;
  v_six_month := round(v_price * (1 - v_six / 100), 0);
  v_half_rate := round(coalesce((r ->> 'half_day')::numeric, 0) * (1 - v_pct / 100), 0);
  v_save := greatest(v_payg - v_price, 0);
  return jsonb_build_object(
    'name', coalesce(nullif(left(btrim(coalesce(p ->> 'name', '')), 60), ''), 'Monthly package'),
    'currency', a.currency,
    'full_days', v_f, 'half_days', v_h, 'hours', (v_f * 2 + v_h) * 4,
    'short_edits', v_s, 'long_edits', v_l, 'edits', v_s + v_l, 'long_minutes', v_min_len,
    'property_value', v_prop,
    'rates', jsonb_build_object('full_day', r -> 'full_day', 'half_day', r -> 'half_day',
      'short_edit', r -> 'short_edit', 'long_edit', v_long),
    'payg_total', v_payg, 'level', v_lvl, 'discount_pct', v_pct, 'price', v_price,
    'savings', v_save, 'half_day_package_rate', v_half_rate,
    'extra_half_days', case when v_half_rate > 0 then floor(v_save / v_half_rate) else 0 end,
    'start', v_start,
    'usage_enabled', coalesce((p ->> 'usage_enabled')::boolean, false),
    'minimum', v_minimum,
    'six_enabled', coalesce((p ->> 'six_enabled')::boolean, true),
    'six_month_pct', v_six, 'six_month_price', v_six_month,
    'six_total', v_six_month * 6, 'six_instalment', v_six_month * 3,
    'note', nullif(left(btrim(coalesce(p ->> 'note', '')), 500), ''));
end $$;

-- Put an accepted offer on the account: the client's own package, the plan, and the first invoice
-- (published: month 1 upfront, or months 1–3 on the 6-month plan). Returns the invoice.
create or replace function private.apply_package_offer(p_request uuid, p_option text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.package_requests%rowtype; o jsonb; a public.accounts%rowtype; pl public.account_plans%rowtype;
  v_start date; v_today date := (now() at time zone 'Asia/Dubai')::date; v_pkg uuid; v_six boolean;
  v_inv uuid; v_pub jsonb; v_sp jsonb;
begin
  select * into q from public.package_requests where id = p_request for update;
  o := q.offer;
  if o is null then raise exception 'no offer yet' using errcode = '22023'; end if;
  select * into a from public.accounts where id = q.account_id;
  select * into pl from public.account_plans where account_id = a.id;
  if pl.mode in ('package', 'budget') then
    raise exception 'this account already has a monthly plan' using errcode = '22023';
  end if;
  v_six := p_option = 'six';
  v_start := (o ->> 'start')::date;
  if v_start < date_trunc('month', v_today)::date then
    raise exception 'this offer has expired' using errcode = '22023';
  end if;
  -- This month's 1st only when nothing is booked this month (no switch to sort out).
  if v_start <= v_today then
    v_sp := private.switch_preview(a.id, v_start);
    if jsonb_array_length(coalesce(v_sp -> 'projects', '[]'::jsonb)) > 0 then
      raise exception 'start next month: there are bookings this month' using errcode = '22023';
    end if;
  end if;
  insert into public.packages (account_id, name, monthly_price, currency, inclusions, overage, visible,
    six_month_discount_pct, suggest, allowance, half_day_cap, edit_cap, rate_pct, hours_split)
  values (a.id, o ->> 'name', (o ->> 'price')::numeric, a.currency, '[]', '[]', false,
    case when v_six then (o ->> 'six_month_pct')::numeric else 0 end, false,
    (o ->> 'payg_total')::numeric, (o ->> 'full_days')::numeric * 2 + (o ->> 'half_days')::numeric,
    (o ->> 'edits')::numeric, nullif((o ->> 'discount_pct')::numeric, 0),
    jsonb_build_object('full', (o ->> 'full_days')::int, 'half', (o ->> 'half_days')::int))
  returning id into v_pkg;
  insert into public.account_plans (account_id, mode, package_id, started_on, renews_on, term_months, ends_on,
    bill_in_advance, package_billing, min_amount, upfront_from, usage_from, six_prepay)
  values (a.id, 'package', v_pkg, v_start, (v_start + interval '1 month')::date, case when v_six then 6 else 1 end,
    case when v_six then (v_start + interval '6 months' - interval '1 day')::date end, false, 'upfront',
    case when p_option = 'usage' then nullif((o ->> 'minimum')::numeric, 0) end, v_start,
    case when p_option = 'usage' then (v_start + interval '1 month')::date end, v_six)
  on conflict (account_id) do update set mode = 'package', package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, term_months = excluded.term_months,
    ends_on = excluded.ends_on, bill_in_advance = false, package_billing = 'upfront',
    min_amount = excluded.min_amount, upfront_from = excluded.upfront_from, usage_from = excluded.usage_from,
    six_prepay = excluded.six_prepay, updated_at = now();
  v_inv := private.month_end_draft(a.id, v_start, true, p_actor);
  if v_inv is null then raise exception 'couldn''t make the first invoice' using errcode = '22023'; end if;
  v_pub := private.publish_invoice(v_inv, p_actor);
  update public.package_requests set status = 'accepted', accepted_at = coalesce(accepted_at, now()),
    accepted_option = p_option, accepted_by = coalesce(accepted_by, p_actor), invoice_id = v_inv,
    package_id = v_pkg, updated_at = now()
    where id = q.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', a.id, 'Monthly package ' || (o ->> 'name') || ' accepted ('
      || (case p_option when 'six' then '6 months' when 'usage' then 'pay for what you use from month 2'
        else 'upfront monthly' end) || '), from ' || to_char(v_start, 'FMDD Mon YYYY')
      || ', first invoice ' || coalesce(v_pub ->> 'number', ''));
  return v_pub || jsonb_build_object('invoice_id', v_inv, 'package_id', v_pkg);
end $$;

revoke all on function private.package_rate(uuid, text), private.package_rates(uuid), private.build_offer(uuid, jsonb),
  private.apply_package_offer(uuid, text, text) from public, anon, authenticated;

-- ---------- the client ----------
-- Ask for a package. p: {needs[], short, long, long_minutes, property, payment_pref, six_months,
-- scripting, notes}. One open request at a time (a new one replaces a request not offered yet).
create or replace function public.request_package(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; v_needs text[]; v_vol jsonb; v_email text;
begin
  if not private.billing_access(p_account) then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_plans where account_id = p_account and mode in ('package', 'budget')) then
    raise exception 'you already have a monthly plan' using errcode = '22023';
  end if;
  if exists (select 1 from public.package_requests where account_id = p_account and status in ('offered', 'six_requested')) then
    raise exception 'your package is ready: see it on Billing' using errcode = '22023';
  end if;
  select array_agg(distinct x) into v_needs from jsonb_array_elements_text(coalesce(p -> 'needs', '[]'::jsonb)) x;
  if v_needs is null or not v_needs <@ array['content', 'property', 'editing']::text[] then
    raise exception 'choose what you need' using errcode = '22023';
  end if;
  v_vol := jsonb_build_object(
    'short', least(greatest(coalesce(nullif(p ->> 'short', '')::int, 0), 0), 500),
    'long', least(greatest(coalesce(nullif(p ->> 'long', '')::int, 0), 0), 200),
    'long_minutes', case when nullif(p ->> 'long_minutes', '')::int in (5, 10, 15, 20, 25, 30)
      then (p ->> 'long_minutes')::int end,
    'property', least(greatest(coalesce(nullif(p ->> 'property', '')::int, 0), 0), 500));
  if (v_vol ->> 'short')::int + (v_vol ->> 'long')::int + (v_vol ->> 'property')::int = 0 then
    raise exception 'tell us your monthly volume' using errcode = '22023';
  end if;
  if coalesce(p ->> 'payment_pref', '') not in ('upfront', 'usage') then
    raise exception 'choose how you''d like to pay' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  delete from public.package_requests where account_id = p_account and status = 'new';
  insert into public.package_requests (account_id, created_by, created_email, needs, volume, payment_pref,
    six_months, scripting, notes)
  values (p_account, auth.uid(), v_email, v_needs, v_vol, p ->> 'payment_pref',
    coalesce((p ->> 'six_months')::boolean, false), coalesce((p ->> 'scripting')::boolean, false),
    nullif(left(btrim(coalesce(p ->> 'notes', '')), 1000), ''))
  returning id into v;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values ('client:' || coalesce(v_email, auth.uid()::text), 'create', p_account, 'Asked for a monthly package');
  return v;
end $$;

-- Billing's package corner: the open request or offer, and for pay-as-you-go clients this month's work
-- at package rates (the upsell line).
create or replace function public.my_package_offer(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q public.package_requests%rowtype; pl public.account_plans%rowtype; v_val numeric; v_lvl jsonb;
  v_hint jsonb; a public.accounts%rowtype;
begin
  if not private.billing_access(p_account) then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  select * into a from public.accounts where id = p_account;
  select * into pl from public.account_plans where account_id = p_account;
  select * into q from public.package_requests where account_id = p_account
    and (status in ('new', 'offered', 'six_requested')
      or (status = 'accepted' and accepted_at > now() - interval '14 days'))
    order by created_at desc limit 1;
  if coalesce(pl.mode, 'payg') = 'payg' then
    v_val := (private.switch_preview(p_account, (now() at time zone 'Asia/Dubai')::date) ->> 'usage_total')::numeric;
    v_lvl := private.package_level(v_val);
    if v_val > 0 and coalesce((v_lvl ->> 'pct')::numeric, 0) > 0 then
      v_hint := jsonb_build_object('value', v_val, 'pct', (v_lvl ->> 'pct')::numeric,
        'package', round(v_val * (1 - (v_lvl ->> 'pct')::numeric / 100), 0), 'currency', a.currency);
    end if;
  end if;
  return jsonb_build_object('mode', coalesce(pl.mode, 'payg'), 'hint', v_hint,
    'request', case when q.id is null then null else jsonb_build_object('id', q.id, 'status', q.status,
      'needs', to_jsonb(q.needs), 'volume', q.volume, 'payment_pref', q.payment_pref, 'six_months', q.six_months,
      'scripting', q.scripting, 'created_at', q.created_at, 'offered_at', q.offered_at,
      'accepted_option', q.accepted_option, 'offer', q.offer) end);
end $$;

-- Accept the offer: upfront monthly or pay for what you use (if enabled) sets the plan and the first
-- invoice; 6 months goes to Milkywayy to confirm.
create or replace function public.accept_package_offer(p_request uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.package_requests%rowtype; v_email text;
begin
  select * into q from public.package_requests where id = p_request;
  if q.id is null or not private.billing_access(q.account_id) then
    raise exception 'not your offer' using errcode = '42501';
  end if;
  if q.status <> 'offered' then raise exception 'this offer isn''t open' using errcode = '22023'; end if;
  if p_option not in ('upfront', 'usage', 'six') then raise exception 'choose how to pay' using errcode = '22023'; end if;
  if p_option = 'usage' and not coalesce((q.offer ->> 'usage_enabled')::boolean, false) then
    raise exception 'pay for what you use isn''t on this offer' using errcode = '22023';
  end if;
  if p_option = 'six' and not coalesce((q.offer ->> 'six_enabled')::boolean, false) then
    raise exception 'the 6-month plan isn''t on this offer' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if p_option = 'six' then
    update public.package_requests set status = 'six_requested', accepted_option = 'six',
      accepted_by = 'client:' || coalesce(v_email, auth.uid()::text), updated_at = now()
      where id = q.id;
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values ('client:' || coalesce(v_email, auth.uid()::text), 'update', q.account_id,
        'Asked for the 6-month plan on ' || (q.offer ->> 'name'));
    return jsonb_build_object('status', 'six_requested');
  end if;
  return private.apply_package_offer(q.id, p_option, 'client:' || coalesce(v_email, auth.uid()::text))
    || jsonb_build_object('status', 'accepted');
end $$;

revoke all on function public.request_package(uuid, jsonb), public.my_package_offer(uuid),
  public.accept_package_offer(uuid, text) from public, anon;
grant execute on function public.request_package(uuid, jsonb), public.my_package_offer(uuid),
  public.accept_package_offer(uuid, text) to authenticated;

-- ---------- the admin ----------
create or replace function public.portal_admin_package_requests(p_secret text, p_actor text,
  p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'account_id', q.account_id,
      'account', a.name, 'currency', a.currency, 'status', q.status, 'needs', to_jsonb(q.needs),
      'volume', q.volume, 'payment_pref', q.payment_pref, 'six_months', q.six_months, 'scripting', q.scripting,
      'created_at', q.created_at, 'offered_at', q.offered_at, 'accepted_at', q.accepted_at,
      'accepted_option', q.accepted_option, 'price', q.offer -> 'price', 'created_email', q.created_email)
      order by (q.status in ('new', 'six_requested')) desc, q.created_at desc)
    from public.package_requests q join public.accounts a on a.id = q.account_id
    where (p_status is null and q.status <> 'closed') or q.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_package_request(p_secret text, p_actor text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q public.package_requests%rowtype; a public.accounts%rowtype; pl public.account_plans%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into q from public.package_requests where id = p_id;
  if q.id is null then return null; end if;
  select * into a from public.accounts where id = q.account_id;
  select * into pl from public.account_plans where account_id = a.id;
  return to_jsonb(q) || jsonb_build_object('account', a.name, 'currency', a.currency,
    'plan_mode', coalesce(pl.mode, 'payg'), 'rates', private.package_rates(a.id),
    'this_month', private.switch_preview(a.id, (now() at time zone 'Asia/Dubai')::date) -> 'usage_total');
end $$;

-- Work the offer out (no save): the builder's live numbers come from the same function as the saved offer.
create or replace function public.portal_admin_preview_package_offer(p_secret text, p_actor text, p_id uuid,
  p_offer jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_account uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select account_id into v_account from public.package_requests where id = p_id;
  if v_account is null then raise exception 'no such request' using errcode = '22023'; end if;
  return private.build_offer(v_account, p_offer);
end $$;

create or replace function public.portal_admin_publish_package_offer(p_secret text, p_actor text, p_id uuid,
  p_offer jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.package_requests%rowtype; o jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into q from public.package_requests where id = p_id for update;
  if q.id is null then raise exception 'no such request' using errcode = '22023'; end if;
  if q.status not in ('new', 'offered') then raise exception 'this request is already decided' using errcode = '22023'; end if;
  o := private.build_offer(q.account_id, p_offer);
  update public.package_requests set offer = o, status = 'offered', offered_at = now(), offered_by = p_actor,
    updated_at = now() where id = q.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', q.account_id, 'Monthly package offer published: ' || (o ->> 'name') || ', '
      || (o ->> 'currency') || ' ' || (o ->> 'price') || ' / month (' || (o ->> 'hours') || ' h, '
      || (o ->> 'edits') || ' edits)');
  return o || jsonb_build_object('recipients', private.billing_recipients(q.account_id, 'invoice_issued'));
end $$;

create or replace function public.portal_admin_confirm_six_months(p_secret text, p_actor text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.package_requests%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into q from public.package_requests where id = p_id;
  if q.id is null or q.status <> 'six_requested' then
    raise exception 'no 6-month request to confirm' using errcode = '22023';
  end if;
  return private.apply_package_offer(q.id, 'six', p_actor) || jsonb_build_object('account', q.account_id);
end $$;

-- Close a request (declined, or handled another way). A 6-month request goes back to the offer.
create or replace function public.portal_admin_close_package_request(p_secret text, p_actor text, p_id uuid,
  p_back_to_offer boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.package_requests%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into q from public.package_requests where id = p_id for update;
  if q.id is null or q.status = 'accepted' then raise exception 'nothing to close' using errcode = '22023'; end if;
  update public.package_requests set
    status = case when p_back_to_offer and q.status = 'six_requested' then 'offered' else 'closed' end,
    accepted_option = case when p_back_to_offer then null else accepted_option end, updated_at = now()
    where id = q.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', q.account_id, case when p_back_to_offer then 'Monthly package: 6-month plan declined, offer kept'
      else 'Monthly package request closed' end);
end $$;

-- The discount levels and the 6-month discount (Money → Prices & packages).
create or replace function public.portal_admin_save_package_levels(p_secret text, p_actor text, p_levels jsonb,
  p_six_month_pct numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare l jsonb; v_prev numeric := -1; v_clean jsonb := '[]'::jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if jsonb_typeof(p_levels) <> 'array' or jsonb_array_length(p_levels) not between 1 and 8 then
    raise exception 'one to eight levels' using errcode = '22023';
  end if;
  for l in select x from jsonb_array_elements(p_levels) x order by (x ->> 'from')::numeric loop
    if (l ->> 'from')::numeric is null or (l ->> 'from')::numeric < 0 or (l ->> 'from')::numeric <= v_prev then
      raise exception 'each level starts above the one before' using errcode = '22023';
    end if;
    if l ->> 'pct' is not null and ((l ->> 'pct')::numeric < 0 or (l ->> 'pct')::numeric > 60) then
      raise exception 'discounts are 0 to 60%%' using errcode = '22023';
    end if;
    v_prev := (l ->> 'from')::numeric;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('from', v_prev, 'pct', (l ->> 'pct')::numeric));
  end loop;
  if (v_clean -> 0 ->> 'from')::numeric <> 0 then raise exception 'the first level starts at 0' using errcode = '22023'; end if;
  if p_six_month_pct is null or p_six_month_pct < 0 or p_six_month_pct > 50 then
    raise exception 'the 6-month discount is 0 to 50%%' using errcode = '22023';
  end if;
  update public.billing_settings set package_levels = v_clean, six_month_pct = p_six_month_pct, updated_at = now()
    where id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', null, 'Package discount levels saved');
end $$;

revoke all on function public.portal_admin_package_requests(text, text, text),
  public.portal_admin_package_request(text, text, uuid),
  public.portal_admin_preview_package_offer(text, text, uuid, jsonb),
  public.portal_admin_publish_package_offer(text, text, uuid, jsonb),
  public.portal_admin_confirm_six_months(text, text, uuid),
  public.portal_admin_close_package_request(text, text, uuid, boolean),
  public.portal_admin_save_package_levels(text, text, jsonb, numeric) from public;
grant execute on function public.portal_admin_package_requests(text, text, text),
  public.portal_admin_package_request(text, text, uuid),
  public.portal_admin_preview_package_offer(text, text, uuid, jsonb),
  public.portal_admin_publish_package_offer(text, text, uuid, jsonb),
  public.portal_admin_confirm_six_months(text, text, uuid),
  public.portal_admin_close_package_request(text, text, uuid, boolean),
  public.portal_admin_save_package_levels(text, text, jsonb, numeric) to anon, authenticated;
