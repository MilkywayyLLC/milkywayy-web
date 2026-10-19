-- Client Billing page (owner, 17 Oct 2026, follow-up): this month's extras listed as counts only
-- (description × quantity), never amounts: the client view keeps "money only on invoices".
-- Replaces my_billing() only.

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
      -- This month's extras as counts: money stays on invoices (owner, 4 Oct 2026).
      'extra_items', coalesce((select jsonb_agg(jsonb_build_object('description', e ->> 'description',
          'qty', (e ->> 'qty')::numeric, 'ref', e ->> 'ref'))
        from jsonb_array_elements(v_plan -> 'extras') e), '[]'::jsonb)) end),
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
