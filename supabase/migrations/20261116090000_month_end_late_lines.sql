-- Month-end drafts never leave a line behind (owner, 2 Nov 2026). Inhouse's MW-1772 was logged on 2 Nov for
-- an October shoot and the button made nothing, because month-end drafts only ran from the 25th.
--  1. "Make month-end drafts now" takes a period, and an explicit pick ignores the 25th rule.
--  2. The daily run also picks up unbilled lines from closed months (pay as you go, budget), any day.
--  3. Pay as you go: a late line joins that month's open draft. If that month is already issued or void, it
--     goes on the next open month (invoices_period_once allows one invoice per client per month).
--  4. Budget: late lines on an invoiced month bill only what newly goes over that month's budget.
--  5. A draft for a closed month is dated the day it's made, never backdated.
--  6. Test accounts get no generated drafts.
-- Value packages bill from bookings, not line items, so their month-end logic is unchanged.

create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb; v_sub numeric; v_cr numeric;
  v_self uuid; v_late jsonb; v_fee numeric; v_rate numeric; v_work numeric; v_mode text;
  v_m date; v_mb numeric; v_all numeric; v_new numeric; v_over numeric;
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
      -- Logged late, for a closed month that's already invoiced: bill only what newly goes over that
      -- month's budget. Anything still inside it is just marked as billed.
      for v_m in select distinct li.delivered_month from public.line_items li
        where li.account_id = p_account and li.billed_invoice_id is null and li.delivered_month < v_month
          and exists (select 1 from public.invoices i where i.account_id = p_account and i.category = 'budget'
            and i.period_start = li.delivered_month and not i.advance and i.status not in ('draft', 'void'))
        order by 1 loop
        v_mb := private.budget_for(p_account, v_m);
        continue when v_mb is null;
        select round(sum(qty * unit_price), 2), coalesce(round(sum(qty * unit_price) filter (where billed_invoice_id is null), 2), 0)
          into v_all, v_new from public.line_items where account_id = p_account and delivered_month = v_m;
        v_over := greatest(v_all - v_mb, 0) - greatest(v_all - v_new - v_mb, 0);
        if v_over > 0 then
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
            'Additional content beyond the monthly package · ' || private.month_label(v_m) || ' (logged late)',
            'qty', 1, 'unit_price', v_over));
        end if;
        v_lines := v_lines || coalesce((select jsonb_agg(jsonb_build_object('mark', id)) from public.line_items
          where account_id = p_account and delivered_month = v_m and billed_invoice_id is null), '[]'::jsonb);
      end loop;
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


create or replace function private.month_end_draft(p_account uuid, p_month date, p_advance boolean, p_actor text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v uuid; v_lines jsonb; v_marks uuid[]; v_month date := date_trunc('month', p_month)::date;
  v_publish date; ex public.invoices%rowtype; t jsonb;
begin
  r := private.month_end_lines(p_account, v_month, p_advance);
  if r is null then return null; end if;
  if r ->> 'category' = 'payg' and not p_advance then
    -- One invoice per month: walk past months already issued or void, to an open draft or a free month.
    loop
      select * into ex from public.invoices where account_id = p_account and category = 'payg'
        and period_start = v_month and not advance for update;
      exit when ex.id is null or ex.status = 'draft';
      v_month := (v_month + interval '1 month')::date;
    end loop;
    r := private.month_end_lines(p_account, v_month, false);
    if r is null then return null; end if;
    if ex.id is not null then
      -- Added to the open draft, keeping any edits already made to it.
      v_lines := private.clean_lines(coalesce(ex.lines, '[]'::jsonb) || (r -> 'lines'));
      t := private.invoice_totals(v_lines);
      update public.invoices set lines = v_lines, subtotal = (t ->> 'subtotal')::numeric,
        vat_rate = (t ->> 'vat_rate')::numeric, vat = (t ->> 'vat')::numeric, amount = (t ->> 'total')::numeric,
        basis_total = coalesce(basis_total, 0) + (r ->> 'basis')::numeric
        where id = ex.id;
      update public.line_items set billed_invoice_id = ex.id
        where id in (select (l ->> 'line_item_id')::uuid from jsonb_array_elements(r -> 'lines') l where l ? 'line_item_id')
          and account_id = p_account and billed_invoice_id is null;
      return ex.id;
    end if;
  end if;
  select coalesce(jsonb_agg(l) filter (where not l ? 'mark'), '[]'::jsonb),
    array_agg((l ->> 'mark')::uuid) filter (where l ? 'mark')
    into v_lines, v_marks from jsonb_array_elements(r -> 'lines') l;
  if jsonb_array_length(v_lines) = 0 then return null; end if;
  if exists (select 1 from public.invoices where account_id = p_account and category = r ->> 'category'
      and period_start = v_month and advance = p_advance) then
    return null;
  end if;
  -- Month-end invoices publish on the month's last day; a package billed in advance on its 1st. A closed
  -- month is dated today, not backdated.
  v_publish := (case when p_advance then v_month
    else greatest((v_month + interval '1 month' - interval '1 day')::date, (now() at time zone 'Asia/Dubai')::date) end);
  v := private.new_draft(p_account, r ->> 'category', v_month, (v_month + interval '1 month' - interval '1 day')::date,
    v_lines, v_publish, p_actor, null, p_advance, (r ->> 'basis')::numeric);
  if v_marks is not null then
    update public.line_items set billed_invoice_id = v where id = any (v_marks) and billed_invoice_id is null;
  end if;
  return v;
end $$;

-- The third argument stays so the deployed site keeps working until the new code is live.
drop function public.portal_admin_generate_drafts(text, text, date);
create function public.portal_admin_generate_drafts(p_secret text, p_actor text, p_today date default null,
  p_month date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := coalesce(p_today, (now() at time zone 'Asia/Dubai')::date);
  v_month date := date_trunc('month', v_today)::date; v_pick date := date_trunc('month', p_month)::date;
  v_late boolean; v_bills boolean; v_m date; r record; v uuid; v_ids uuid[] := '{}';
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if v_pick > v_month then raise exception 'pick this month or an earlier one' using errcode = '22023'; end if;
  for r in select a.id, pl.mode, pl.bill_in_advance, pl.package_billing, a.payg_invoicing
    from public.accounts a left join public.account_plans pl on pl.account_id = a.id
    where not a.is_test
  loop
    if r.mode = 'package' and r.package_billing = 'upfront' then
      v := private.month_end_draft(r.id, v_month, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    v_bills := r.mode in ('budget', 'package') or (coalesce(r.mode, 'payg') = 'payg' and r.payg_invoicing = 'month_end');
    -- An explicit pick runs that month, any day. The daily run does this month from the 25th.
    if v_bills and (v_pick is not null or extract(day from v_today) >= 25) then
      v := private.month_end_draft(r.id, coalesce(v_pick, v_month), false, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    -- The daily run, any day: unbilled lines from closed months. A real amount only, so waived lines don't draft.
    if v_pick is null and r.mode is distinct from 'package' and v_bills then
      if r.mode = 'budget' then
        for v_m in select li.delivered_month from public.line_items li
          where li.account_id = r.id and li.billed_invoice_id is null and li.delivered_month < v_month
            and not exists (select 1 from public.invoices i where i.account_id = r.id and i.category = 'budget'
              and i.period_start = li.delivered_month and not i.advance)
          group by 1 having sum(li.qty * li.unit_price) > 0 order by 1 loop
          v := private.month_end_draft(r.id, v_m, false, p_actor);
          if v is not null then v_ids := v_ids || v; end if;
        end loop;
      else
        select coalesce(sum(li.qty * li.unit_price), 0) > 0 into v_late from public.line_items li
          where li.account_id = r.id and li.billed_invoice_id is null and li.delivered_month < v_month;
        if v_late then
          v := private.month_end_draft(r.id, (v_month - interval '1 month')::date, false, p_actor);
          if v is not null then v_ids := v_ids || v; end if;
        end if;
      end if;
    end if;
    if extract(day from v_today) >= 25 and (v_pick is null or v_pick = v_month)
      and ((r.mode = 'budget' and r.bill_in_advance) or (r.mode = 'package' and r.package_billing = 'upfront')) then
      v := private.month_end_draft(r.id, (v_month + interval '1 month')::date, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into private.portal_admin_log (actor, action, detail)
      values (p_actor, 'create', 'Invoice drafts for ' || private.month_label(coalesce(v_pick, v_month)) || ': ' || array_length(v_ids, 1));
  end if;
  return jsonb_build_object('created', coalesce(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids),
    'note', case when v_pick is null and extract(day from v_today) < 25 then 'month-end drafts are made from the 25th' end);
end $$;
revoke execute on function public.portal_admin_generate_drafts(text, text, date, date) from public;

create or replace function public.portal_admin_invoice_queue(p_secret text, p_actor text, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.rank, x.publish_on nulls first, x.created_at desc) from (
    select i.id, i.account_id, a.name as account_name, a.is_test, i.number, i.category, i.period_start, i.period_end,
      i.amount, i.currency, i.status, i.publish_on, i.issued_on, i.due_on, i.advance, i.project_id,
      i.created_at, i.basis_total, i.payment_state, i.stage,
      (select coalesce(array_agg(r.ref order by r.ref), '{}') from (
        select distinct pr.ref from public.projects pr
        where pr.id = i.project_id or pr.id in (select li.project_id from public.line_items li where li.billed_invoice_id = i.id)
      ) r) as refs,
      case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end as shown_status,
      case when i.status = 'draft' and i.category = 'payg' and not i.advance then
        -- Pay as you go only returns what's unbilled, so anything at all means new work.
        private.month_end_lines(i.account_id, i.period_start, false) is not null
      when i.status = 'draft' and i.category in ('budget', 'fixed') and not i.advance then
        ((private.month_end_lines(i.account_id, i.period_start, false) ->> 'basis')::numeric is distinct from i.basis_total)
      else false end as changed,
      case i.status when 'draft' then 0 when 'approved' then 1 else 2 end as rank
    from public.invoices i join public.accounts a on a.id = i.account_id
    where (p_status is null and (i.status in ('draft', 'approved') or i.created_at > now() - interval '120 days'))
      or (p_status = 'open' and i.status in ('draft', 'approved'))
      or (p_status is not null and p_status <> 'open' and
        (case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end) = p_status)
    limit 500) x), '[]'::jsonb);
end $$;
