-- Upfront packages: extras are never lost (owner, 28 Oct 2026). Next month's draft is made from the 25th
-- and may be approved before the month ends; extras booked after that used to be missed. Now every extra
-- line carries its booking (ref) and month, and each invoice picks up whatever part of an earlier upfront
-- month's extras isn't on another live invoice yet. Additive: functions replaced, nothing dropped.

-- Invoice lines keep the booking ref and month of a package extra.
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
      'line_item_id', l ->> 'line_item_id', 'kind', l ->> 'kind',
      'ref', left(nullif(l ->> 'ref', ''), 40),
      'month', (case when l ->> 'month' ~ '^\d{4}-\d{2}-01$' then l ->> 'month' end))));
  end loop;
  return out;
end $$;

-- What earlier upfront months' extras still need billing on the invoice for p_month: per booking, its
-- extra minus what other live (not void) package invoices already carry for it; late-cancellation fees
-- not on any invoice yet. p_self is the draft being made or refreshed (its own lines don't count).
-- {lines, total}
create or replace function private.upfront_unbilled(p_account uuid, p_month date, p_self uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; v_m date; v_to date := date_trunc('month', p_month)::date; pm jsonb; r jsonb;
  v_billed numeric; v_due numeric; v_lines jsonb := '[]'::jsonb; v_total numeric := 0; f record;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then
    return jsonb_build_object('lines', '[]'::jsonb, 'total', 0);
  end if;
  v_m := greatest(date_trunc('month', coalesce(pl.started_on, v_to))::date, (v_to - interval '12 months')::date);
  while v_m < v_to loop
    pm := private.package_month(p_account, v_m);
    if pm ? 'value' and pm ->> 'month_mode' = 'upfront' then
      for r in select * from jsonb_array_elements(coalesce(pm -> 'value' -> 'bookings', '[]'::jsonb))
        where (value ->> 'extra')::numeric > 0 loop
        select coalesce(sum((l ->> 'amount')::numeric), 0) into v_billed
        from public.invoices i, jsonb_array_elements(i.lines) l
        where i.account_id = p_account and i.category = 'fixed' and i.status <> 'void'
          and i.id is distinct from p_self
          and l ->> 'kind' = 'package_extra' and l ->> 'ref' = r ->> 'ref' and l ->> 'month' = v_m::text;
        v_due := (r ->> 'extra')::numeric - v_billed;
        if v_due > 0 then
          v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
            'Extra · ' || coalesce(nullif(r ->> 'title', ''), 'Booking')
              || (case when (r ->> 'included')::numeric > 0 then ' (beyond the package)' else '' end)
              || coalesce(' · ' || (r ->> 'ref'), '') || ' · ' || private.month_label(v_m),
            'qty', 1, 'unit_price', v_due, 'kind', 'package_extra', 'ref', r ->> 'ref', 'month', v_m::text)));
          v_total := v_total + v_due;
        end if;
      end loop;
      -- Late-cancellation fees of that month not on an invoice yet (or only on this draft).
      for f in select li.id, li.description, li.qty, li.unit_price, li.kind, p.ref
        from public.line_items li left join public.projects p on p.id = li.project_id
        where li.account_id = p_account and li.kind = 'cancel_fee'
          and (li.billed_invoice_id is null or li.billed_invoice_id = p_self)
          and private.item_day(li.service_date, null, li.created_at) >= v_m
          and private.item_day(li.service_date, null, li.created_at) < (v_m + interval '1 month')::date
        order by li.created_at loop
        v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description',
          'Extra · ' || f.description || coalesce(' · ' || f.ref, '') || ' · ' || private.month_label(v_m),
          'qty', f.qty, 'unit_price', f.unit_price, 'line_item_id', f.id, 'kind', f.kind)));
        v_total := v_total + round(f.qty * f.unit_price, 2);
      end loop;
    end if;
    v_m := (v_m + interval '1 month')::date;
  end loop;
  return jsonb_build_object('lines', v_lines, 'total', v_total);
end $$;
revoke all on function private.upfront_unbilled(uuid, date, uuid) from public, anon, authenticated;

-- Month-end / advance lines: as in 20261110090000, with an upfront month's invoice (and a usage month right
-- after upfront ones) taking every earlier upfront extra not billed yet.
create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb; v_sub numeric; v_cr numeric;
  v_self uuid; v_late jsonb;
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
    else
      -- The draft being refreshed, if any: its own lines don't count as billed.
      select id into v_self from public.invoices where account_id = p_account and category = 'fixed'
        and period_start = v_month and advance = p_advance and status = 'draft' limit 1;
      v_late := private.upfront_unbilled(p_account, v_month, v_self);
      if p_advance then
        if v_pm ->> 'month_mode' <> 'upfront' then return null; end if;
        v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
          || private.month_label(v_month), 'qty', 1, 'unit_price', (v_pm ->> 'price')::numeric))
          || (v_late -> 'lines');
        v_basis := (v_pm ->> 'price')::numeric + (v_late ->> 'total')::numeric;
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
