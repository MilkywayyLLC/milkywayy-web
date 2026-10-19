-- Client portal, Phase 12 (CLIENT_PORTAL_GUIDE §5.5, §7.3, §9; owner decisions 3 Oct 2026):
-- invoices, rate card with per-client rates, line items feeding "this month so far", private
-- packages and account plans with a usage meter, and package suggestions (off by default).
--
-- Rules, in the database:
-- * Only an account's Owner and Admins read anything with a price: invoices, line items, plans,
--   packages, rates. Members never do (they don't see Billing at all).
-- * Every change is Milkywayy's, through the portal_admin_* functions (PORTAL_ADMIN_SECRET +
--   who acted, logged). Invoice PDFs sit in the private R2 bucket; the server signs a short-lived
--   link after the client can read the invoice row.
-- * An invoice is Overdue the day after its due date: clients see it at once (the app reads the
--   date) and the daily housekeeping records it.
-- Additive.

-- ---------- per-client switches ----------
alter table public.accounts add column hide_suggestions boolean not null default false;

-- ---------- line items: what kind of thing, and the month it was delivered ----------
alter table public.line_items add column kind text check (length(kind) <= 40);
create index line_items_account_month_kind_idx on public.line_items (account_id, delivered_month, kind);

-- ---------- rate card (global) and per-client rates ----------
create table public.rate_card (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  unit text not null check (length(btrim(unit)) between 1 and 40),
  amount_aed numeric(12, 2) check (amount_aed >= 0),
  amount_usd numeric(12, 2) check (amount_usd >= 0),
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create table public.rate_overrides (
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null references public.rate_card (key) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, key)
);
-- Starting rates from the website's post-production prices (USD) and AED at ~3.67. The owner
-- sets the real ones in Admin → Billing → Rate card.
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort) values
  ('shoot', 'Property shoot', 'shoot', null, null, 10),
  ('shoot_day', 'Shoot day', 'day', null, null, 20),
  ('photo', 'Photo edit (HDR)', 'photo', 3, 0.80, 30),
  ('reel', 'Short-form reel', 'reel', 185, 50, 40),
  ('long_form', 'Long-form video', 'video', 550, 150, 50),
  ('avatar_video', 'AI avatar video', 'video', null, null, 60),
  ('avatar_setup', 'AI avatar setup', 'avatar', null, null, 70)
on conflict (key) do nothing;

-- ---------- invoices ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  number text not null check (length(btrim(number)) between 1 and 40),
  issued_on date not null,
  due_on date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('AED', 'USD')),
  status text not null default 'due' check (status in ('due', 'paid', 'overdue')),
  paid_at timestamptz,
  pdf_key text check (length(pdf_key) <= 300),
  note text check (length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now(),
  unique (account_id, number),
  check (due_on >= issued_on)
);
create index invoices_account_idx on public.invoices (account_id, issued_on desc);
create index invoices_due_idx on public.invoices (due_on) where status = 'due';

-- ---------- packages, plans, suggestions ----------
-- A package is private to one client by default (account_id set): Akash prices individually.
-- Packages without an account are templates (e.g. for suggestions); `visible` is for later.
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  monthly_price numeric(12, 2) not null check (monthly_price >= 0),
  currency text not null check (currency in ('AED', 'USD')),
  -- [{"key": "reel", "label": "Reels", "qty": 10}, …] (keys match line item kinds)
  inclusions jsonb not null default '[]' check (jsonb_typeof(inclusions) = 'array'),
  -- [{"key": "reel", "label": "Extra reel", "amount": 200}, …]
  overage jsonb not null default '[]' check (jsonb_typeof(overage) = 'array'),
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packages_account_idx on public.packages (account_id);

create table public.account_plans (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  mode text not null default 'payg' check (mode in ('payg', 'package')),
  package_id uuid references public.packages (id) on delete set null,
  started_on date,
  renews_on date,
  updated_at timestamptz not null default now(),
  check (mode = 'payg' or package_id is not null)
);
create index account_plans_package_idx on public.account_plans (package_id);

create table public.suggestion_rules (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  lookback_months int not null default 3 check (lookback_months between 1 and 12),
  threshold_pct int not null default 100 check (threshold_pct between 10 and 500),
  min_saving numeric(12, 2) not null default 0 check (min_saving >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index suggestion_rules_package_idx on public.suggestion_rules (package_id);

create table public.billing_settings (
  id boolean primary key default true check (id),
  suggestions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (true) on conflict do nothing;

-- ---------- privileges and RLS: Owner/Admins only; Members nothing ----------
revoke all on public.rate_card, public.rate_overrides, public.invoices, public.packages,
  public.account_plans, public.suggestion_rules, public.billing_settings from anon, authenticated;
grant select on public.invoices, public.packages, public.account_plans to authenticated;
alter table public.rate_card enable row level security;
alter table public.rate_overrides enable row level security;
alter table public.invoices enable row level security;
alter table public.packages enable row level security;
alter table public.account_plans enable row level security;
alter table public.suggestion_rules enable row level security;
alter table public.billing_settings enable row level security;
create policy "managers read invoices" on public.invoices
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));
create policy "managers read their plan" on public.account_plans
  for select to authenticated using (account_id in (select private.my_admin_account_ids()));
create policy "managers read their package" on public.packages
  for select to authenticated using (id in (select package_id from public.account_plans
    where account_id in (select private.my_admin_account_ids())));
-- rate_card, rate_overrides, suggestion_rules, billing_settings: no client access (functions only).

-- ---------- delivered line items get their month ----------
create or replace function private.dubai_month(p_at timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', p_at at time zone 'Asia/Dubai')::date
$$;

create or replace function private.stamp_delivered_items() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.delivered_at is not null and (old.delivered_at is null or old.delivered_at is distinct from new.delivered_at) then
    update public.line_items set delivered_month = private.dubai_month(new.delivered_at)
      where project_id = new.id and delivered_month is null;
  end if;
  return new;
end $$;
create trigger projects_stamp_delivered_items after update of delivered_at on public.projects
  for each row execute function private.stamp_delivered_items();

-- Shoot line items (website bookings, admin-created shoots) are of kind "shoot".
create or replace function private.line_item_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind is null and exists (select 1 from public.projects p where p.id = new.project_id and p.type = 'shoot') then
    new.kind := 'shoot';
  end if;
  return new;
end $$;
create trigger line_items_kind before insert on public.line_items
  for each row execute function private.line_item_kind();
update public.line_items li set kind = 'shoot' from public.projects p
  where p.id = li.project_id and p.type = 'shoot' and li.kind is null;
update public.line_items li set delivered_month = private.dubai_month(p.delivered_at) from public.projects p
  where p.id = li.project_id and p.delivered_at is not null and li.delivered_month is null;
revoke all on function private.line_item_kind() from public, anon, authenticated;

-- ---------- helpers ----------
-- A client's rate for a key in their currency: their override, else the rate card.
create or replace function private.rate_for(p_account uuid, p_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.amount from public.rate_overrides o where o.account_id = p_account and o.key = p_key),
    (select case a.currency when 'USD' then r.amount_usd else r.amount_aed end
       from public.rate_card r, public.accounts a where r.key = p_key and a.id = p_account))
$$;

-- The current plan period: (renews_on − 1 month, renews_on], rolled forward month by month.
create or replace function private.plan_period(p_renews date) returns table (starts date, ends date)
language plpgsql stable set search_path = '' as $$
declare v_end date := p_renews; v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if v_end is null then
    starts := date_trunc('month', v_today)::date;
    ends := (date_trunc('month', v_today) + interval '1 month')::date;
    return next;
    return;
  end if;
  while v_end <= v_today loop
    v_end := (v_end + interval '1 month')::date;
  end loop;
  while (v_end - interval '1 month')::date > v_today loop
    v_end := (v_end - interval '1 month')::date;
  end loop;
  starts := (v_end - interval '1 month')::date;
  ends := v_end;
  return next;
end $$;

-- Usage of each inclusion in the current period: delivered line items of that kind.
create or replace function private.plan_usage(p_account uuid, p_inclusions jsonb, p_starts date, p_ends date)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', i ->> 'key', 'label', i ->> 'label', 'qty', (i ->> 'qty')::numeric,
      'used', coalesce((select sum(li.qty) from public.line_items li
        join public.projects p on p.id = li.project_id
        where li.account_id = p_account and li.kind = i ->> 'key'
          and p.delivered_at is not null
          and (p.delivered_at at time zone 'Asia/Dubai')::date >= p_starts
          and (p.delivered_at at time zone 'Asia/Dubai')::date < p_ends), 0))), '[]'::jsonb)
  from jsonb_array_elements(p_inclusions) i
$$;

-- "Pay as you go: this month so far": delivered line items this month (Dubai).
create or replace function private.payg_month(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'month', private.dubai_month(now()),
    'total', coalesce(sum(li.qty * li.unit_price), 0),
    'items', coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
        'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref, 'title', p.title)
        order by p.delivered_at) filter (where li.id is not null), '[]'::jsonb))
  from public.line_items li
  join public.projects p on p.id = li.project_id
  where li.account_id = p_account and li.delivered_month = private.dubai_month(now())
$$;

-- A package suggestion for a pay-as-you-go client, or null: only when switched on globally, not
-- hidden for this client, and a rule says so (average monthly spend over the last N full months
-- at least Y% of the package price, and a saving above Z).
create or replace function private.suggestion_for(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; r record; v_avg numeric; v_best jsonb;
begin
  if not coalesce((select suggestions_enabled from public.billing_settings where id), false) then return null; end if;
  select * into a from public.accounts where id = p_account;
  if a.id is null or a.hide_suggestions then return null; end if;
  if exists (select 1 from public.account_plans where account_id = p_account and mode = 'package') then return null; end if;
  for r in select s.*, k.name, k.monthly_price, k.currency
    from public.suggestion_rules s join public.packages k on k.id = s.package_id
    where s.active and k.currency = a.currency and (k.account_id is null or k.account_id = p_account)
  loop
    select coalesce(sum(li.qty * li.unit_price), 0) / r.lookback_months into v_avg
    from public.line_items li
    where li.account_id = p_account
      and li.delivered_month >= (private.dubai_month(now()) - make_interval(months => r.lookback_months))::date
      and li.delivered_month < private.dubai_month(now());
    if v_avg >= r.monthly_price * r.threshold_pct / 100.0 and v_avg - r.monthly_price > r.min_saving
      and (v_best is null or v_avg - r.monthly_price > (v_best ->> 'saving')::numeric) then
      v_best := jsonb_build_object('package', r.name, 'price', r.monthly_price, 'currency', r.currency,
        'average', round(v_avg, 2), 'saving', round(v_avg - r.monthly_price, 2));
    end if;
  end loop;
  return v_best;
end $$;

-- Who gets a billing email: Owner/Admins who want it, plus the account's billing copies.
create or replace function private.billing_recipients(p_account uuid, p_event text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', email, 'name', name)), '[]'::jsonb)
  from (
    select lower(coalesce(pr.email, u.email)) as email, coalesce(pr.full_name, '') as name
    from public.account_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.user_id = m.user_id
    where m.account_id = p_account and m.role in ('owner', 'admin')
      and coalesce(pr.email, u.email) is not null
      and coalesce((pr.notification_prefs -> p_event ->> 'email')::boolean, true)
    union
    select lower(x), '' from public.accounts a,
      jsonb_array_elements_text(coalesce(a.notify_cc -> 'billing', '[]'::jsonb)) x
    where a.id = p_account
  ) r
$$;

revoke all on function private.dubai_month(timestamptz), private.stamp_delivered_items(),
  private.rate_for(uuid, text), private.plan_period(date), private.plan_usage(uuid, jsonb, date, date),
  private.payg_month(uuid), private.suggestion_for(uuid), private.billing_recipients(uuid, text)
  from public, anon, authenticated;

-- ---------- the client's Billing page: one call, Owner/Admins only ----------
create or replace function public.my_billing(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; pl public.account_plans%rowtype; k public.packages%rowtype;
  v_start date; v_end date;
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin') then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  select * into a from public.accounts where id = p_account;
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode = 'package' then
    select * into k from public.packages where id = pl.package_id;
    select starts, ends into v_start, v_end from private.plan_period(pl.renews_on);
  end if;
  return jsonb_build_object(
    'currency', a.currency,
    'mode', coalesce(pl.mode, 'payg'),
    'plan', case when pl.mode = 'package' and k.id is not null then jsonb_build_object(
      'name', k.name, 'price', k.monthly_price, 'currency', k.currency,
      'renews_on', v_end, 'period_start', v_start, 'overage', k.overage,
      'usage', private.plan_usage(p_account, k.inclusions, v_start, v_end)) end,
    'payg', private.payg_month(p_account),
    'suggestion', private.suggestion_for(p_account)
  );
end $$;
revoke all on function public.my_billing(uuid) from public, anon;
grant execute on function public.my_billing(uuid) to authenticated;

-- ---------- the admin ----------
create or replace function public.portal_admin_invoices(p_secret text, p_actor text, p_account uuid default null,
  p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.issued_on desc, x.number desc) from (
    select i.*, a.name as account_name,
      case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end as shown_status
    from public.invoices i join public.accounts a on a.id = i.account_id
    where (p_account is null or i.account_id = p_account)
      and (p_status is null or (case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end) = p_status)
    limit 500) x), '[]'::jsonb);
end $$;

-- New invoice (the PDF already uploaded to R2 under invoices/<account>/). Returns who to email.
create or replace function public.portal_admin_create_invoice(p_secret text, p_actor text, p_account uuid,
  p_number text, p_issued date, p_due date, p_amount numeric, p_currency text, p_status text,
  p_pdf_key text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_pdf_key is not null and (p_pdf_key not like 'invoices/' || p_account || '/%' or p_pdf_key like '%..%') then
    raise exception 'not a PDF for this client' using errcode = '22023';
  end if;
  insert into public.invoices (account_id, number, issued_on, due_on, amount, currency, status, paid_at, pdf_key, note, created_by)
  values (p_account, btrim(p_number), p_issued, p_due, p_amount, p_currency, p_status,
    case when p_status = 'paid' then now() end, p_pdf_key, nullif(btrim(coalesce(p_note, '')), ''), p_actor)
  returning id into v;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', p_account, 'Invoice ' || btrim(p_number) || ' · ' || p_currency || ' ' || p_amount);
  return jsonb_build_object('id', v, 'recipients', private.billing_recipients(p_account, 'invoice_issued'));
end $$;

-- Status change. Marking it Paid returns who gets "Payment received".
create or replace function public.portal_admin_set_invoice_status(p_secret text, p_actor text, p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  update public.invoices set status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end
    where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ': ' || i.status || ' → ' || p_status);
  return jsonb_build_object('account', i.account_id,
    'recipients', case when p_status = 'paid' and i.status <> 'paid'
      then private.billing_recipients(i.account_id, 'payment_received') else '[]'::jsonb end);
end $$;

create or replace function public.portal_admin_delete_invoice(p_secret text, p_actor text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  delete from public.invoices where id = p_id returning * into i;
  if i.id is not null then
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ' deleted');
  end if;
  return i.pdf_key;
end $$;

-- Rate card (whole list) and a client's own rates.
create or replace function public.portal_admin_rate_card(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.sort, r.key) from public.rate_card r), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_save_rate(p_secret text, p_actor text, p_key text, p_label text,
  p_unit text, p_aed numeric, p_usd numeric, p_sort int default 0) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into public.rate_card (key, label, unit, amount_aed, amount_usd, sort)
    values (p_key, btrim(p_label), btrim(p_unit), p_aed, p_usd, p_sort)
  on conflict (key) do update set label = excluded.label, unit = excluded.unit,
    amount_aed = excluded.amount_aed, amount_usd = excluded.amount_usd, sort = excluded.sort, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', null, 'Rate card: ' || p_key);
end $$;

create or replace function public.portal_admin_set_override(p_secret text, p_actor text, p_account uuid,
  p_key text, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_amount is null then
    delete from public.rate_overrides where account_id = p_account and key = p_key;
  else
    insert into public.rate_overrides (account_id, key, amount) values (p_account, p_key, p_amount)
    on conflict (account_id, key) do update set amount = excluded.amount, updated_at = now();
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Rate ' || p_key || ': ' || coalesce(p_amount::text, 'card rate'));
end $$;

-- Packages.
create or replace function public.portal_admin_packages(p_secret text, p_actor text, p_account uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.account_name nulls first, x.name) from (
    select k.*, a.name as account_name,
      (select count(*) from public.account_plans pl where pl.package_id = k.id and pl.mode = 'package') as clients
    from public.packages k left join public.accounts a on a.id = k.account_id
    where p_account is null or k.account_id = p_account or k.account_id is null) x), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_save_package(p_secret text, p_actor text, p_id uuid,
  p_account uuid, p_name text, p_price numeric, p_currency text, p_inclusions jsonb, p_overage jsonb,
  p_visible boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if exists (select 1 from jsonb_array_elements(coalesce(p_inclusions, '[]')) i
      where coalesce(i ->> 'key', '') = '' or (i ->> 'qty') is null or (i ->> 'qty')::numeric <= 0) then
    raise exception 'each inclusion needs a kind and a quantity' using errcode = '22023';
  end if;
  if v is null then
    insert into public.packages (account_id, name, monthly_price, currency, inclusions, overage, visible)
    values (p_account, btrim(p_name), p_price, p_currency, coalesce(p_inclusions, '[]'), coalesce(p_overage, '[]'), coalesce(p_visible, false))
    returning id into v;
  else
    update public.packages set account_id = p_account, name = btrim(p_name), monthly_price = p_price,
      currency = p_currency, inclusions = coalesce(p_inclusions, '[]'), overage = coalesce(p_overage, '[]'),
      visible = coalesce(p_visible, false), updated_at = now()
    where id = v;
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Package ' || btrim(p_name) || ' saved');
  return v;
end $$;

create or replace function public.portal_admin_delete_package(p_secret text, p_actor text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if exists (select 1 from public.account_plans where package_id = p_id and mode = 'package') then
    raise exception 'a client is on this package' using errcode = '22023';
  end if;
  delete from public.packages where id = p_id;
end $$;

-- A client's plan: pay as you go, or a package with start and renewal dates.
create or replace function public.portal_admin_set_plan(p_secret text, p_actor text, p_account uuid,
  p_mode text, p_package uuid, p_started date, p_renews date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_mode = 'package' and (p_package is null or p_renews is null) then
    raise exception 'choose the package and its renewal date' using errcode = '22023';
  end if;
  insert into public.account_plans (account_id, mode, package_id, started_on, renews_on)
    values (p_account, p_mode, case when p_mode = 'package' then p_package end, p_started, p_renews)
  on conflict (account_id) do update set mode = excluded.mode, package_id = excluded.package_id,
    started_on = excluded.started_on, renews_on = excluded.renews_on, updated_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Plan: ' || p_mode);
end $$;

-- Suggestions: the global switch, the rules, and a client's hide switch.
create or replace function public.portal_admin_suggestions(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return jsonb_build_object(
    'enabled', (select suggestions_enabled from public.billing_settings where id),
    'rules', coalesce((select jsonb_agg(row_to_json(x) order by x.created_at) from (
      select s.*, k.name as package_name, k.monthly_price, k.currency
      from public.suggestion_rules s join public.packages k on k.id = s.package_id) x), '[]'::jsonb));
end $$;

create or replace function public.portal_admin_set_suggestions(p_secret text, p_actor text, p_enabled boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.billing_settings set suggestions_enabled = p_enabled, updated_at = now() where id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', null, 'Package suggestions ' || case when p_enabled then 'on' else 'off' end);
end $$;

create or replace function public.portal_admin_save_rule(p_secret text, p_actor text, p_id uuid, p_package uuid,
  p_lookback int, p_threshold int, p_min_saving numeric, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if v is null then
    insert into public.suggestion_rules (package_id, lookback_months, threshold_pct, min_saving, active)
    values (p_package, p_lookback, p_threshold, p_min_saving, p_active) returning id into v;
  else
    update public.suggestion_rules set package_id = p_package, lookback_months = p_lookback,
      threshold_pct = p_threshold, min_saving = p_min_saving, active = p_active where id = v;
  end if;
  return v;
end $$;

create or replace function public.portal_admin_delete_rule(p_secret text, p_actor text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  delete from public.suggestion_rules where id = p_id;
end $$;

create or replace function public.portal_admin_hide_suggestions(p_secret text, p_actor text, p_account uuid,
  p_hide boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set hide_suggestions = p_hide where id = p_account;
end $$;

-- A client's billing on their admin page: plan, usage, this month, rates, invoices, suggestion.
create or replace function public.portal_admin_client_billing(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; k public.packages%rowtype; v_start date; v_end date; a public.accounts%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into a from public.accounts where id = p_account;
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode = 'package' then
    select * into k from public.packages where id = pl.package_id;
    select starts, ends into v_start, v_end from private.plan_period(pl.renews_on);
  end if;
  return jsonb_build_object(
    'currency', a.currency, 'hide_suggestions', a.hide_suggestions,
    'plan', jsonb_build_object('mode', coalesce(pl.mode, 'payg'), 'package_id', pl.package_id,
      'started_on', pl.started_on, 'renews_on', pl.renews_on,
      'package', case when k.id is not null then jsonb_build_object('name', k.name, 'price', k.monthly_price,
        'currency', k.currency, 'period_end', v_end,
        'usage', private.plan_usage(p_account, k.inclusions, v_start, v_end)) end),
    'payg', private.payg_month(p_account),
    'suggestion', private.suggestion_for(p_account),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'label', r.label, 'unit', r.unit,
        'card', case a.currency when 'USD' then r.amount_usd else r.amount_aed end,
        'override', (select o.amount from public.rate_overrides o where o.account_id = p_account and o.key = r.key))
        order by r.sort) from public.rate_card r), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'price', x.monthly_price,
        'currency', x.currency, 'private', x.account_id is not null) order by x.account_id nulls last, x.name)
        from public.packages x where x.account_id = p_account or x.account_id is null), '[]'::jsonb)
  );
end $$;

-- Line items on a project: the admin adds what was delivered (kind + qty; price from the client's
-- rate unless given). Items on a delivered project count for that month at once.
create or replace function public.portal_admin_add_line_item(p_secret text, p_actor text, p_project uuid,
  p_kind text, p_description text, p_qty numeric, p_unit_price numeric default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; a public.accounts%rowtype; v uuid; v_price numeric;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  select * into a from public.accounts where id = p.account_id;
  v_price := coalesce(p_unit_price, private.rate_for(p.account_id, p_kind));
  if v_price is null then
    raise exception 'no rate for that kind: enter a price' using errcode = '22023';
  end if;
  insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind, delivered_month)
  values (p_project, p.account_id,
    coalesce(nullif(btrim(coalesce(p_description, '')), ''), (select label from public.rate_card where key = p_kind), p_kind),
    p_qty, v_price, coalesce(a.currency, 'AED'), p_kind,
    case when p.delivered_at is not null then private.dubai_month(p.delivered_at) end)
  returning id into v;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': line item ' || p_qty || ' × ' || p_kind);
  return v;
end $$;

create or replace function public.portal_admin_remove_line_item(p_secret text, p_actor text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  delete from public.line_items where id = p_id and billed_invoice_id is null;
end $$;

-- Billing email log (notification_log without a project).
create or replace function public.portal_admin_log_billing_notification(p_secret text, p_actor text,
  p_account uuid, p_template text, p_to text, p_status text, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  insert into public.notification_log (account_id, channel, template, to_address, provider_id, status, error, actor)
  values (p_account, 'email', p_template, p_to, p_provider_id, p_status, left(p_error, 500), p_actor);
end $$;

-- Housekeeping: as before, plus Due invoices past their date become Overdue.
create or replace function public.portal_admin_mark_overdue(p_secret text, p_actor text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.invoices set status = 'overdue'
    where status = 'due' and due_on < (now() at time zone 'Asia/Dubai')::date;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function
  public.portal_admin_invoices(text, text, uuid, text),
  public.portal_admin_create_invoice(text, text, uuid, text, date, date, numeric, text, text, text, text),
  public.portal_admin_set_invoice_status(text, text, uuid, text),
  public.portal_admin_delete_invoice(text, text, uuid),
  public.portal_admin_rate_card(text, text),
  public.portal_admin_save_rate(text, text, text, text, text, numeric, numeric, int),
  public.portal_admin_set_override(text, text, uuid, text, numeric),
  public.portal_admin_packages(text, text, uuid),
  public.portal_admin_save_package(text, text, uuid, uuid, text, numeric, text, jsonb, jsonb, boolean),
  public.portal_admin_delete_package(text, text, uuid),
  public.portal_admin_set_plan(text, text, uuid, text, uuid, date, date),
  public.portal_admin_suggestions(text, text),
  public.portal_admin_set_suggestions(text, text, boolean),
  public.portal_admin_save_rule(text, text, uuid, uuid, int, int, numeric, boolean),
  public.portal_admin_delete_rule(text, text, uuid),
  public.portal_admin_hide_suggestions(text, text, uuid, boolean),
  public.portal_admin_client_billing(text, text, uuid),
  public.portal_admin_add_line_item(text, text, uuid, text, text, numeric, numeric),
  public.portal_admin_remove_line_item(text, text, uuid),
  public.portal_admin_log_billing_notification(text, text, uuid, text, text, text, text, text),
  public.portal_admin_mark_overdue(text, text)
  from public;
grant execute on function
  public.portal_admin_invoices(text, text, uuid, text),
  public.portal_admin_create_invoice(text, text, uuid, text, date, date, numeric, text, text, text, text),
  public.portal_admin_set_invoice_status(text, text, uuid, text),
  public.portal_admin_delete_invoice(text, text, uuid),
  public.portal_admin_rate_card(text, text),
  public.portal_admin_save_rate(text, text, text, text, text, numeric, numeric, int),
  public.portal_admin_set_override(text, text, uuid, text, numeric),
  public.portal_admin_packages(text, text, uuid),
  public.portal_admin_save_package(text, text, uuid, uuid, text, numeric, text, jsonb, jsonb, boolean),
  public.portal_admin_delete_package(text, text, uuid),
  public.portal_admin_set_plan(text, text, uuid, text, uuid, date, date),
  public.portal_admin_suggestions(text, text),
  public.portal_admin_set_suggestions(text, text, boolean),
  public.portal_admin_save_rule(text, text, uuid, uuid, int, int, numeric, boolean),
  public.portal_admin_delete_rule(text, text, uuid),
  public.portal_admin_hide_suggestions(text, text, uuid, boolean),
  public.portal_admin_client_billing(text, text, uuid),
  public.portal_admin_add_line_item(text, text, uuid, text, text, numeric, numeric),
  public.portal_admin_remove_line_item(text, text, uuid),
  public.portal_admin_log_billing_notification(text, text, uuid, text, text, text, text, text),
  public.portal_admin_mark_overdue(text, text)
  to anon, authenticated;
