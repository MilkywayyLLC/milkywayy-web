-- Client portal billing add-on (owner, 4 Oct 2026), on top of Phase 12. Replaces the volume-tier
-- idea and Phase 12's threshold rules:
-- * Package clients: usage per inclusion, remaining, overage at their overage rates, other work at
--   their rates, an estimated month total, renewal; 6-month contracts show "Month 3 of 6".
-- * Pay-as-you-go clients: this month so far and last month's final total; a package suggestion
--   from internal templates (or an offer pinned to the client), computed on the last 3 complete
--   months (activity in at least 2): cost = price + overage beyond inclusions + the client's own
--   rates for anything the package doesn't cover. Shown only when the saving clears a minimum.
-- * Month-end statements frozen on the 1st (optional 5% VAT line); invoices prefill from them.
-- * Paying: Stripe Checkout for non-AED accounts (or where the admin turns it on); bank transfer
--   with an uploaded proof for AED accounts, confirmed or rejected by the admin.
-- Owner/Admins only; Members see none of it. Additive, except Phase 12's suggestion_rules (never
-- in production) which the template engine replaces.

-- ---------- settings ----------
alter table public.billing_settings
  alter column suggestions_enabled set default true,
  add column min_saving_aed numeric(12, 2) not null default 500 check (min_saving_aed >= 0),
  add column min_saving_usd numeric(12, 2) not null default 135 check (min_saving_usd >= 0),
  add column vat_registered boolean not null default false,
  add column bank_account_name text check (length(bank_account_name) <= 120),
  add column bank_name text check (length(bank_name) <= 120),
  add column bank_iban text check (bank_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'),
  add column bank_swift text check (bank_swift ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$');
update public.billing_settings set suggestions_enabled = true where id;

-- ---------- packages: templates priced in both currencies; 6-month discount ----------
-- Templates (no account) are internal only: AED in monthly_price (currency 'AED'), USD in
-- price_usd; their overage items carry "amount" (AED) and "amount_usd". A client's own package
-- has one currency, like before.
alter table public.packages
  add column price_usd numeric(12, 2) check (price_usd >= 0),
  add column six_month_discount_pct numeric(5, 2) not null default 10
    check (six_month_discount_pct between 0 and 50),
  add column suggest boolean not null default true;

-- ---------- plans: 1-month or 6-month terms ----------
alter table public.account_plans
  add column term_months int not null default 1 check (term_months in (1, 6)),
  add column ends_on date;

-- ---------- per client: a pinned offer; how they pay ----------
alter table public.accounts
  add column pinned_package_id uuid references public.packages (id) on delete set null,
  -- null = automatic: card (Stripe) for non-AED accounts, bank transfer for AED ones.
  add column pay_online boolean;
create index accounts_pinned_package_idx on public.accounts (pinned_package_id);

-- ---------- invoices: statement month, how it was paid, a submitted payment ----------
alter table public.invoices
  add column statement_month date check (extract(day from statement_month) = 1),
  add column payment_state text check (payment_state in ('submitted', 'rejected')),
  add column reject_reason text check (length(reject_reason) <= 300),
  add column paid_via text check (paid_via in ('stripe', 'bank', 'manual')),
  add column stripe_session_id text check (length(stripe_session_id) <= 200);

-- ---------- month-end statements ----------
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  currency text not null check (currency in ('AED', 'USD')),
  mode text not null check (mode in ('payg', 'package')),
  package jsonb,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  overage jsonb not null default '[]' check (jsonb_typeof(overage) = 'array'),
  subtotal numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null default 0,
  vat numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  frozen_at timestamptz not null default now(),
  frozen_by text,
  unique (account_id, month)
);

-- ---------- bank-transfer proofs ----------
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null check (key not like '%..%' and length(key) <= 400),
  filename text not null check (length(btrim(filename)) between 1 and 160),
  bytes bigint check (bytes between 1 and 10485760),
  content_type text check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  note text check (length(note) <= 300),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  reason text check (length(reason) <= 300),
  decided_at timestamptz,
  decided_by text,
  check (key like 'payments/' || account_id || '/' || invoice_id || '/%')
);
create index payment_proofs_invoice_idx on public.payment_proofs (invoice_id, submitted_at desc);
create index payment_proofs_account_idx on public.payment_proofs (account_id);
create index payment_proofs_submitted_by_idx on public.payment_proofs (submitted_by);

revoke all on public.statements, public.payment_proofs from anon, authenticated;
grant select on public.statements, public.payment_proofs to authenticated;
alter table public.statements enable row level security;
alter table public.payment_proofs enable row level security;
create policy "managers read statements" on public.statements
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));
create policy "managers read payment proofs" on public.payment_proofs
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));

-- ---------- Phase 12 rules → templates ----------
drop function if exists public.portal_admin_save_rule(text, text, uuid, uuid, int, int, numeric, boolean);
drop function if exists public.portal_admin_delete_rule(text, text, uuid);
drop table if exists public.suggestion_rules;

-- ---------- helpers ----------
create or replace function private.pkg_price(p_pkg uuid, p_cur text) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when k.currency = p_cur then k.monthly_price
    when k.account_id is null and p_cur = 'USD' then k.price_usd end
  from public.packages k where k.id = p_pkg
$$;

-- Overage rate for one kind in a package: its overage item, else the client's own rate.
create or replace function private.pkg_overage_rate(p_pkg uuid, p_account uuid, p_key text, p_cur text)
returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when k.currency = p_cur then nullif(o ->> 'amount', '')::numeric
        when k.account_id is null and p_cur = 'USD' then nullif(o ->> 'amount_usd', '')::numeric end
      from public.packages k, jsonb_array_elements(k.overage) o
      where k.id = p_pkg and o ->> 'key' = p_key limit 1),
    private.rate_for(p_account, p_key))
$$;

create or replace function private.pays_online(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(a.pay_online, a.currency <> 'AED') from public.accounts a where a.id = p_account
$$;

-- A package's usage and money over [p_from, p_to) by delivery date: per inclusion used, left,
-- over and its overage; other work at its line-item prices. Shared by the plan view and statements.
create or replace function private.package_usage(p_account uuid, p_pkg uuid, p_cur text, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select li.*, p.ref from public.line_items li join public.projects p on p.id = li.project_id
    where li.account_id = p_account and p.delivered_at is not null
      and (p.delivered_at at time zone 'Asia/Dubai')::date >= p_from
      and (p.delivered_at at time zone 'Asia/Dubai')::date < p_to
  ), k as (select * from public.packages where id = p_pkg),
  usage as (
    select t.ord, t.i ->> 'key' as key, t.i ->> 'label' as label, (t.i ->> 'qty')::numeric as qty,
      coalesce((select sum(it.qty) from items it where it.kind = t.i ->> 'key'), 0) as used,
      private.pkg_overage_rate(p_pkg, p_account, t.i ->> 'key', p_cur) as rate
    from k, jsonb_array_elements(k.inclusions) with ordinality t(i, ord)
  ), extras as (
    select it.* from items it, k
    where it.kind is null or it.kind not in (select x ->> 'key' from jsonb_array_elements(k.inclusions) x)
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

-- The package client's view: plan, price (6-month price when on a 6-month term), usage this
-- period, overage, other work, an estimated month total, renewal, "Month 3 of 6".
create or replace function private.plan_view(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_start date; v_end date; v_price numeric; v_cur text; u jsonb; v_month int; v_age interval;
begin
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'package' then return null; end if;
  select * into k from public.packages where id = pl.package_id;
  if k.id is null then return null; end if;
  select * into a from public.accounts where id = p_account;
  select starts, ends into v_start, v_end from private.plan_period(pl.renews_on);
  v_price := private.pkg_price(k.id, a.currency);
  v_cur := case when v_price is null then k.currency else a.currency end;
  v_price := round(coalesce(v_price, k.monthly_price)
    * case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end, 2);
  u := private.package_usage(p_account, k.id, v_cur, v_start, v_end);
  v_age := age(v_start, coalesce(pl.started_on, v_start));
  v_month := greatest(1, (extract(year from v_age) * 12 + extract(month from v_age))::int + 1);
  return jsonb_build_object('name', k.name, 'price', v_price, 'currency', v_cur,
    'inclusions', k.inclusions, 'term_months', pl.term_months,
    'discount_pct', case when pl.term_months = 6 then k.six_month_discount_pct end,
    'month_no', v_month, 'started_on', pl.started_on,
    'ends_on', coalesce(pl.ends_on, case when pl.term_months = 6 and pl.started_on is not null
      then (pl.started_on + make_interval(months => pl.term_months) - interval '1 day')::date end),
    'renews_on', v_end, 'period_start', v_start)
    || u || jsonb_build_object('estimate',
      v_price + (u ->> 'overage_total')::numeric + (u ->> 'extras_total')::numeric);
end $$;

-- Pay as you go: this month so far, plus last month's total (final once its statement is frozen).
create or replace function private.payg_view(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.payg_month(p_account) || jsonb_build_object('last_month', (
    select case
      when s.id is not null then jsonb_build_object('month', s.month, 'total', s.total, 'final', true)
      when l.total > 0 then jsonb_build_object('month', l.month, 'total', l.total, 'final', false)
    end
    from (select (private.dubai_month(now()) - interval '1 month')::date as month) m
    left join public.statements s on s.account_id = p_account and s.month = m.month
    cross join lateral (select m.month, coalesce(sum(li.qty * li.unit_price), 0) as total
      from public.line_items li where li.account_id = p_account and li.delivered_month = m.month) l))
$$;

-- The best package for a pay-as-you-go client, by the last 3 complete months (never the current
-- month; activity in at least 2 of the 3), ignoring the switches and the minimum: the admin sees
-- it on the client's page. The pinned offer, if any, is the only candidate; else the templates.
create or replace function private.best_offer(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_m0 date := private.dubai_month(now()); v_from date;
  v_active int; v_avg numeric; k record; v_price numeric; v_over numeric; v_unc numeric;
  v_cost numeric; v_saving numeric; v_price6 numeric; v_best jsonb;
begin
  select * into a from public.accounts where id = p_account;
  if a.id is null then return null; end if;
  if exists (select 1 from public.account_plans where account_id = p_account and mode = 'package') then return null; end if;
  v_from := (v_m0 - interval '3 months')::date;
  select count(*) filter (where total > 0), coalesce(sum(total), 0) / 3 into v_active, v_avg
  from (select (select coalesce(sum(li.qty * li.unit_price), 0) from public.line_items li
          where li.account_id = p_account and li.delivered_month = m::date) as total
        from generate_series(v_from, (v_m0 - interval '1 month')::date, interval '1 month') m) x;
  if v_active < 2 then return null; end if;
  for k in select p.* from public.packages p
      where (a.pinned_package_id is not null and p.id = a.pinned_package_id)
         or (a.pinned_package_id is null and p.account_id is null and p.suggest)
  loop
    v_price := private.pkg_price(k.id, a.currency);
    continue when v_price is null;
    -- Monthly averages per kind: beyond the inclusion → overage rate; not included → as paid.
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
    if v_best is null or v_saving > (v_best ->> 'saving')::numeric then
      v_price6 := round(v_price * (1 - k.six_month_discount_pct / 100), 2);
      v_best := jsonb_build_object('package_id', k.id, 'package', k.name, 'inclusions', k.inclusions,
        'currency', a.currency, 'price', v_price, 'average', round(v_avg, 2),
        'overage', round(v_over, 2), 'uncovered', round(v_unc, 2), 'cost', round(v_cost, 2),
        'saving', round(v_saving, 2), 'discount_pct', k.six_month_discount_pct, 'price_6', v_price6,
        'saving_6', round(v_avg - (v_cost - v_price + v_price6), 2),
        'pinned', a.pinned_package_id is not null, 'active_months', v_active);
    end if;
  end loop;
  return v_best;
end $$;

-- What the client sees: the best offer, only when switched on, not hidden for them, and the
-- saving is at least the minimum for their currency.
create or replace function private.suggestion_for(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.billing_settings%rowtype; a public.accounts%rowtype; v_offer jsonb; v_min numeric;
begin
  select * into s from public.billing_settings where id;
  if not coalesce(s.suggestions_enabled, false) then return null; end if;
  select * into a from public.accounts where id = p_account;
  if a.id is null or a.hide_suggestions then return null; end if;
  v_offer := private.best_offer(p_account);
  v_min := (case when a.currency = 'USD' then s.min_saving_usd else s.min_saving_aed end);
  if v_offer is null or (v_offer ->> 'saving')::numeric < v_min then return null; end if;
  return v_offer;
end $$;

-- A month's statement as it stands (not saved): the plan at that time, line items delivered in
-- the month, package price + overage + other work, or the pay-as-you-go total; VAT if registered.
create or replace function private.build_statement(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_vat_on boolean; v_lines jsonb; v_sub numeric; v_pkg jsonb; u jsonb; v_price numeric; v_vat numeric;
  v_next date := (p_month + interval '1 month')::date;
begin
  select * into a from public.accounts where id = p_account;
  select * into pl from public.account_plans where account_id = p_account;
  select vat_registered into v_vat_on from public.billing_settings where id;
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref, 'amount', round(li.qty * li.unit_price, 2))
      order by p.delivered_at, li.created_at), '[]'::jsonb)
    into v_lines
  from public.line_items li join public.projects p on p.id = li.project_id
  where li.account_id = p_account and li.delivered_month = p_month;
  if pl.mode = 'package' then select * into k from public.packages where id = pl.package_id; end if;
  if k.id is not null then
    v_price := round(coalesce(private.pkg_price(k.id, a.currency), k.monthly_price)
      * case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end, 2);
    u := private.package_usage(p_account, k.id, a.currency, p_month, v_next);
    v_pkg := jsonb_build_object('name', k.name, 'price', v_price, 'term_months', pl.term_months);
    v_sub := v_price + (u ->> 'overage_total')::numeric + (u ->> 'extras_total')::numeric;
  else
    select coalesce(sum((l ->> 'amount')::numeric), 0) into v_sub from jsonb_array_elements(v_lines) l;
  end if;
  v_vat := case when coalesce(v_vat_on, false) then round(v_sub * 0.05, 2) else 0 end;
  return jsonb_build_object('account_id', p_account, 'month', p_month, 'currency', a.currency,
    'mode', case when k.id is not null then 'package' else 'payg' end, 'package', v_pkg,
    'lines', v_lines, 'overage', coalesce(u -> 'usage', '[]'::jsonb),
    'subtotal', round(v_sub, 2), 'vat_rate', case when coalesce(v_vat_on, false) then 5 else 0 end,
    'vat', v_vat, 'total', round(v_sub, 2) + v_vat);
end $$;

revoke all on function private.pkg_price(uuid, text), private.pkg_overage_rate(uuid, uuid, text, text),
  private.pays_online(uuid), private.package_usage(uuid, uuid, text, date, date), private.plan_view(uuid),
  private.payg_view(uuid), private.best_offer(uuid), private.suggestion_for(uuid),
  private.build_statement(uuid, date) from public, anon, authenticated;

-- ---------- the client's Billing page ----------
create or replace function public.my_billing(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; s public.billing_settings%rowtype; v_online boolean;
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin') then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  select * into a from public.accounts where id = p_account;
  select * into s from public.billing_settings where id;
  v_online := private.pays_online(p_account);
  return jsonb_build_object(
    'currency', a.currency,
    'mode', case when private.plan_view(p_account) is not null then 'package' else 'payg' end,
    'plan', private.plan_view(p_account),
    'payg', private.payg_view(p_account),
    'suggestion', private.suggestion_for(p_account),
    'pay_online', v_online,
    'bank', case when not v_online and s.bank_iban is not null then jsonb_build_object(
      'account_name', s.bank_account_name, 'bank', s.bank_name, 'iban', s.bank_iban, 'swift', s.bank_swift) end,
    'statements', coalesce((select jsonb_agg(jsonb_build_object('month', st.month, 'total', st.total,
        'currency', st.currency, 'vat', st.vat) order by st.month desc)
      from (select * from public.statements where account_id = p_account order by month desc limit 6) st), '[]'::jsonb)
  );
end $$;

-- An invoice the client may pay online: theirs (Owner/Admin), unpaid, and online payment is on.
create or replace function public.my_invoice_for_payment(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  select * into i from public.invoices where id = p_invoice;
  if i.id is null or coalesce(private.account_role(i.account_id), '') not in ('owner', 'admin') then
    raise exception 'not your invoice' using errcode = '42501';
  end if;
  return jsonb_build_object('id', i.id, 'account_id', i.account_id, 'number', i.number,
    'amount', i.amount, 'currency', i.currency, 'unpaid', i.status in ('due', 'overdue'),
    'pay_online', private.pays_online(i.account_id));
end $$;

-- "I've paid" by bank transfer: the proof (already in R2 under payments/<account>/<invoice>/).
create or replace function public.submit_payment_proof(p_invoice uuid, p_key text, p_filename text,
  p_bytes bigint, p_content_type text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; a public.accounts%rowtype;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null or coalesce(private.account_role(i.account_id), '') not in ('owner', 'admin') then
    raise exception 'not your invoice' using errcode = '42501';
  end if;
  if i.status not in ('due', 'overdue') then raise exception 'already paid' using errcode = '22023'; end if;
  if i.payment_state = 'submitted' then raise exception 'already submitted' using errcode = '22023'; end if;
  insert into public.payment_proofs (invoice_id, account_id, key, filename, bytes, content_type, note)
    values (i.id, i.account_id, p_key, btrim(p_filename), p_bytes, p_content_type, nullif(btrim(coalesce(p_note, '')), ''));
  update public.invoices set payment_state = 'submitted', reject_reason = null where id = i.id;
  select * into a from public.accounts where id = i.account_id;
  return jsonb_build_object('number', i.number, 'amount', i.amount, 'currency', i.currency, 'account', a.name);
end $$;

revoke all on function public.my_invoice_for_payment(uuid),
  public.submit_payment_proof(uuid, text, text, bigint, text, text) from public, anon;
grant execute on function public.my_invoice_for_payment(uuid),
  public.submit_payment_proof(uuid, text, text, bigint, text, text) to authenticated;

-- ---------- the admin ----------
create or replace function public.portal_admin_invoices(p_secret text, p_actor text, p_account uuid default null,
  p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.issued_on desc, x.number desc) from (
    select i.*, a.name as account_name,
      case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end as shown_status,
      (select to_jsonb(pp) - 'account_id' from public.payment_proofs pp where pp.invoice_id = i.id
        order by pp.submitted_at desc limit 1) as proof
    from public.invoices i join public.accounts a on a.id = i.account_id
    where (p_account is null or i.account_id = p_account)
      and (p_status is null
        or (p_status = 'submitted' and i.payment_state = 'submitted' and i.status <> 'paid')
        or (case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end) = p_status)
    limit 500) x), '[]'::jsonb);
end $$;

drop function if exists public.portal_admin_create_invoice(text, text, uuid, text, date, date, numeric, text, text, text, text);
create or replace function public.portal_admin_create_invoice(p_secret text, p_actor text, p_account uuid,
  p_number text, p_issued date, p_due date, p_amount numeric, p_currency text, p_status text,
  p_pdf_key text, p_note text default null, p_statement_month date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_pdf_key is not null and (p_pdf_key not like 'invoices/' || p_account || '/%' or p_pdf_key like '%..%') then
    raise exception 'not a PDF for this client' using errcode = '22023';
  end if;
  insert into public.invoices (account_id, number, issued_on, due_on, amount, currency, status, paid_at,
    paid_via, pdf_key, note, created_by, statement_month)
  values (p_account, btrim(p_number), p_issued, p_due, p_amount, p_currency, p_status,
    case when p_status = 'paid' then now() end, case when p_status = 'paid' then 'manual' end,
    p_pdf_key, nullif(btrim(coalesce(p_note, '')), ''), p_actor, p_statement_month)
  returning id into v;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', p_account, 'Invoice ' || btrim(p_number) || ' · ' || p_currency || ' ' || p_amount);
  return jsonb_build_object('id', v, 'recipients', private.billing_recipients(p_account, 'invoice_issued'));
end $$;

create or replace function public.portal_admin_set_invoice_status(p_secret text, p_actor text, p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  update public.invoices set status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end,
    paid_via = case when p_status = 'paid' then coalesce(paid_via, 'manual') else null end,
    payment_state = case when p_status = 'paid' then null else payment_state end
    where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ': ' || i.status || ' → ' || p_status);
  return jsonb_build_object('account', i.account_id,
    'recipients', case when p_status = 'paid' and i.status <> 'paid'
      then private.billing_recipients(i.account_id, 'payment_received') else '[]'::jsonb end);
end $$;

-- Stripe Checkout: remember the session for an invoice; then the webhook marks it Paid, only if
-- the session, amount (in minor units) and currency all match.
create or replace function public.portal_admin_set_stripe_session(p_secret text, p_actor text, p_invoice uuid,
  p_session text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.invoices set stripe_session_id = p_session where id = p_invoice and status <> 'paid';
end $$;

create or replace function public.portal_admin_stripe_paid(p_secret text, p_actor text, p_invoice uuid,
  p_session text, p_amount_minor bigint, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  if i.stripe_session_id is distinct from p_session then raise exception 'session mismatch' using errcode = '22023'; end if;
  if round(i.amount * 100) <> p_amount_minor or lower(i.currency) <> lower(p_currency) then
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  if i.status = 'paid' then
    return jsonb_build_object('already', true, 'account', i.account_id, 'recipients', '[]'::jsonb);
  end if;
  update public.invoices set status = 'paid', paid_at = now(), paid_via = 'stripe', payment_state = null
    where id = i.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ' paid by card (Stripe)');
  return jsonb_build_object('already', false, 'account', i.account_id, 'number', i.number,
    'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on,
    'recipients', private.billing_recipients(i.account_id, 'payment_received'));
end $$;

-- Bank transfer: confirm (Paid + "Payment received") or reject with a reason the client sees.
create or replace function public.portal_admin_decide_payment(p_secret text, p_actor text, p_proof uuid,
  p_confirm boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pp public.payment_proofs%rowtype; i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into pp from public.payment_proofs where id = p_proof for update;
  if pp.id is null or pp.status <> 'submitted' then raise exception 'nothing to decide' using errcode = '22023'; end if;
  if not p_confirm and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select * into i from public.invoices where id = pp.invoice_id for update;
  update public.payment_proofs set status = case when p_confirm then 'confirmed' else 'rejected' end,
    reason = case when p_confirm then null else btrim(p_reason) end, decided_at = now(), decided_by = p_actor
    where id = pp.id;
  if p_confirm then
    update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()), paid_via = 'bank',
      payment_state = null, reject_reason = null where id = i.id;
  else
    update public.invoices set payment_state = 'rejected', reject_reason = btrim(p_reason) where id = i.id;
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ': bank payment ' ||
      case when p_confirm then 'confirmed' else 'rejected: ' || btrim(p_reason) end);
  return jsonb_build_object('account', i.account_id, 'number', i.number, 'amount', i.amount,
    'currency', i.currency, 'due_on', i.due_on, 'key', pp.key,
    'event', case when p_confirm then 'payment_received' else 'payment_rejected' end,
    'reason', case when p_confirm then null else btrim(p_reason) end,
    'recipients', case when p_confirm and i.status <> 'paid' or not p_confirm
      then private.billing_recipients(i.account_id, 'payment_received') else '[]'::jsonb end);
end $$;

create or replace function public.portal_admin_proof(p_secret text, p_actor text, p_proof uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select to_jsonb(pp) from public.payment_proofs pp where pp.id = p_proof);
end $$;

-- Statements: freeze a month (by default last month, for every client with work or a package).
-- Already frozen months are kept unless p_replace. Only complete months.
create or replace function public.portal_admin_freeze_statements(p_secret text, p_actor text,
  p_month date default null, p_account uuid default null, p_replace boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare v_month date := coalesce(date_trunc('month', p_month)::date,
    (private.dubai_month(now()) - interval '1 month')::date);
  r record; b jsonb; v_n int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if v_month >= private.dubai_month(now()) then
    raise exception 'only complete months' using errcode = '22023';
  end if;
  for r in select a.id from public.accounts a
    where (p_account is null or a.id = p_account)
      and (exists (select 1 from public.line_items li where li.account_id = a.id and li.delivered_month = v_month)
        or exists (select 1 from public.account_plans pl where pl.account_id = a.id and pl.mode = 'package'))
  loop
    continue when not p_replace and exists (select 1 from public.statements where account_id = r.id and month = v_month);
    b := private.build_statement(r.id, v_month);
    insert into public.statements (account_id, month, currency, mode, package, lines, overage, subtotal, vat_rate, vat, total, frozen_by)
    values (r.id, v_month, b ->> 'currency', b ->> 'mode', b -> 'package', b -> 'lines', b -> 'overage',
      (b ->> 'subtotal')::numeric, (b ->> 'vat_rate')::numeric, (b ->> 'vat')::numeric, (b ->> 'total')::numeric, p_actor)
    on conflict (account_id, month) do update set currency = excluded.currency, mode = excluded.mode,
      package = excluded.package, lines = excluded.lines, overage = excluded.overage, subtotal = excluded.subtotal,
      vat_rate = excluded.vat_rate, vat = excluded.vat, total = excluded.total, frozen_at = now(), frozen_by = p_actor;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.portal_admin_statement(p_secret text, p_actor text, p_account uuid, p_month date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select to_jsonb(s) from public.statements s
    where s.account_id = p_account and s.month = date_trunc('month', p_month)::date);
end $$;

-- Settings: suggestions, minimum saving, VAT, bank details.
create or replace function public.portal_admin_billing_settings(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select to_jsonb(s) - 'id' from public.billing_settings s where id);
end $$;

create or replace function public.portal_admin_save_billing_settings(p_secret text, p_actor text, p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.billing_settings set
    suggestions_enabled = coalesce((p ->> 'suggestions_enabled')::boolean, suggestions_enabled),
    min_saving_aed = coalesce((p ->> 'min_saving_aed')::numeric, min_saving_aed),
    min_saving_usd = coalesce((p ->> 'min_saving_usd')::numeric, min_saving_usd),
    vat_registered = coalesce((p ->> 'vat_registered')::boolean, vat_registered),
    bank_account_name = case when p ? 'bank_account_name' then nullif(btrim(p ->> 'bank_account_name'), '') else bank_account_name end,
    bank_name = case when p ? 'bank_name' then nullif(btrim(p ->> 'bank_name'), '') else bank_name end,
    bank_iban = case when p ? 'bank_iban' then nullif(upper(replace(p ->> 'bank_iban', ' ', '')), '') else bank_iban end,
    bank_swift = case when p ? 'bank_swift' then nullif(upper(replace(p ->> 'bank_swift', ' ', '')), '') else bank_swift end,
    updated_at = now()
  where id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', null, 'Billing settings saved');
end $$;

-- Phase 12's two calls, kept for their callers.
create or replace function public.portal_admin_suggestions(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select jsonb_build_object('enabled', s.suggestions_enabled, 'min_saving_aed', s.min_saving_aed,
    'min_saving_usd', s.min_saving_usd,
    'templates', (select count(*) from public.packages where account_id is null and suggest))
    from public.billing_settings s where id);
end $$;

drop function if exists public.portal_admin_save_package(text, text, uuid, uuid, text, numeric, text, jsonb, jsonb, boolean);
create or replace function public.portal_admin_save_package(p_secret text, p_actor text, p_id uuid,
  p_account uuid, p_name text, p_price numeric, p_currency text, p_inclusions jsonb, p_overage jsonb,
  p_visible boolean default false, p_price_usd numeric default null, p_discount_pct numeric default 10,
  p_suggest boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if exists (select 1 from jsonb_array_elements(coalesce(p_inclusions, '[]')) i
      where coalesce(i ->> 'key', '') = '' or (i ->> 'qty') is null or (i ->> 'qty')::numeric <= 0) then
    raise exception 'each inclusion needs a kind and a quantity' using errcode = '22023';
  end if;
  -- Templates are priced in AED, with the USD price beside it.
  if p_account is null and p_currency <> 'AED' then
    raise exception 'templates are priced in AED and USD' using errcode = '22023';
  end if;
  if v is null then
    insert into public.packages (account_id, name, monthly_price, currency, inclusions, overage, visible,
      price_usd, six_month_discount_pct, suggest)
    values (p_account, btrim(p_name), p_price, p_currency, coalesce(p_inclusions, '[]'), coalesce(p_overage, '[]'),
      coalesce(p_visible, false), case when p_account is null then p_price_usd end, coalesce(p_discount_pct, 10),
      coalesce(p_suggest, true))
    returning id into v;
  else
    update public.packages set account_id = p_account, name = btrim(p_name), monthly_price = p_price,
      currency = p_currency, inclusions = coalesce(p_inclusions, '[]'), overage = coalesce(p_overage, '[]'),
      visible = coalesce(p_visible, false), price_usd = case when p_account is null then p_price_usd end,
      six_month_discount_pct = coalesce(p_discount_pct, 10), suggest = coalesce(p_suggest, true), updated_at = now()
    where id = v;
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Package ' || btrim(p_name) || ' saved');
  return v;
end $$;

drop function if exists public.portal_admin_set_plan(text, text, uuid, text, uuid, date, date);
create or replace function public.portal_admin_set_plan(p_secret text, p_actor text, p_account uuid,
  p_mode text, p_package uuid, p_started date, p_renews date, p_term int default 1, p_ends date default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_mode = 'package' and (p_package is null or p_renews is null) then
    raise exception 'choose the package and its renewal date' using errcode = '22023';
  end if;
  insert into public.account_plans (account_id, mode, package_id, started_on, renews_on, term_months, ends_on)
    values (p_account, p_mode, case when p_mode = 'package' then p_package end, p_started, p_renews,
      case when p_mode = 'package' then coalesce(p_term, 1) else 1 end,
      case when p_mode = 'package' and p_term = 6 then p_ends end)
  on conflict (account_id) do update set mode = excluded.mode, package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, term_months = excluded.term_months,
    ends_on = excluded.ends_on, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Plan: ' || p_mode || case when p_term = 6 then ' (6 months)' else '' end);
end $$;

create or replace function public.portal_admin_set_client_billing(p_secret text, p_actor text, p_account uuid,
  p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set
    pinned_package_id = case when p ? 'pinned_package_id' then nullif(p ->> 'pinned_package_id', '')::uuid else pinned_package_id end,
    pay_online = case when p ? 'pay_online' then (p ->> 'pay_online')::boolean else pay_online end
  where id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Billing options: ' || p::text);
end $$;

create or replace function public.portal_admin_client_billing(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  select * into pl from public.account_plans where account_id = p_account;
  return jsonb_build_object(
    'currency', a.currency, 'hide_suggestions', a.hide_suggestions,
    'pinned_package_id', a.pinned_package_id, 'pay_online', a.pay_online,
    'pays_online', private.pays_online(p_account),
    'plan', jsonb_build_object('mode', coalesce(pl.mode, 'payg'), 'package_id', pl.package_id,
      'started_on', pl.started_on, 'renews_on', pl.renews_on, 'term_months', coalesce(pl.term_months, 1),
      'ends_on', pl.ends_on, 'package', private.plan_view(p_account)),
    'payg', private.payg_view(p_account),
    'suggestion', private.suggestion_for(p_account),
    'best_offer', private.best_offer(p_account),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'label', r.label, 'unit', r.unit,
        'card', case a.currency when 'USD' then r.amount_usd else r.amount_aed end,
        'override', (select o.amount from public.rate_overrides o where o.account_id = p_account and o.key = r.key))
        order by r.sort) from public.rate_card r), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name,
        'price', private.pkg_price(x.id, a.currency), 'currency', a.currency,
        'private', x.account_id is not null, 'discount_pct', x.six_month_discount_pct)
        order by x.account_id nulls last, x.name)
        from public.packages x where (x.account_id = p_account or x.account_id is null)
          and private.pkg_price(x.id, a.currency) is not null), '[]'::jsonb),
    'statements', coalesce((select jsonb_agg(to_jsonb(s) order by s.month desc)
      from (select * from public.statements where account_id = p_account order by month desc limit 12) s), '[]'::jsonb)
  );
end $$;

revoke all on function
  public.portal_admin_invoices(text, text, uuid, text),
  public.portal_admin_create_invoice(text, text, uuid, text, date, date, numeric, text, text, text, text, date),
  public.portal_admin_set_invoice_status(text, text, uuid, text),
  public.portal_admin_set_stripe_session(text, text, uuid, text),
  public.portal_admin_stripe_paid(text, text, uuid, text, bigint, text),
  public.portal_admin_decide_payment(text, text, uuid, boolean, text),
  public.portal_admin_proof(text, text, uuid),
  public.portal_admin_freeze_statements(text, text, date, uuid, boolean),
  public.portal_admin_statement(text, text, uuid, date),
  public.portal_admin_billing_settings(text, text),
  public.portal_admin_save_billing_settings(text, text, jsonb),
  public.portal_admin_suggestions(text, text),
  public.portal_admin_save_package(text, text, uuid, uuid, text, numeric, text, jsonb, jsonb, boolean, numeric, numeric, boolean),
  public.portal_admin_set_plan(text, text, uuid, text, uuid, date, date, int, date),
  public.portal_admin_set_client_billing(text, text, uuid, jsonb),
  public.portal_admin_client_billing(text, text, uuid)
  from public;
grant execute on function
  public.portal_admin_invoices(text, text, uuid, text),
  public.portal_admin_create_invoice(text, text, uuid, text, date, date, numeric, text, text, text, text, date),
  public.portal_admin_set_invoice_status(text, text, uuid, text),
  public.portal_admin_set_stripe_session(text, text, uuid, text),
  public.portal_admin_stripe_paid(text, text, uuid, text, bigint, text),
  public.portal_admin_decide_payment(text, text, uuid, boolean, text),
  public.portal_admin_proof(text, text, uuid),
  public.portal_admin_freeze_statements(text, text, date, uuid, boolean),
  public.portal_admin_statement(text, text, uuid, date),
  public.portal_admin_billing_settings(text, text),
  public.portal_admin_save_billing_settings(text, text, jsonb),
  public.portal_admin_suggestions(text, text),
  public.portal_admin_save_package(text, text, uuid, uuid, text, numeric, text, jsonb, jsonb, boolean, numeric, numeric, boolean),
  public.portal_admin_set_plan(text, text, uuid, text, uuid, date, date, int, date),
  public.portal_admin_set_client_billing(text, text, uuid, jsonb),
  public.portal_admin_client_billing(text, text, uuid)
  to anon, authenticated;

-- ---------- housekeeping: share-page web versions go with their file (Phase 13 follow-up) ----------
create or replace function public.portal_admin_web_keys(p_secret text, p_actor text, p_ids uuid[])
returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select array_agg(k) from public.project_files f,
    unnest(array[f.web_key, f.og_key, f.poster_key]) k
    where f.id = any (p_ids) and k is not null), '{}');
end $$;
revoke all on function public.portal_admin_web_keys(text, text, uuid[]) from public;
grant execute on function public.portal_admin_web_keys(text, text, uuid[]) to anon, authenticated;
