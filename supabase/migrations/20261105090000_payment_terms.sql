-- Payment terms, value packages, cancellations and booking terms (owner, 24 Oct 2026).
-- docs/PAYMENT_TERMS_PLAN.md has the decisions. Additive: new columns, tables and functions; check
-- constraints widened (never narrowed); replaced functions keep their behaviour for the old models.
--
-- * Payment terms per client: end of month | 50% upfront + balance on delivery | 100% before the shoot.
--   New accounts default to 100% before the shoot. Package clients always book like end of month.
-- * Every payment is an invoice: a booking invoice (stage full / deposit) at booking, a balance on
--   delivery, a fee on a late cancellation. A paid full/deposit invoice confirms the booking.
-- * Downloads are locked while a project has an unpaid booking invoice, unless the admin released it.
-- * Value packages: a monthly AED allowance and a half-day cap (both set = the value model).
-- * Cancellations record the fee, the refunds (Stripe automatic, bank/Wio a "Refund due" task).
-- * Booking terms: accepted per booking (user, version, time).

-- ---------- columns ----------
alter table public.accounts add column if not exists payment_terms text not null default 'prepay'
  check (payment_terms in ('month_end', 'split', 'prepay'));

alter table public.billing_settings
  add column if not exists wio_link text check (wio_link is null or (wio_link ~ '^https://\S+$' and length(wio_link) <= 300)),
  add column if not exists cancel_free_hours numeric not null default 3 check (cancel_free_hours between 0 and 168),
  add column if not exists late_fee_pct numeric not null default 50 check (late_fee_pct between 0 and 100),
  add column if not exists late_fee_min numeric not null default 250 check (late_fee_min >= 0),
  add column if not exists work_keep_pct numeric not null default 50 check (work_keep_pct between 0 and 100);

alter table public.packages
  add column if not exists allowance numeric check (allowance is null or allowance >= 0),
  add column if not exists half_day_cap numeric check (half_day_cap is null or (half_day_cap >= 0 and half_day_cap = trunc(half_day_cap)));

alter table public.invoices
  add column if not exists stage text check (stage in ('full', 'deposit', 'balance', 'fee')),
  add column if not exists refunded numeric not null default 0 check (refunded >= 0),
  add column if not exists emailed_at timestamptz;
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'approved', 'due', 'paid', 'overdue', 'void'));
alter table public.invoices drop constraint if exists invoices_category_check;
alter table public.invoices add constraint invoices_category_check
  check (category in ('budget', 'fixed', 'payg', 'property', 'one_off', 'manual', 'booking'));
create index if not exists invoices_project_stage on public.invoices (project_id) where stage is not null;

alter table public.projects
  add column if not exists files_released_at timestamptz,
  add column if not exists released_by text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text check (cancel_reason in ('client', 'late', 'en_route', 'no_access', 'admin')),
  add column if not exists cancel_fee numeric check (cancel_fee >= 0),
  add column if not exists fee_waived boolean not null default false,
  add column if not exists half_days_late numeric not null default 0 check (half_days_late >= 0),
  add column if not exists prev_status text;
-- Edits and avatar videos can be cancelled too.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check (
  (type = 'shoot' and status in ('requested', 'confirmed', 'shot', 'editing', 'delivered', 'completed', 'cancelled'))
  or (type = 'edit' and status in ('submitted', 'files_received', 'in_editing', 'on_hold', 'delivered', 'completed', 'cancelled'))
  or (type = 'avatar' and status in ('brief_received', 'script_ready', 'in_production', 'on_hold', 'delivered', 'completed', 'cancelled')));

-- ---------- tables ----------
create table if not exists public.booking_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null,
  user_name text,
  version text not null check (length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  unique (project_id, user_id, version)
);
alter table public.booking_terms_acceptances enable row level security;
drop policy if exists "members read their acceptances" on public.booking_terms_acceptances;
create policy "members read their acceptances" on public.booking_terms_acceptances
  for select to authenticated using (private.account_role(account_id) is not null);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('AED', 'USD')),
  method text not null check (method in ('stripe', 'bank', 'wio', 'manual')),
  status text not null default 'due' check (status in ('pending', 'due', 'done', 'failed')),
  stripe_refund_id text check (length(stripe_refund_id) <= 200),
  note text check (length(note) <= 300),
  error text check (length(error) <= 300),
  created_by text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text
);
alter table public.refunds enable row level security;
-- Clients see refunds of their own account (Owner/Admins).
drop policy if exists "managers read refunds" on public.refunds;
create policy "managers read refunds" on public.refunds
  for select to authenticated using (private.account_role(account_id) in ('owner', 'admin'));

-- ---------- existing accounts → payment terms ----------
-- Package/budget plans and month-end pay-as-you-go → end of month; everyone else 100% before.
update public.accounts a set payment_terms = 'month_end'
  where a.payg_invoicing = 'month_end'
     or exists (select 1 from public.account_plans pl where pl.account_id = a.id and pl.mode in ('package', 'budget'));

-- ---------- packages: inclusions → value model ----------
-- Two limits per package (owner, 24 Oct 2026): an AED allowance and shoot days, set in full days
-- in the admin and stored as half-days (half_day_cap) so a half day is exactly 0.5.
-- The Growth template: AED 10,000 and 4 full days (8 half-days). Any other package with inclusions:
-- allowance = Σ qty × the client's price (default rates for templates), never below its price; shoot
-- time = reels at 5 per half-day, a walkthrough or full day 2 half-days, a half day 1.
-- Left out: the owner's own test account (Milkywayy LLC); set it by hand if it's ever used.
update public.packages k set allowance = 10000, half_day_cap = 8
  where k.account_id is null and k.name = 'Growth' and k.currency = 'AED' and k.allowance is null;
update public.packages k set
  allowance = greatest(k.monthly_price, (
    select round(sum((i ->> 'qty')::numeric * coalesce(
        case when k.account_id is not null then private.rate_for(k.account_id, i ->> 'key') end,
        (select case when k.currency = 'USD' then rc.amount_usd else rc.amount_aed end
          from public.rate_card rc where rc.key = i ->> 'key'), 0)), 2)
    from jsonb_array_elements(k.inclusions) i)),
  half_day_cap = (
    select ceil(coalesce(sum((i ->> 'qty')::numeric) filter (where i ->> 'key' = 'reel_shoot'), 0) / 5)
      + 2 * coalesce(sum((i ->> 'qty')::numeric) filter (where i ->> 'key' in ('long_form_shoot', 'full_day', 'min_full_day')), 0)
      + coalesce(sum((i ->> 'qty')::numeric) filter (where i ->> 'key' in ('half_day', 'min_half_day')), 0)
    from jsonb_array_elements(k.inclusions) i)
where k.allowance is null and jsonb_array_length(coalesce(k.inclusions, '[]'::jsonb)) > 0
  and not exists (select 1 from public.accounts a where a.id = k.account_id and a.name = 'Milkywayy LLC');

-- ---------- helpers ----------
create or replace function private.settings() returns public.billing_settings
language sql stable security definer set search_path = '' as $$
  select * from public.billing_settings where id
$$;

-- The term a booking follows: package (fixed or budget) clients always book like end of month.
create or replace function private.booking_terms(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.account_plans pl where pl.account_id = p_account
      and pl.mode in ('package', 'budget')) then 'month_end' else a.payment_terms end
  from public.accounts a where a.id = p_account
$$;

-- When the shoot starts (Dubai): the preferred start time, else the slot's start.
create or replace function private.shoot_start(p public.projects) returns timestamptz
language sql stable set search_path = '' as $$
  select case when p.shoot_date is null then null else
    ((p.shoot_date::text || ' ' || coalesce(nullif(p.meta -> 'booking' ->> 'start_time', ''),
      case lower(coalesce(p.meta -> 'booking' ->> 'slot', p.slot)) when 'afternoon' then '13:00' else '08:00' end))::timestamp
      at time zone 'Asia/Dubai') end
$$;

-- A booking's value: its logged line items, else the estimate made at booking.
create or replace function private.booking_value(p_project uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select round(sum(li.qty * coalesce(case when li.included then li.list_price end, li.unit_price)), 2)
      from public.line_items li where li.project_id = p_project),
    (select nullif(coalesce(p.meta -> 'booking' ->> 'estimate', p.meta ->> 'estimate'), '')::numeric
      from public.projects p where p.id = p_project),
    0)
$$;

-- Half-days a booking uses: content shoots by slot (Full day = 2), property-only shoots and other work 0.
create or replace function private.booking_half_days(p public.projects) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p.type <> 'shoot' then 0
    when not exists (select 1 from jsonb_array_elements(coalesce(p.meta -> 'booking' -> 'services', '[]'::jsonb)) s
      where s ->> 'service' = 'videos') then 0
    when lower(coalesce(p.meta -> 'booking' ->> 'slot', p.slot)) in ('full_day', 'full day')
      or p.meta -> 'booking' -> 'services' @> '[{"videos": {"day": "full"}}]' then 2
    else 1 end
$$;

-- Unpaid booking invoices hold the downloads back, unless the admin released the files.
create or replace function private.files_locked(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.project_id = p_project and i.stage in ('full', 'deposit', 'balance')
      and i.status in ('due', 'overdue') and p.files_released_at is null)
$$;

revoke all on function private.settings(), private.booking_terms(uuid), private.shoot_start(public.projects),
  private.booking_value(uuid), private.booking_half_days(public.projects), private.files_locked(uuid)
  from public, anon, authenticated;

-- ---------- value packages: the month's ledger ----------
-- Each booking of the month in order (shoot date, then when it was booked), with what the package
-- covers and what's extra. A booking crossing the line is split: the extra is the larger of the part
-- over the allowance and the share of its half-days over the cap. A late cancellation on a package
-- uses its half-day (value 0). Edits and avatar videos count their value, no half-days.
create or replace function private.value_ledger(p_account uuid, p_from date, p_to date, p_allowance numeric,
  p_cap numeric) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record; v_left numeric := coalesce(p_allowance, 0); v_hd_left numeric := coalesce(p_cap, 0);
  v_rows jsonb := '[]'::jsonb; v_extra numeric; v_inc numeric; v_used numeric := 0; v_hd_used numeric := 0;
  v_extra_total numeric := 0; v_hd_over numeric;
begin
  for r in
    select p.id, p.ref, p.title, p.type, p.status, p.shoot_date,
      coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) as day,
      case when p.status = 'cancelled' then 0 else private.booking_value(p.id) end as value,
      case when p.status = 'cancelled' then p.half_days_late else private.booking_half_days(p) + p.half_days_late end as hd
    from public.projects p
    where p.account_id = p_account
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) >= p_from
      and coalesce(p.shoot_date, (p.delivered_at at time zone 'Asia/Dubai')::date, (p.created_at at time zone 'Asia/Dubai')::date) < p_to
      and (p.status <> 'cancelled' or p.half_days_late > 0)
    order by 7, p.created_at
  loop
    if r.value = 0 and r.hd = 0 then continue; end if;
    v_extra := greatest(r.value - v_left, 0);
    v_hd_over := greatest(r.hd - v_hd_left, 0);
    if r.hd > 0 and v_hd_over > 0 then
      v_extra := greatest(v_extra, round(r.value * v_hd_over / r.hd, 2));
    end if;
    v_extra := least(v_extra, r.value);
    v_inc := r.value - v_extra;
    v_left := greatest(v_left - v_inc, 0);
    v_hd_left := greatest(v_hd_left - least(r.hd, v_hd_left), 0);
    v_used := v_used + v_inc;
    v_hd_used := v_hd_used + r.hd;
    v_extra_total := v_extra_total + v_extra;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('project_id', r.id, 'ref', r.ref, 'title', r.title,
      'type', r.type, 'status', r.status, 'date', r.day, 'value', r.value, 'half_days', r.hd,
      'included', v_inc, 'extra', v_extra, 'late_cancel', r.status = 'cancelled'));
  end loop;
  return jsonb_build_object('rows', v_rows, 'used', v_used, 'half_days_used', v_hd_used,
    'extras_total', v_extra_total);
end $$;
revoke all on function private.value_ledger(uuid, date, date, numeric, numeric) from public, anon, authenticated;

-- Line items on a value package keep their price (the ledger decides what's extra).
create or replace function private.apply_inclusions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text := coalesce(new.kind, new.rate_key); v_day date; v_pm jsonb; v_qty numeric; v_used numeric;
  v_left numeric; v_rate numeric; pl public.account_plans%rowtype; v_value boolean;
begin
  if new.included is not null or new.account_id is null then return new; end if;
  new.included := false;
  if new.price_basis in ('override', 'manual') or v_key is null then return new; end if;
  select * into pl from public.account_plans where account_id = new.account_id;
  if pl.mode is distinct from 'package' then return new; end if;
  select k.allowance is not null and k.half_day_cap is not null into v_value
    from public.packages k where k.id = pl.package_id;
  if coalesce(v_value, false) then return new; end if;
  v_day := coalesce(new.service_date, (now() at time zone 'Asia/Dubai')::date);
  new.service_date := v_day;
  v_pm := private.package_month(new.account_id, v_day);
  if v_pm is null or v_day < (v_pm ->> 'period_start')::date then return new; end if;
  select (i ->> 'qty')::numeric into v_qty from jsonb_array_elements(v_pm -> 'inclusions') i
    where i ->> 'key' = v_key limit 1;
  if v_qty is null then return new; end if;
  select coalesce(sum(li.qty), 0) into v_used from public.line_items li
    left join public.projects p on p.id = li.project_id
    where li.account_id = new.account_id and li.included and coalesce(li.kind, li.rate_key) = v_key
      and private.item_day(li.service_date, p.delivered_at, li.created_at) >= (v_pm ->> 'period_start')::date
      and private.item_day(li.service_date, p.delivered_at, li.created_at) < (v_pm ->> 'renews_on')::date;
  v_left := greatest(v_qty - v_used, 0);
  select nullif(o ->> 'amount', '')::numeric into v_rate
    from public.packages k, jsonb_array_elements(k.overage) o
    where k.id = pl.package_id and o ->> 'key' = v_key limit 1;
  if v_left <= 0 then
    new.unit_price := coalesce(v_rate, new.unit_price);
    return new;
  end if;
  if new.qty > v_left then
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, override_reason, logged, sort, included)
    values (new.project_id, new.account_id, new.description, new.qty - v_left, coalesce(v_rate, new.unit_price),
      new.currency, new.kind, new.delivered_month, new.service_date, new.rate_key, new.price_basis, new.list_price,
      new.override_reason, new.logged, new.sort, false);
    new.qty := v_left;
  end if;
  new.included := true;
  new.list_price := coalesce(new.list_price, new.unit_price);
  new.unit_price := 0;
  return new;
end $$;

-- One package month. The value model adds allowance / half-days and its ledger; its extras are the
-- ledger's (one per booking over the package), so month-end lines and statements work unchanged.
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
    * (case when pl.term_months = 6 then 1 - k.six_month_discount_pct / 100 else 1 end), 2);
  v_price := round(v_full * v_frac, 2);
  if v_value then
    v_inc := '[]'::jsonb;
    v_allow := round(k.allowance * v_frac, 2);
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
    and private.item_day(li.service_date, p.delivered_at, li.created_at) < v_start;
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

-- ---------- invoices for bookings ----------
-- Booking invoices are issued straight away (numbered, due today); a draft only when asked.
create or replace function private.stage_invoice(p_project uuid, p_stage text, p_lines jsonb, p_actor text,
  p_publish boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v uuid; i public.invoices%rowtype; v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or p.account_id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'add at least one line' using errcode = '22023';
  end if;
  v := private.new_draft(p.account_id, 'booking', v_today, null, p_lines, null, p_actor, p.id, false,
    null, p.ref || ' · ' || p.title);
  update public.invoices set stage = p_stage, due_on = v_today where id = v;
  if p_publish then
    update public.invoices set status = 'approved', approved_at = now(), approved_by = p_actor,
      number = private.next_invoice_number() where id = v;
    perform private.publish_invoice(v, p_actor);
    update public.invoices set due_on = v_today where id = v;
  end if;
  select * into i from public.invoices where id = v;
  return jsonb_build_object('id', i.id, 'number', i.number, 'amount', i.amount, 'currency', i.currency,
    'status', i.status, 'stage', i.stage);
end $$;
revoke all on function private.stage_invoice(uuid, text, jsonb, text, boolean) from public, anon, authenticated;

-- At booking (the server, with the estimate it worked out): the 100% or 50% invoice. Returns it, or
-- null when nothing is due now (end of month, a package, nothing to charge).
create or replace function public.portal_admin_booking_invoice(p_secret text, p_actor text, p_project uuid,
  p_lines jsonb, p_estimate numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_terms text; v_lines jsonb; v_half numeric;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if exists (select 1 from public.invoices where project_id = p.id and stage in ('full', 'deposit')
      and status <> 'void') then
    return (select jsonb_build_object('id', id, 'number', number, 'amount', amount, 'currency', currency,
        'status', status, 'stage', stage)
      from public.invoices where project_id = p.id and stage in ('full', 'deposit') and status <> 'void'
      order by created_at desc limit 1);
  end if;
  -- Edits and avatar videos keep their estimate on the project (shoots already have it).
  if p.type <> 'shoot' and p_estimate is not null then
    update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('estimate', p_estimate)
      where id = p.id;
  end if;
  v_terms := private.booking_terms(p.account_id);
  if v_terms = 'month_end' or coalesce(p_estimate, 0) <= 0 then return null; end if;
  if v_terms = 'prepay' then
    v_lines := p_lines;
    if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) = 0 then
      v_lines := jsonb_build_array(jsonb_build_object('description', p.title, 'qty', 1, 'unit_price', p_estimate));
    end if;
    return private.stage_invoice(p.id, 'full', v_lines, p_actor);
  end if;
  v_half := round(p_estimate / 2, 2);
  return private.stage_invoice(p.id, 'deposit', jsonb_build_array(jsonb_build_object(
    'description', 'Deposit (50%) · ' || p.ref || ' · ' || p.title, 'qty', 1, 'unit_price', v_half)), p_actor);
end $$;

-- A paid full/deposit invoice confirms the booking (a shoot waiting for confirmation, any way it's paid).
create or replace function private.invoice_paid_confirms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  if new.status <> 'paid' or old.status = 'paid' or new.project_id is null or new.stage not in ('full', 'deposit') then
    return new;
  end if;
  select * into p from public.projects where id = new.project_id for update;
  if p.type = 'shoot' and p.status = 'requested' then
    update public.projects set status = 'confirmed' where id = p.id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
      values (p.id, 'status', 'requested', 'confirmed', 'Confirmed on payment (' || new.number || ')', 'Milkywayy', true);
  end if;
  return new;
end $$;
drop trigger if exists invoices_paid_confirms on public.invoices;
create trigger invoices_paid_confirms after update of status on public.invoices
  for each row execute function private.invoice_paid_confirms();
revoke all on function private.invoice_paid_confirms() from public, anon, authenticated;

-- Delivered: pay-as-you-go per project as before; a booking paid upfront gets its balance (50%,
-- published so the client can pay and unlock) or a draft for anything logged beyond what was paid (100%).
create or replace function private.project_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_lines jsonb; v_basis numeric; v_mode text; v_paid numeric; v_value numeric;
  v_split boolean; v_items jsonb; v_inv jsonb;
begin
  if new.status <> 'delivered' or old.status = 'delivered' or new.account_id is null then return new; end if;
  select * into a from public.accounts where id = new.account_id;
  select mode into v_mode from public.account_plans where account_id = new.account_id;
  if exists (select 1 from public.invoices where project_id = new.id and stage in ('full', 'deposit') and status <> 'void') then
    if exists (select 1 from public.invoices where project_id = new.id and status <> 'void'
        and (stage = 'balance' or (category = 'booking' and stage is null))) then
      return new;
    end if;
    select coalesce(sum(subtotal), 0), bool_or(stage = 'deposit') into v_paid, v_split
      from public.invoices where project_id = new.id and stage in ('full', 'deposit') and status <> 'void';
    v_value := private.booking_value(new.id);
    select coalesce(jsonb_agg(jsonb_build_object('line_item_id', li.id)), '[]'::jsonb) into v_items
      from public.line_items li where li.project_id = new.id and li.billed_invoice_id is null;
    if round(v_value - v_paid, 2) > 0 then
      v_lines := jsonb_build_array(jsonb_build_object('description', (case when v_split then 'Balance' else 'Additional work' end)
        || ' · ' || new.ref || ' · ' || new.title
        || ' (' || to_char(v_value, 'FM999,999,990.00') || ' less ' || to_char(v_paid, 'FM999,999,990.00') || ' paid)',
        'qty', 1, 'unit_price', round(v_value - v_paid, 2)));
      -- 50%: the balance, issued now (it holds the files back). 100%: a draft for you to check.
      v_inv := private.stage_invoice(new.id, case when v_split then 'balance' end, v_lines, 'system', v_split);
      update public.line_items set billed_invoice_id = (v_inv ->> 'id')::uuid
        where id in (select (x ->> 'line_item_id')::uuid from jsonb_array_elements(v_items) x);
    else
      update public.line_items set billed_invoice_id = (select id from public.invoices where project_id = new.id
          and stage in ('full', 'deposit') and status <> 'void' order by created_at limit 1)
        where id in (select (x ->> 'line_item_id')::uuid from jsonb_array_elements(v_items) x);
    end if;
    return new;
  end if;
  if coalesce(v_mode, 'payg') <> 'payg' or a.payg_invoicing <> 'per_project' then return new; end if;
  if exists (select 1 from public.invoices where project_id = new.id and category in ('property', 'one_off')) then
    return new;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'line_item_id', li.id, 'kind', li.kind) order by li.sort, li.created_at), '[]'::jsonb),
    coalesce(round(sum(li.qty * li.unit_price), 2), 0)
    into v_lines, v_basis
  from public.line_items li where li.project_id = new.id and li.billed_invoice_id is null;
  if jsonb_array_length(v_lines) = 0 then return new; end if;
  perform private.new_draft(new.account_id, case when new.type = 'shoot' then 'property' else 'one_off' end,
    (now() at time zone 'Asia/Dubai')::date, null, v_lines, null, 'system', new.id, false, v_basis,
    new.ref || ' · ' || new.title);
  return new;
end $$;

-- Invoices issued by the system (balance on delivery) that nobody has been emailed about yet.
create or replace function public.portal_admin_unsent_invoices(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'account', i.account_id, 'number', i.number,
      'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on, 'stage', i.stage,
      'recipients', private.billing_recipients(i.account_id, 'invoice_issued'))), '[]'::jsonb)
    into v
  from public.invoices i where i.project_id = p_project and i.status in ('due', 'overdue') and i.emailed_at is null;
  update public.invoices set emailed_at = now()
    where project_id = p_project and status in ('due', 'overdue') and emailed_at is null;
  return v;
end $$;

-- ---------- what the client sees ----------

-- A project's payment state for the client (members with access to the project): locked or not,
-- and, for those who see money, the invoices and refunds.
create or replace function public.my_project_payment(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.projects%rowtype; v_money boolean;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or not (private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids)
      and private.sees_area(p.account_id, p.type)) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  v_money := coalesce(private.account_role(p.account_id), '') in ('owner', 'admin')
    or exists (select 1 from public.account_members m where m.account_id = p.account_id and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing'));
  return jsonb_build_object('locked', private.files_locked(p.id),
    'terms', private.booking_terms(p.account_id),
    'start', private.shoot_start(p),
    'cancelled', p.status = 'cancelled', 'cancel_fee', p.cancel_fee, 'fee_waived', p.fee_waived,
    'sees_money', v_money,
    'value', case when v_money then private.booking_value(p.id) end,
    'invoices', case when v_money then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number,
        'stage', i.stage, 'amount', i.amount, 'currency', i.currency, 'status', i.status, 'refunded', i.refunded,
        'payment_state', i.payment_state) order by i.created_at)
      from public.invoices i where i.project_id = p.id and i.stage is not null and i.status in ('due', 'paid', 'overdue')), '[]'::jsonb) end,
    'refunds', case when v_money then coalesce((select jsonb_agg(jsonb_build_object('amount', r.amount,
        'currency', r.currency, 'method', r.method, 'status', r.status) order by r.created_at)
      from public.refunds r where r.project_id = p.id), '[]'::jsonb) end);
end $$;

-- The bell: unpaid published invoices (Owner/Admins and members with billing access).
create or replace function public.my_unpaid_count(p_account uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when coalesce(private.account_role(p_account), '') in ('owner', 'admin')
      or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
        and private.member_can(m.role, m.access, 'billing'))
    then (select count(*)::int from public.invoices i where i.account_id = p_account and i.status in ('due', 'overdue'))
    else 0 end
$$;

-- Booking terms, accepted by whoever booked (checked: a member of the project's account).
create or replace function public.accept_booking_terms(p_project uuid, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or auth.uid() is null or private.account_role(p.account_id) is null then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if coalesce(btrim(p_version), '') = '' then raise exception 'terms version needed' using errcode = '22023'; end if;
  insert into public.booking_terms_acceptances (project_id, account_id, user_id, user_name, version)
    values (p.id, p.account_id, auth.uid(), private.my_name(), left(btrim(p_version), 40))
    on conflict (project_id, user_id, version) do nothing;
end $$;

-- ---------- the client's Billing page: value packages, terms, payment options ----------
-- Adds to my_billing: the term, the Wio link, bank details on every invoice, and the value package.
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
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('amount', r.amount, 'currency', r.currency,
        'method', r.method, 'status', r.status, 'created_at', r.created_at,
        'ref', (select ref from public.projects where id = r.project_id)) order by r.created_at desc)
      from public.refunds r where r.account_id = p_account), '[]'::jsonb));
end $$;

-- ---------- admin ----------
create or replace function public.portal_admin_set_payment_terms(p_secret text, p_actor text, p_account uuid,
  p_terms text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_terms not in ('month_end', 'split', 'prepay') then raise exception 'unknown payment terms' using errcode = '22023'; end if;
  select * into a from public.accounts where id = p_account for update;
  if a.id is null then raise exception 'no such client' using errcode = '22023'; end if;
  -- End of month = month-end invoicing; the others are paid per booking.
  update public.accounts set payment_terms = p_terms,
    payg_invoicing = case when p_terms = 'month_end' then 'month_end' else 'per_project' end, updated_at = now()
    where id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Payment terms: ' || a.payment_terms || ' → ' || p_terms);
end $$;

create or replace function public.portal_admin_save_payment_settings(p_secret text, p_actor text, p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.billing_settings set
    wio_link = case when p ? 'wio_link' then nullif(btrim(p ->> 'wio_link'), '') else wio_link end,
    cancel_free_hours = coalesce((p ->> 'cancel_free_hours')::numeric, cancel_free_hours),
    late_fee_pct = coalesce((p ->> 'late_fee_pct')::numeric, late_fee_pct),
    late_fee_min = coalesce((p ->> 'late_fee_min')::numeric, late_fee_min),
    work_keep_pct = coalesce((p ->> 'work_keep_pct')::numeric, work_keep_pct),
    updated_at = now()
  where id;
  insert into private.portal_admin_log (actor, action, detail) values (p_actor, 'update', 'Payment and cancellation settings');
end $$;

-- A package's value model (a template, or a client's own copy). Both blank = back to inclusions.
create or replace function public.portal_admin_set_package_value(p_secret text, p_actor text, p_package uuid,
  p_allowance numeric, p_cap numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.packages%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into k from public.packages where id = p_package for update;
  if k.id is null then raise exception 'no such package' using errcode = '22023'; end if;
  if (p_allowance is null) <> (p_cap is null) then
    raise exception 'set both the allowance and the half-day cap' using errcode = '22023';
  end if;
  if p_allowance < 0 or p_cap < 0 or p_cap <> trunc(p_cap) then
    raise exception 'allowance and half-days must be 0 or more (whole half-days)' using errcode = '22023';
  end if;
  update public.packages set allowance = round(p_allowance, 2), half_day_cap = p_cap, updated_at = now() where id = k.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', k.account_id, 'Package ' || k.name || ': allowance ' || coalesce(p_allowance::text, '—')
      || ', half-days ' || coalesce(p_cap::text, '—'));
end $$;

-- A client's month on a value package, for the admin (same as the client sees, plus money).
create or replace function public.portal_admin_value_month(p_secret text, p_actor text, p_account uuid,
  p_month date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pm jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  v_pm := private.package_month(p_account, coalesce(p_month, private.dubai_month(now())));
  if v_pm is null or not v_pm ? 'value' then return null; end if;
  return (v_pm -> 'value') || jsonb_build_object('name', v_pm ->> 'name', 'price', (v_pm ->> 'price')::numeric,
    'currency', v_pm ->> 'currency', 'month', v_pm ->> 'month', 'extras_total', (v_pm ->> 'extras_total')::numeric,
    'estimate', (v_pm ->> 'estimate')::numeric, 'package_id',
    (select package_id from public.account_plans where account_id = p_account));
end $$;

-- A project's payment card in the admin: term, value, invoices, refunds, lock, terms acceptance.
create or replace function public.portal_admin_project_payment(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; s public.billing_settings%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  s := private.settings();
  return jsonb_build_object('terms', case when p.account_id is null then null else private.booking_terms(p.account_id) end,
    'account_terms', (select payment_terms from public.accounts where id = p.account_id),
    'on_package', exists (select 1 from public.account_plans pl where pl.account_id = p.account_id and pl.mode = 'package'),
    'value', private.booking_value(p.id), 'half_days', private.booking_half_days(p),
    'start', private.shoot_start(p), 'status', p.status, 'type', p.type,
    'locked', private.files_locked(p.id), 'released_at', p.files_released_at, 'released_by', p.released_by,
    'cancelled_at', p.cancelled_at, 'cancel_reason', p.cancel_reason, 'cancel_fee', p.cancel_fee,
    'fee_waived', p.fee_waived, 'half_days_late', p.half_days_late,
    'settings', jsonb_build_object('cancel_free_hours', s.cancel_free_hours, 'late_fee_pct', s.late_fee_pct,
      'late_fee_min', s.late_fee_min, 'work_keep_pct', s.work_keep_pct),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'stage', i.stage,
        'category', i.category, 'amount', i.amount, 'subtotal', i.subtotal, 'currency', i.currency, 'status', i.status,
        'paid_via', i.paid_via, 'paid_at', i.paid_at, 'refunded', i.refunded, 'stripe', i.stripe_session_id is not null,
        'payment_state', i.payment_state) order by i.created_at)
      from public.invoices i where i.project_id = p.id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.refunds r where r.project_id = p.id), '[]'::jsonb),
    'acceptances', coalesce((select jsonb_agg(jsonb_build_object('user_name', t.user_name, 'user_id', t.user_id,
        'email', (select email from auth.users u where u.id = t.user_id),
        'version', t.version, 'accepted_at', t.accepted_at) order by t.accepted_at)
      from public.booking_terms_acceptances t where t.project_id = p.id), '[]'::jsonb),
    'package_left', case when exists (select 1 from public.account_plans pl join public.packages k on k.id = pl.package_id
        where pl.account_id = p.account_id and pl.mode = 'package' and k.half_day_cap is not null)
      then (select (m -> 'value' ->> 'half_day_cap')::numeric - (m -> 'value' ->> 'half_days_used')::numeric
        from (select private.package_month(p.account_id, coalesce(p.shoot_date, private.dubai_month(now()))) m) x) end);
end $$;

-- "Mark as paid / release files": every unpaid booking invoice paid (manual), files released.
create or replace function public.portal_admin_mark_project_paid(p_secret text, p_actor text, p_project uuid,
  p_release_only boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_n int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if not p_release_only then
    update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()), paid_via = coalesce(paid_via, 'manual'),
      payment_state = null
      where project_id = p.id and stage is not null and status in ('due', 'overdue');
    get diagnostics v_n = row_count;
    -- Drafts for the project are approved and paid on the spot.
  end if;
  update public.projects set files_released_at = coalesce(files_released_at, now()), released_by = coalesce(released_by, p_actor)
    where id = p.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || case when p_release_only then 'files released'
      else 'marked paid (' || v_n || ' invoice' || case when v_n = 1 then '' else 's' end || '), files released' end);
  return jsonb_build_object('paid', v_n, 'account', p.account_id,
    'recipients', case when v_n > 0 then private.billing_recipients(p.account_id, 'payment_received') else '[]'::jsonb end);
end $$;

-- Lock the files again (undo a release made by mistake).
create or replace function public.portal_admin_lock_files(p_secret text, p_actor text, p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.projects set files_released_at = null, released_by = null where id = p_project;
end $$;

-- ---------- cancellations, reschedules and refunds ----------
-- The server works out the fee and refunds (quoteChange in lib/portal/payments.ts, shown to the client before they
-- confirm) and applies them here in one go:
--   p = {kind: cancel|reschedule, reason, fee, waived, half_days, refunds: [{invoice_id, amount, method}],
--        keep (edit/avatar: what's kept), date?, slot?, start_time?, by: client|admin}
-- Unpaid booking invoices are voided on a cancellation; a fee beyond what was paid is invoiced (end of month:
-- a line on the month-end invoice; otherwise a published fee invoice). Refunds are recorded: Stripe ones as
-- pending (the server calls Stripe next), bank/Wio ones as "Refund due" for the admin.
create or replace function public.portal_admin_apply_change(p_secret text, p_actor text, p_project uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype; v_kind text := p ->> 'kind'; v_fee numeric := coalesce(nullif(p ->> 'fee', '')::numeric, 0);
  v_waived boolean := coalesce((p ->> 'waived')::boolean, false); v_hd numeric := coalesce(nullif(p ->> 'half_days', '')::numeric, 0);
  v_paid numeric; v_owed numeric; r jsonb; v_refunds jsonb := '[]'::jsonb; v_id uuid; i public.invoices%rowtype;
  v_terms text; v_fee_inv jsonb; v_reason text := coalesce(p ->> 'reason', 'client'); v_cur text;
  v_charged numeric := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into pr from public.projects where id = p_project for update;
  if pr.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if v_kind not in ('cancel', 'reschedule') then raise exception 'cancel or reschedule' using errcode = '22023'; end if;
  if pr.status in ('cancelled', 'completed') or (pr.status = 'delivered' and v_kind = 'reschedule') then
    raise exception 'this project can''t be changed now' using errcode = '22023';
  end if;
  if v_fee < 0 or v_hd < 0 then raise exception 'fee and half-days are 0 or more' using errcode = '22023'; end if;
  if v_waived then v_fee := 0; v_hd := 0; end if;
  select currency into v_cur from public.accounts where id = pr.account_id;
  v_terms := private.booking_terms(pr.account_id);
  select coalesce(sum(amount - refunded), 0) into v_paid from public.invoices
    where project_id = pr.id and stage is not null and status = 'paid';
  -- Refunds, each against a paid invoice of this project, never more than is left on it.
  for r in select * from jsonb_array_elements(coalesce(p -> 'refunds', '[]'::jsonb)) loop
    select * into i from public.invoices where id = (r ->> 'invoice_id')::uuid and project_id = pr.id
      and status = 'paid' for update;
    if i.id is null then raise exception 'refund against a paid invoice of this project' using errcode = '22023'; end if;
    if (r ->> 'amount')::numeric <= 0 then continue; end if;
    if (r ->> 'amount')::numeric > i.amount - i.refunded then
      raise exception 'refund more than was paid' using errcode = '22023';
    end if;
    insert into public.refunds (account_id, project_id, invoice_id, amount, currency, method, status, created_by, note)
      values (pr.account_id, pr.id, i.id, round((r ->> 'amount')::numeric, 2), i.currency,
        case when i.paid_via = 'stripe' then 'stripe' when r ->> 'method' in ('bank', 'wio') then r ->> 'method' else 'bank' end,
        case when i.paid_via = 'stripe' then 'pending' else 'due' end, p_actor,
        left(coalesce(p ->> 'note', ''), 300))
      returning id into v_id;
    v_refunds := v_refunds || jsonb_build_array(jsonb_build_object('id', v_id, 'invoice_id', i.id,
      'amount', round((r ->> 'amount')::numeric, 2), 'stripe', i.paid_via = 'stripe',
      'session', i.stripe_session_id));
  end loop;
  -- Cancelled: the fee is covered by what was paid (and isn't refunded); anything beyond it is charged.
  -- Rescheduled: the booking still stands on what was paid, so the fee is charged on its own.
  v_owed := case when v_kind = 'reschedule' then v_fee else greatest(v_fee - greatest(v_paid
    - coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(v_refunds) x), 0), 0), 0) end;
  if v_kind = 'cancel' then
    update public.invoices set status = 'void' where project_id = pr.id and stage is not null
      and status in ('draft', 'approved', 'due', 'overdue') and id is distinct from (v_fee_inv ->> 'id')::uuid;
    update public.projects set prev_status = status, status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason,
      cancel_fee = v_fee, fee_waived = v_waived, half_days_late = v_hd
      where id = pr.id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
      values (pr.id, 'status', pr.status, 'cancelled', nullif(concat_ws(' · ',
        case when v_fee > 0 then 'Fee ' || v_cur || ' ' || to_char(v_fee, 'FM999,999,990.00') end,
        case when v_hd > 0 then v_hd || ' half-day from the package' end,
        case when v_waived then 'Fee waived' end), ''),
        case when p ->> 'by' = 'client' then coalesce(nullif(p ->> 'by_name', ''), 'Client') else 'Milkywayy' end,
        coalesce(p ->> 'by', 'admin') <> 'client');
  else
    if nullif(p ->> 'date', '') is null then raise exception 'choose the new date' using errcode = '22023'; end if;
    -- A client moving a confirmed shoot sends it back to Requested (Milkywayy confirms the new time).
    update public.projects set shoot_date = (p ->> 'date')::date,
      status = case when p ->> 'by' = 'client' and status = 'confirmed' then 'requested' else status end,
      slot = coalesce(case p ->> 'slot' when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
        when 'full_day' then 'Full day' end, slot),
      meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{booking}', coalesce(meta -> 'booking', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object('slot', nullif(p ->> 'slot', ''), 'start_time', nullif(p ->> 'start_time', '')))),
      half_days_late = half_days_late + v_hd,
      cancel_fee = case when v_fee > 0 then coalesce(cancel_fee, 0) + v_fee else cancel_fee end
      where id = pr.id;
    insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
      values (pr.id, 'status', pr.status, case when p ->> 'by' = 'client' and pr.status = 'confirmed' then 'requested'
        else pr.status end, 'Rescheduled to ' || (p ->> 'date')
        || coalesce(' · fee ' || v_cur || ' ' || case when v_fee > 0 then to_char(v_fee, 'FM999,999,990.00') end, ''),
        case when p ->> 'by' = 'client' then coalesce(nullif(p ->> 'by_name', ''), 'Client') else 'Milkywayy' end,
        coalesce(p ->> 'by', 'admin') <> 'client');
  end if;
  -- Charged after the change (a cancellation clears the project's unbilled items).
  if v_owed > 0 and pr.account_id is not null then
    if v_terms = 'month_end' then
      insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
        delivered_month, service_date, price_basis, logged, included)
      values (pr.id, pr.account_id, left((case v_kind when 'cancel' then 'Late cancellation fee' else 'Late reschedule fee' end)
        || ' · ' || pr.ref, 200), 1, v_owed, v_cur, 'cancel_fee', private.dubai_month(now()),
        (now() at time zone 'Asia/Dubai')::date, 'manual', true, false);
    else
      v_fee_inv := private.stage_invoice(pr.id, 'fee', jsonb_build_array(jsonb_build_object('description',
        (case v_kind when 'cancel' then 'Late cancellation fee' else 'Late reschedule fee' end) || ' · ' || pr.ref,
        'qty', 1, 'unit_price', v_owed)), p_actor);
    end if;
    v_charged := v_owed;
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', pr.account_id, pr.ref || ': ' || v_kind || ' (' || v_reason || '), fee ' || v_fee
      || case when v_waived then ' waived' else '' end || ', ' || jsonb_array_length(v_refunds) || ' refund(s)');
  return jsonb_build_object('refunds', v_refunds, 'charged', v_charged, 'fee_invoice', v_fee_inv,
    'account', pr.account_id, 'ref', pr.ref, 'title', pr.title,
    'recipients', private.event_recipients(pr.id, 'status_update'));
end $$;

-- After the server asked Stripe: the refund's id and state (succeeded → done, else pending/failed).
create or replace function public.portal_admin_refund_result(p_secret text, p_actor text, p_refund uuid,
  p_stripe_id text, p_status text, p_error text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.refunds%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into r from public.refunds where id = p_refund for update;
  if r.id is null then raise exception 'no such refund' using errcode = '22023'; end if;
  if r.status = 'done' then return jsonb_build_object('already', true); end if;
  update public.refunds set stripe_refund_id = coalesce(p_stripe_id, stripe_refund_id),
    status = case p_status when 'succeeded' then 'done' when 'failed' then 'failed' when 'canceled' then 'failed' else 'pending' end,
    error = left(p_error, 300), done_at = case when p_status = 'succeeded' then now() end,
    done_by = case when p_status = 'succeeded' then p_actor end
    where id = r.id;
  if p_status = 'succeeded' then
    update public.invoices set refunded = refunded + r.amount where id = r.invoice_id;
  end if;
  return jsonb_build_object('already', false, 'status', p_status);
end $$;

-- The Stripe webhook knows the Stripe refund id (or our id in its metadata).
create or replace function public.portal_admin_refund_by_stripe(p_secret text, p_actor text, p_stripe_id text,
  p_refund uuid, p_status text, p_error text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select id into v from public.refunds where (p_refund is not null and id = p_refund) or stripe_refund_id = p_stripe_id
    order by (id = p_refund) desc nulls last limit 1;
  if v is null then return jsonb_build_object('found', false); end if;
  return public.portal_admin_refund_result(p_secret, p_actor, v, p_stripe_id, p_status, p_error)
    || jsonb_build_object('found', true);
end $$;

-- "Refund due" tasks and the rest, for the admin.
create or replace function public.portal_admin_refunds(p_secret text, p_actor text, p_status text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('account', a.name, 'ref', p.ref,
      'title', p.title, 'number', i.number, 'stripe_session', i.stripe_session_id) order by r.created_at desc)
    from public.refunds r join public.accounts a on a.id = r.account_id
    left join public.projects p on p.id = r.project_id left join public.invoices i on i.id = r.invoice_id
    where p_status is null or r.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_refund_done(p_secret text, p_actor text, p_refund uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refunds%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into r from public.refunds where id = p_refund for update;
  if r.id is null or r.status = 'done' then raise exception 'nothing to mark' using errcode = '22023'; end if;
  update public.refunds set status = 'done', done_at = now(), done_by = p_actor where id = r.id;
  update public.invoices set refunded = refunded + r.amount where id = r.invoice_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', r.account_id, 'Refund ' || r.currency || ' ' || r.amount || ' marked done');
end $$;

-- Billing → clients: what each owes now (unpaid published invoices) and refunds due.
create or replace function public.portal_admin_payment_status(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_object_agg(a.id::text, jsonb_build_object('terms', a.payment_terms,
      'unpaid', coalesce((select sum(i.amount) from public.invoices i where i.account_id = a.id and i.status in ('due', 'overdue')), 0),
      'overdue', coalesce((select sum(i.amount) from public.invoices i where i.account_id = a.id
        and i.status in ('due', 'overdue') and i.due_on < (now() at time zone 'Asia/Dubai')::date), 0),
      'submitted', (select count(*) from public.invoices i where i.account_id = a.id and i.payment_state = 'submitted'
        and i.status in ('due', 'overdue')),
      'refunds_due', coalesce((select sum(r.amount) from public.refunds r where r.account_id = a.id and r.status = 'due'), 0)))
    from public.accounts a), '{}'::jsonb);
end $$;


-- ---------- booking summary: the term, VAT, and (value packages) what's left this month ----------
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
      'half_days_left', greatest((v_pm -> 'value' ->> 'half_day_cap')::numeric - (v_pm -> 'value' ->> 'half_days_used')::numeric, 0)) end);
end $$;

-- Paying an invoice: booking invoices (full, deposit, balance, fee) can always go by card; other
-- invoices only for clients who pay online.
create or replace function public.my_invoice_for_payment(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  select * into i from public.invoices where id = p_invoice and status in ('due', 'paid', 'overdue');
  if i.id is null or coalesce(private.account_role(i.account_id), '') not in ('owner', 'admin') then
    raise exception 'not your invoice' using errcode = '42501';
  end if;
  return jsonb_build_object('id', i.id, 'account_id', i.account_id, 'number', i.number,
    'amount', i.amount, 'currency', i.currency, 'unpaid', i.status in ('due', 'overdue'),
    'stage', i.stage, 'project_id', i.project_id,
    'pay_online', private.pays_online(i.account_id) or i.stage is not null);
end $$;

-- Stripe paid: as before, and says which project (a booking invoice) so the server can email
-- "Booking confirmed".
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
    'project_id', case when i.stage in ('full', 'deposit') then i.project_id end,
    'recipients', private.billing_recipients(i.account_id, 'payment_received'));
end $$;

-- The client page's Payments block: the term, card payments, the value package (and templates').
create or replace function public.portal_admin_client_payments(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  if a.id is null then raise exception 'no such client' using errcode = '22023'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into k from public.packages where id = pl.package_id;
  return jsonb_build_object('payment_terms', a.payment_terms, 'booking_terms', private.booking_terms(p_account),
    'pay_online', private.pays_online(p_account), 'pay_online_set', a.pay_online, 'currency', a.currency,
    'package', case when pl.mode = 'package' and k.id is not null then jsonb_build_object('id', k.id, 'name', k.name,
      'price', k.monthly_price, 'allowance', k.allowance, 'half_day_cap', k.half_day_cap) end,
    'templates', coalesce((select jsonb_object_agg(t.id::text, jsonb_build_object('allowance', t.allowance,
        'half_day_cap', t.half_day_cap)) from public.packages t where t.account_id is null), '{}'::jsonb));
end $$;

-- The invoice queue: as before, with the booking stage (Billing's Payment column).
create or replace function public.portal_admin_invoice_queue(p_secret text, p_actor text, p_status text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.rank, x.publish_on nulls first, x.created_at desc) from (
    select i.id, i.account_id, a.name as account_name, i.number, i.category, i.period_start, i.period_end,
      i.amount, i.currency, i.status, i.publish_on, i.issued_on, i.due_on, i.advance, i.project_id,
      i.created_at, i.basis_total, i.payment_state, i.stage,
      case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end as shown_status,
      case when i.status = 'draft' and i.category in ('budget', 'fixed', 'payg') and not i.advance then
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

-- Grants: client functions to signed-in users; admin ones are gated by the secret (callable by anon,
-- as the other portal_admin_* functions).
revoke all on function public.my_payment_terms(uuid), public.my_project_payment(uuid), public.my_unpaid_count(uuid),
  public.accept_booking_terms(uuid, text), public.my_billing_payments(uuid) from public, anon;
grant execute on function public.my_payment_terms(uuid), public.my_project_payment(uuid), public.my_unpaid_count(uuid),
  public.accept_booking_terms(uuid, text), public.my_billing_payments(uuid) to authenticated;
