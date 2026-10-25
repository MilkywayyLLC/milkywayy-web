-- Client portal refinement (owner, 25 Oct 2026). Additive (new rate card items, functions replaced).
--
-- * Content shoot by length: 2 h / 4 h / 8 h, plus short-form and long-form edits (or raw files only).
--   Five rate card items, overridable per client like any other. On a value package a content shoot
--   uses 0.25 / 0.5 / 1 shoot day (0.5 / 1 / 2 half-days). Older bookings (by count, by time) unchanged.
-- * Month-end "so far": a project booked before a mid-month package start and shot after it was
--   counted twice (before the package + the ledger). Pro-rated price and allowance in whole dirhams.
-- * A package starting later ("Growth starts 1 Nov"): my_billing_payments / my_payment_terms say so.

insert into public.rate_card (key, label, unit, amount_aed, amount_usd, grp, includes, sort) values
  ('content_2h', 'Content shoot · 2 hours', 'shoot', 750, 204, 'production', 'Shoot time, raw files included', 130),
  ('content_4h', 'Content shoot · 4 hours', 'shoot', 1200, 327, 'production', 'Shoot time, raw files included', 131),
  ('content_8h', 'Content shoot · 8 hours', 'shoot', 2000, 545, 'production', 'Shoot time, raw files included', 132),
  ('content_short_edit', 'Short-form edit', 'video', 200, 54, 'production', 'Edited from your content shoot', 133),
  ('content_long_edit', 'Long-form edit', 'video', 600, 163, 'production', 'Edited from your content shoot', 134)
on conflict (key) do nothing;

-- The package that starts on a later date, if any: {name, starts_on, price, currency}.
create or replace function private.plan_upcoming(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', k.name, 'starts_on', pl.started_on,
    'price', round(coalesce(private.pkg_price(k.id, a.currency), k.monthly_price), 0),
    'currency', case when private.pkg_price(k.id, a.currency) is null then k.currency else a.currency end)
  from public.account_plans pl join public.packages k on k.id = pl.package_id
    join public.accounts a on a.id = pl.account_id
  where pl.account_id = p_account and pl.mode = 'package'
    and pl.started_on > (now() at time zone 'Asia/Dubai')::date
$$;
revoke all on function private.plan_upcoming(uuid) from public, anon, authenticated;

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
      if jsonb_typeof(v) is distinct from 'object' or v ->> 'by' not in ('count', 'time', 'hours') then
        raise exception 'choose how many videos, or half day or full day' using errcode = '22023';
      end if;
      if v ->> 'by' = 'hours' then
        if v ->> 'hours' is null or v ->> 'hours' not in ('2', '4', '8') then
          raise exception 'choose a shoot length' using errcode = '22023';
        end if;
        if coalesce((v ->> 'short')::int, 0) not between 0 and 100 or coalesce((v ->> 'long')::int, 0) not between 0 and 3 then
          raise exception 'edits out of range' using errcode = '22023';
        end if;
      elsif v ->> 'by' = 'count' then
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

create or replace function private.booking_half_days(p public.projects) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p.type <> 'shoot' then 0
    when not exists (select 1 from jsonb_array_elements(coalesce(p.meta -> 'booking' -> 'services', '[]'::jsonb)) s
      where s ->> 'service' = 'videos') then 0
    -- A content shoot by length (25 Oct 2026): 2 h a quarter day, 4 h a half day, 8 h a full day.
    when p.meta -> 'booking' -> 'services' @> '[{"videos": {"by": "hours", "hours": 2}}]' then 0.5
    when p.meta -> 'booking' -> 'services' @> '[{"videos": {"by": "hours", "hours": 8}}]' then 2
    when p.meta -> 'booking' -> 'services' @> '[{"videos": {"by": "hours"}}]' then 1
    when lower(coalesce(p.meta -> 'booking' ->> 'slot', p.slot)) in ('full_day', 'full day')
      or p.meta -> 'booking' -> 'services' @> '[{"videos": {"day": "full"}}]' then 2
    else 1 end
$$;

create or replace function private.package_month(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_month date := date_trunc('month', p_month)::date; v_next date; v_start date; v_frac numeric;
  v_full numeric; v_price numeric; v_cur text; v_inc jsonb; u jsonb; v_first date; v_ends date;
  v_no int; v_age interval; v_before jsonb; v_before_total numeric; v_allow numeric; v_cap numeric; l jsonb;
  v_value boolean; v_fees jsonb; v_fees_total numeric;
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
    l := private.value_ledger(p_account, v_start, v_next, v_allow, v_cap);
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
      'value', jsonb_build_object('allowance', v_allow, 'half_day_cap', v_cap, 'used', (l ->> 'used')::numeric,
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
    -- A value package's ledger already counts its projects dated from the start (booked before,
    -- shot after): never twice (25 Oct 2026).
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

create or replace function public.my_billing_payments(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.billing_settings%rowtype; v_pm jsonb;
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin')
    and not exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing')) then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  s := private.settings();
  v_pm := private.plan_view(p_account);
  return jsonb_build_object('terms', private.booking_terms(p_account),
    'account_terms', (select payment_terms from public.accounts where id = p_account),
    'wio_link', s.wio_link,
    'pay_online', private.pays_online(p_account),
    'bank', case when s.bank_iban is not null then jsonb_build_object('account_name', s.bank_account_name,
      'bank', s.bank_name, 'iban', s.bank_iban, 'swift', s.bank_swift) end,
    'value', case when v_pm ? 'value' then (v_pm -> 'value') || jsonb_build_object(
      'name', v_pm ->> 'name', 'price', (v_pm ->> 'price')::numeric, 'currency', v_pm ->> 'currency',
      'month', v_pm ->> 'month', 'renews_on', v_pm ->> 'renews_on', 'prorated', (v_pm ->> 'prorated')::boolean,
      'extras_total', (v_pm ->> 'extras_total')::numeric, 'estimate', (v_pm ->> 'estimate')::numeric) end,
    'upcoming', private.plan_upcoming(p_account),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('amount', r.amount, 'currency', r.currency,
        'method', r.method, 'status', r.status, 'created_at', r.created_at,
        'ref', (select ref from public.projects where id = r.project_id)) order by r.created_at desc)
      from public.refunds r where r.account_id = p_account), '[]'::jsonb));
end $$;

create or replace function public.my_payment_terms(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.billing_settings%rowtype; v_money boolean; v_pm jsonb;
begin
  if private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  s := private.settings();
  v_money := coalesce(private.account_role(p_account), '') in ('owner', 'admin')
    or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing'));
  if v_money then v_pm := private.plan_view(p_account); end if;
  return jsonb_build_object('terms', private.booking_terms(p_account),
    'vat_rate', case when s.vat_registered then 5 else 0 end,
    'cancel_free_hours', s.cancel_free_hours, 'late_fee_pct', s.late_fee_pct, 'late_fee_min', s.late_fee_min,
    'work_keep_pct', s.work_keep_pct,
    'package', case when v_pm ? 'value' then jsonb_build_object('name', v_pm ->> 'name',
      'allowance', (v_pm -> 'value' ->> 'allowance')::numeric, 'half_day_cap', (v_pm -> 'value' ->> 'half_day_cap')::numeric,
      'allowance_left', greatest((v_pm -> 'value' ->> 'allowance')::numeric - (v_pm -> 'value' ->> 'used')::numeric, 0),
      'half_days_left', greatest((v_pm -> 'value' ->> 'half_day_cap')::numeric - (v_pm -> 'value' ->> 'half_days_used')::numeric, 0)) end,
    'upcoming', case when v_money then private.plan_upcoming(p_account) end);
end $$;
