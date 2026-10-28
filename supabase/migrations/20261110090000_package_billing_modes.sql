-- Package billing modes, no pro-rating (owner, 28 Oct 2026). Additive: new columns and functions,
-- functions replaced; nothing dropped, no data deleted.
--
-- * Calendar months, no pro-rating: every month (1st to last day) has the full allowance and shoot days,
--   the first month too.
-- * Package invoice mode per client (account_plans.package_billing):
--   - 'usage' ("Month end — pay for what you use"): the allowance is a tracker. The month-end invoice is the
--     month's work at the client's prices (or the optional minimum monthly amount, if higher), minus what
--     was already paid at booking. No rollover.
--   - 'upfront' ("Start of month — pay upfront"): the package fee is invoiced on the 1st. Unused allowance
--     and days roll over by the rollover rules; work beyond allowance + carried credit goes on next month's
--     invoice as extras.
-- * Switching from pay as you go mid-month: this month's work counts toward the package, paid booking
--   invoices are credited, unpaid booking invoices and this month's pay-as-you-go draft are voided and their
--   work moves onto the package's month-end invoice. With 'upfront', the switch month is billed on usage and
--   upfront billing starts on the 1st of next month (account_plans.upfront_from).
-- * One source of truth: private.package_month (plan usage, carried credit, month-end amount, next invoice,
--   carry-over notice) → private.plan_summary, read by the portal and by every admin page.
-- * Invoice lines may carry a credit (kind 'credit', negative price); an invoice never goes below zero.
-- * Saved card and autopay are retired: autopay_due returns nothing. Columns kept.

-- ---------- columns ----------
alter table public.account_plans
  add column if not exists package_billing text not null default 'usage'
    check (package_billing in ('usage', 'upfront')),
  add column if not exists min_amount numeric check (min_amount is null or min_amount >= 0),
  add column if not exists upfront_from date check (upfront_from is null or extract(day from upfront_from) = 1);

-- Existing package clients keep their invoice timing: billed in advance → upfront (from their first full
-- month), otherwise month end on usage. (Prod, 28 Oct 2026: 2 package clients, both month end.)
update public.account_plans set
  package_billing = (case when bill_in_advance then 'upfront' else 'usage' end),
  upfront_from = (case when bill_in_advance and started_on is not null then
    (case when extract(day from started_on) = 1 then started_on
      else (date_trunc('month', started_on) + interval '1 month')::date end) end)
where mode = 'package';

-- ---------- invoice lines: credits ----------
create or replace function private.clean_lines(p_lines jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare l jsonb; out jsonb := '[]'::jsonb; v_q numeric; v_p numeric;
begin
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'up to 100 lines' using errcode = '22023'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce(length(btrim(l ->> 'description')), 0) not between 1 and 200 then
      raise exception 'every line needs a description' using errcode = '22023';
    end if;
    v_q := (l ->> 'qty')::numeric; v_p := (l ->> 'unit_price')::numeric;
    -- A credit (paid at booking, invoiced separately) is the one line with a negative price.
    if v_q is null or v_q <= 0 or v_p is null or (v_p < 0 and coalesce(l ->> 'kind', '') <> 'credit') then
      raise exception 'quantities above 0 and prices of 0 or more' using errcode = '22023';
    end if;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description', btrim(l ->> 'description'),
      'qty', v_q, 'unit_price', v_p, 'amount', round(v_q * v_p, 2),
      'line_item_id', l ->> 'line_item_id', 'kind', l ->> 'kind')));
  end loop;
  return out;
end $$;

-- ---------- helpers ----------
-- How a month is billed: upfront from upfront_from on, usage before (and always for 'usage').
create or replace function private.month_mode(p_billing text, p_upfront_from date, p_started date, p_month date)
returns text
language sql immutable set search_path = '' as $$
  select case when p_billing = 'upfront'
    and p_month >= coalesce(p_upfront_from, date_trunc('month', coalesce(p_started, p_month))::date)
    then 'upfront' else 'usage' end
$$;

-- What was already invoiced for a month's work outside the package: paid booking invoices (credited at
-- what was kept after refunds) and, for safety, booking invoices still open (billed there, not twice).
-- {total, items: [{description, amount, invoice_id, number, ref, paid}]}
create or replace function private.month_credits(p_account uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('total', coalesce(sum(x.amount), 0),
    'items', coalesce(jsonb_agg(jsonb_build_object('description', x.label, 'amount', x.amount,
      'invoice_id', x.id, 'number', x.number, 'ref', x.ref, 'paid', x.paid) order by x.issued_on, x.number), '[]'::jsonb))
  from (
    select i.id, i.number, i.issued_on, p.ref, i.status = 'paid' as paid,
      (case when i.status = 'paid' then greatest(i.amount - coalesce(i.refunded, 0), 0) else i.amount end) as amount,
      (case when i.status = 'paid' then (case when i.stage = 'deposit' then 'Deposit paid' else 'Paid at booking' end)
        else 'Invoiced separately' end) || coalesce(' · ' || i.number, '') || coalesce(' · ' || p.ref, '') as label
    from public.invoices i join public.projects p on p.id = i.project_id
    where p.account_id = p_account and i.category = 'booking' and i.status <> 'void'
      and p.status not in ('cancelled', 'awaiting_payment')
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) >= p_from
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) < p_to
  ) x where x.amount > 0
$$;

-- ---------- rollover (upfront months only, full months) ----------
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
    v_up := private.month_mode(pl.package_billing, pl.upfront_from, pl.started_on, v_m) = 'upfront';
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
-- A package's calendar month: full allowance and days, usage, carried credit (upfront), what the month
-- costs and the next invoice. Shape kept for older callers (price, estimate, period_start, renews_on, ...).
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
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null then return null; end if;
  if pl.started_on is not null and v_month < date_trunc('month', pl.started_on)::date then return null; end if;
  select * into a from public.accounts where id = p_account;
  v_next := (v_month + interval '1 month')::date;
  v_mode := private.month_mode(pl.package_billing, pl.upfront_from, pl.started_on, v_month);
  v_value := k.allowance is not null and k.half_day_cap is not null;
  v_full := private.pkg_price(k.id, a.currency);
  v_cur := (case when v_full is null then k.currency else a.currency end);
  v_full := round(coalesce(v_full, k.monthly_price)
    * (case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end), 0);
  v_min := pl.min_amount;
  if v_value then
    if v_mode = 'upfront' then v_carry := private.package_carry(p_account, v_month); end if;
    l := private.value_ledger(p_account, v_month, v_next,
      k.allowance + coalesce((v_carry ->> 'allowance')::numeric, 0),
      k.half_day_cap + coalesce((v_carry ->> 'half_days')::numeric, 0));
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
    v_usage := coalesce((select sum((r ->> 'value')::numeric) from jsonb_array_elements(l -> 'rows') r), 0)
      + v_fees_total;
    v_extras := (l ->> 'extras_total')::numeric + v_fees_total;
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
        'half_days_used', (l ->> 'half_days_used')::numeric, 'bookings', l -> 'rows', 'fees', v_fees));
  else
    -- Old inclusions packages: as before (work before the start day stays pay as you go), but the full
    -- price and inclusions from the first month.
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
  else
    v_next_on := v_next;
    v_next_amt := v_full + v_extras;
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
  v_first := date_trunc('month', coalesce(pl.started_on, v_month))::date;
  v_ends := coalesce(pl.ends_on, (case when pl.term_months = 6
    then (v_first + interval '6 months' - interval '1 day')::date end));
  v_age := age(v_month, v_first);
  v_no := (extract(year from v_age) * 12 + extract(month from v_age))::int + 1;
  return jsonb_build_object('name', k.name, 'currency', v_cur, 'full_price', v_full, 'price', v_full,
    'prorated', false, 'days', v_next - v_month, 'month_days', v_next - v_month,
    'inclusions', v_inc, 'term_months', pl.term_months,
    'discount_pct', (case when pl.term_months = 6 then k.six_month_discount_pct end),
    'month_no', v_no, 'started_on', pl.started_on, 'ends_on', v_ends, 'month', v_month,
    'period_start', coalesce(v_start, v_month), 'renews_on', v_next, 'month_end', v_next - 1,
    'advance', v_mode = 'upfront', 'billing', pl.package_billing, 'month_mode', v_mode,
    'upfront_from', pl.upfront_from, 'minimum', v_min, 'usage_total', v_usage,
    'credits', v_cr -> 'items', 'credits_total', (v_cr ->> 'total')::numeric, 'amount', v_amount,
    'next_invoice_on', v_next_on, 'next_invoice_amount', v_next_amt, 'carry_notice', v_notice)
    || u || jsonb_build_object('before', v_before, 'before_total', v_before_total,
      'estimate', (case when not v_value or v_mode = 'usage' then v_amount else v_full + v_extras end));
end $$;

-- Today's package month.
create or replace function private.plan_view(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.package_month(p_account, (now() at time zone 'Asia/Dubai')::date)
$$;

-- The plan card's numbers (value packages), the same for the client and every admin page.
create or replace function private.plan_summary(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when pm is null or not pm ? 'value' then null else (pm -> 'value') || jsonb_build_object(
    'name', pm ->> 'name', 'currency', pm ->> 'currency', 'price', (pm ->> 'price')::numeric,
    'month', pm ->> 'month', 'month_end', pm ->> 'month_end', 'renews_on', pm ->> 'renews_on',
    'prorated', false, 'billing', pm ->> 'billing', 'month_mode', pm ->> 'month_mode',
    'upfront_from', pm ->> 'upfront_from', 'minimum', (pm ->> 'minimum')::numeric,
    'usage_total', (pm ->> 'usage_total')::numeric, 'extras_total', (pm ->> 'extras_total')::numeric,
    'credits', pm -> 'credits', 'credits_total', (pm ->> 'credits_total')::numeric,
    'amount', (pm ->> 'amount')::numeric, 'estimate', (pm ->> 'estimate')::numeric,
    'next_invoice_on', pm ->> 'next_invoice_on', 'next_invoice_amount', (pm ->> 'next_invoice_amount')::numeric,
    'carry_notice', pm -> 'carry_notice') end
  from (select private.plan_view(p_account) as pm) x
$$;

-- ---------- invoices ----------
-- Month-end / advance lines. Packages: an upfront month's invoice (p_advance) is the fee plus the previous
-- month's extras when that month was upfront too; a usage month's month-end invoice is its work line by
-- line, a minimum top-up, and the credits. Budget and pay as you go as before (prod body, 28 Oct 2026).
create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; v_prev jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb; v_sub numeric; v_cr numeric;
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
    elsif p_advance then
      if v_pm ->> 'month_mode' <> 'upfront' then return null; end if;
      v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
        || private.month_label(v_month), 'qty', 1, 'unit_price', (v_pm ->> 'price')::numeric));
      v_basis := (v_pm ->> 'price')::numeric;
      v_prev := private.package_month(p_account, (v_month - interval '1 month')::date);
      if v_prev is not null and v_prev ->> 'month_mode' = 'upfront' then
        for e in select * from jsonb_array_elements(coalesce(v_prev -> 'extras', '[]'::jsonb)) loop
          v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
            'Extra · ' || (e ->> 'description') || coalesce(' · ' || (e ->> 'ref'), '') || ' · '
              || private.month_label((v_prev ->> 'month')::date),
            'qty', (e ->> 'qty')::numeric, 'unit_price', (e ->> 'unit_price')::numeric,
            'line_item_id', e ->> 'id', 'kind', e ->> 'kind')));
        end loop;
        v_basis := v_basis + (v_prev ->> 'extras_total')::numeric;
      end if;
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
      -- Credits, never below zero.
      for e in select * from jsonb_array_elements(coalesce(v_pm -> 'credits', '[]'::jsonb)) loop
        v_cr := least((e ->> 'amount')::numeric, v_sub);
        exit when v_cr <= 0;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', e ->> 'description',
          'qty', 1, 'unit_price', -v_cr, 'kind', 'credit'));
        v_sub := v_sub - v_cr;
      end loop;
      if jsonb_array_length(v_lines) = 0 then return null; end if;
      v_basis := (v_pm ->> 'usage_total')::numeric;
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

-- Drafts: from the 25th, month-end drafts (budget, usage packages, pay as you go billed monthly) and
-- next month's advance drafts (budget in advance, upfront packages); any day, an upfront package's own
-- month if it has none yet (a package that starts on a 1st after the 25th).
create or replace function public.portal_admin_generate_drafts(p_secret text, p_actor text, p_today date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := coalesce(p_today, (now() at time zone 'Asia/Dubai')::date);
  v_month date := date_trunc('month', v_today)::date; r record; v uuid; v_ids uuid[] := '{}';
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select a.id, pl.mode, pl.bill_in_advance, pl.package_billing, a.payg_invoicing
    from public.accounts a left join public.account_plans pl on pl.account_id = a.id
  loop
    if r.mode = 'package' and r.package_billing = 'upfront' then
      v := private.month_end_draft(r.id, v_month, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    if extract(day from v_today) < 25 then continue; end if;
    if r.mode in ('budget', 'package') or (coalesce(r.mode, 'payg') = 'payg' and r.payg_invoicing = 'month_end') then
      v := private.month_end_draft(r.id, v_month, false, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    if (r.mode = 'budget' and r.bill_in_advance) or (r.mode = 'package' and r.package_billing = 'upfront') then
      v := private.month_end_draft(r.id, (v_month + interval '1 month')::date, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into private.portal_admin_log (actor, action, detail)
      values (p_actor, 'create', 'Invoice drafts for ' || private.month_label(v_month) || ': ' || array_length(v_ids, 1));
  end if;
  return jsonb_build_object('created', coalesce(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids),
    'note', case when extract(day from v_today) < 25 then 'month-end drafts are made from the 25th' end);
end $$;

-- ---------- switching from pay as you go ----------
-- What moves when a client switches to a package with this month's work: the month's bookings (counted
-- toward the package), paid booking invoices (credited), unpaid booking invoices and this month's
-- pay-as-you-go draft (voided; their work goes on the package's month-end invoice).
create or replace function private.switch_preview(p_account uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select date_trunc('month', p_month)::date as s, (date_trunc('month', p_month) + interval '1 month')::date as e),
  pr as (
    select p.id, p.ref, p.title, private.booking_value(p.id) as value
    from public.projects p, m
    where p.account_id = p_account and p.status not in ('cancelled', 'awaiting_payment')
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) >= m.s
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) < m.e
  ), vo as (
    select i.id, i.number, i.amount, i.stage, pr.ref from public.invoices i join pr on pr.id = i.project_id
    where i.category = 'booking' and i.status in ('draft', 'due', 'overdue')
      and coalesce(i.payment_state, '') <> 'submitted'
  ), pd as (
    select i.id, i.amount from public.invoices i, m
    where i.account_id = p_account and i.category = 'payg' and i.status = 'draft' and i.period_start >= m.s
  )
  select jsonb_build_object('month', (select s from m),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'title', title, 'value', value) order by ref) from pr), '[]'::jsonb),
    'usage_total', coalesce((select sum(value) from pr), 0),
    -- Paid deposits only: the open ones are in voids (moved onto the package).
    'credits', coalesce((select jsonb_agg(x) from jsonb_array_elements(
      private.month_credits(p_account, (select s from m), (select e from m)) -> 'items') x
      where (x ->> 'paid')::boolean), '[]'::jsonb),
    'voids', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'amount', amount, 'stage', stage, 'ref', ref) order by number) from vo), '[]'::jsonb),
    'payg_drafts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount', amount)) from pd), '[]'::jsonb))
$$;

create or replace function public.portal_admin_switch_preview(p_secret text, p_actor text, p_account uuid,
  p_start date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if exists (select 1 from public.account_plans where account_id = p_account and mode = 'package') then return null; end if;
  return private.switch_preview(p_account, least(coalesce(p_start, (now() at time zone 'Asia/Dubai')::date),
    (now() at time zone 'Asia/Dubai')::date));
end $$;

-- Save a client's own package. p: {template_id, name, amount, term, started, ends, inclusions,
-- billing ('usage' | 'upfront'), minimum (blank = usage only)}. From pay as you go: the switch above.
create or replace function public.portal_admin_save_client_package(p_secret text, p_actor text, p_account uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; t public.packages%rowtype; v uuid;
  v_amount numeric := nullif(p ->> 'amount', '')::numeric; v_term int := coalesce(nullif(p ->> 'term', '')::int, 1);
  v_start date := nullif(p ->> 'started', '')::date; v_ends date := nullif(p ->> 'ends', '')::date;
  v_inc jsonb := coalesce(p -> 'inclusions', '[]'::jsonb); v_clean jsonb := '[]'::jsonb; i jsonb; v_name text;
  v_billing text; v_min numeric := nullif(p ->> 'minimum', '')::numeric; v_from date; sw jsonb;
  v_today date := (now() at time zone 'Asia/Dubai')::date; v_moved int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  if a.id is null then raise exception 'no such client' using errcode = '22023'; end if;
  if v_amount is null or v_amount < 0 then raise exception 'enter the monthly amount' using errcode = '22023'; end if;
  if v_start is null then raise exception 'choose the start date' using errcode = '22023'; end if;
  if v_term not in (1, 6) then raise exception 'term is monthly or 6 months' using errcode = '22023'; end if;
  if v_min is not null and v_min < 0 then raise exception 'the minimum is 0 or more' using errcode = '22023'; end if;
  if coalesce(nullif(p ->> 'billing', ''), 'usage') not in ('usage', 'upfront') then
    raise exception 'package invoice is month end or start of month' using errcode = '22023';
  end if;
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
  v_billing := coalesce(nullif(p ->> 'billing', ''), (case when pl.mode = 'package' then pl.package_billing end), 'usage');
  -- From pay as you go, starting this month or earlier: this month's work moves onto the package.
  if pl.mode is distinct from 'package' and v_start <= v_today then
    sw := private.switch_preview(p_account, v_start);
    update public.invoices set status = 'void'
      where id in (select (x ->> 'id')::uuid from jsonb_array_elements(sw -> 'voids') x);
    update public.line_items set billed_invoice_id = null
      where billed_invoice_id in (select (x ->> 'id')::uuid from jsonb_array_elements(sw -> 'payg_drafts') x);
    update public.invoices set status = 'void'
      where id in (select (x ->> 'id')::uuid from jsonb_array_elements(sw -> 'payg_drafts') x);
    v_moved := jsonb_array_length(sw -> 'voids') + jsonb_array_length(sw -> 'payg_drafts');
  end if;
  -- Upfront billing starts on a 1st: the start itself when that's a 1st still ahead (or this month's 1st
  -- for a new client with nothing booked), else the 1st after the switch / change.
  if v_billing = 'upfront' then
    if pl.mode = 'package' and pl.package_billing = 'upfront' and pl.started_on = v_start then
      v_from := pl.upfront_from;
    elsif extract(day from v_start) = 1 and v_start >= date_trunc('month', v_today)::date
      and (v_start > v_today or (pl.mode is distinct from 'package'
        and jsonb_array_length(coalesce(sw -> 'projects', '[]'::jsonb)) = 0)) then
      v_from := v_start;
    else
      v_from := (date_trunc('month', greatest(v_start, v_today)) + interval '1 month')::date;
    end if;
  end if;
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
    bill_in_advance, package_billing, min_amount, upfront_from)
  values (p_account, 'package', v, v_start, (date_trunc('month', v_start) + interval '1 month')::date, v_term,
    case when v_term = 6 then v_ends end, false, v_billing, v_min, v_from)
  on conflict (account_id) do update set mode = 'package', package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, term_months = excluded.term_months,
    ends_on = excluded.ends_on, package_billing = excluded.package_billing, min_amount = excluded.min_amount,
    upfront_from = excluded.upfront_from, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Monthly package ' || v_name || ': ' || round(v_amount, 2) || ' ' || a.currency
      || (case when v_billing = 'upfront' then ', upfront from ' || to_char(v_from, 'FMDD Mon YYYY')
        else ', month end on usage' || coalesce(' (minimum ' || round(v_min, 2) || ')', '') end)
      || (case when v_moved > 0 then ', ' || v_moved || ' invoice(s) voided and moved onto the package' else '' end));
  return v;
end $$;

-- The client page's setup: as before plus the package invoice mode and minimum.
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
      'started_on', pl.started_on, 'ends_on', pl.ends_on, 'advance', coalesce(pl.bill_in_advance, false),
      'billing', coalesce(pl.package_billing, 'usage'), 'minimum', pl.min_amount, 'upfront_from', pl.upfront_from),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name,
        'price', private.pkg_price(x.id, a.currency), 'inclusions', x.inclusions) order by x.name)
      from public.packages x where x.account_id is null and private.pkg_price(x.id, a.currency) is not null), '[]'::jsonb));
end $$;

-- ---------- reads: the same summary everywhere ----------
create or replace function public.portal_admin_value_month(p_secret text, p_actor text, p_account uuid,
  p_month date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_month is null or date_trunc('month', p_month) = date_trunc('month', (now() at time zone 'Asia/Dubai')) then
    v := private.plan_summary(p_account);
  else
    -- Another month (tests): the month's own numbers in the same shape.
    select case when pm is null or not pm ? 'value' then null else (pm -> 'value') || (pm - 'value' - 'usage'
      - 'inclusions' - 'extras' - 'before') end into v
    from (select private.package_month(p_account, p_month) as pm) x;
  end if;
  if v is null then return null; end if;
  return v || jsonb_build_object('package_id', (select package_id from public.account_plans where account_id = p_account));
end $$;

-- Every package client's summary (admin Today and Invoices).
create or replace function public.portal_admin_plan_summaries(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('account_id', a.id, 'account', a.name, 'plan', s.v)
      order by a.name)
    from public.accounts a join public.account_plans pl on pl.account_id = a.id
      cross join lateral (select private.plan_summary(a.id) as v) s
    where pl.mode = 'package' and s.v is not null), '[]'::jsonb);
end $$;

create or replace function public.my_billing_payments(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.billing_settings%rowtype;
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin')
    and not exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing')) then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  s := private.settings();
  return jsonb_build_object('terms', private.booking_terms(p_account),
    'account_terms', (select payment_terms from public.accounts where id = p_account),
    'wio_link', s.wio_link,
    'pay_online', private.pays_online(p_account),
    'bank', case when s.bank_iban is not null then jsonb_build_object('account_name', s.bank_account_name,
      'bank', s.bank_name, 'iban', s.bank_iban, 'swift', s.bank_swift) end,
    'value', private.plan_summary(p_account),
    'upcoming', private.plan_upcoming(p_account),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('amount', r.amount, 'currency', r.currency,
        'method', r.method, 'status', r.status, 'created_at', r.created_at,
        'ref', (select ref from public.projects where id = r.project_id)) order by r.created_at desc)
      from public.refunds r where r.account_id = p_account), '[]'::jsonb));
end $$;

-- ---------- saved card + autopay retired (columns kept) ----------
create or replace function public.portal_admin_autopay_due(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return '[]'::jsonb;
end $$;

-- ---------- grants ----------
revoke all on function private.month_mode(text, date, date, date), private.month_credits(uuid, date, date),
  private.plan_summary(uuid), private.switch_preview(uuid, date) from public, anon, authenticated;
revoke all on function public.portal_admin_switch_preview(text, text, uuid, date),
  public.portal_admin_plan_summaries(text, text) from public;
grant execute on function public.portal_admin_switch_preview(text, text, uuid, date),
  public.portal_admin_plan_summaries(text, text) to anon, authenticated;
