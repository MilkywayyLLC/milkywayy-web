-- Retainer budgets, shoot booking, deliverables, inquiries and invoice approval (owner, 10 Oct 2026).
-- Extends the billing and project engines; nothing is rebuilt.
--
-- * Budget packages: a monthly amount in the client's currency (no credits). Amount and the
--   client's own rates have a dated history (changes apply from a chosen date); every logged item
--   keeps the price it was logged at, so later price or rate changes never reprice it.
-- * "Bill package in advance" per client; no rollover. Per-client "Show budget and activity".
-- * Clients on a package book shoots in the portal (a "Requested" shoot project with location
--   and services); Milkywayy logs what was shot (line items at frozen prices, with a reason for
--   any manual price) and keeps a list of deliverables, each with its own status and two
--   revision rounds.
-- * Inquiries: a client thread with an optional related shoot; replies may carry a private link.
-- * Invoices are drafts first: month-end drafts on the 25th, per-project drafts on delivery;
--   Milkywayy edits and approves; approved month-end invoices publish on the last day of the
--   month (advance package invoices on the 1st), one-offs on approval. Clients never see drafts.
-- Owner/Admins see money; Members never do. Additive except replaced functions and widened checks.

-- ---------- plans: a third kind; per-client switches ----------
alter table public.account_plans drop constraint account_plans_mode_check;
alter table public.account_plans add constraint account_plans_mode_check
  check (mode in ('payg', 'package', 'budget'));
alter table public.account_plans drop constraint account_plans_check;
alter table public.account_plans add constraint account_plans_check
  check (mode <> 'package' or package_id is not null);
alter table public.account_plans add column bill_in_advance boolean not null default false;

alter table public.accounts
  -- null = automatic: on for budget packages, off for everyone else.
  add column show_budget boolean,
  -- Pay-as-you-go invoicing: one invoice per delivered project, or one at month end.
  add column payg_invoicing text not null default 'per_project'
    check (payg_invoicing in ('per_project', 'month_end'));

alter table public.statements drop constraint statements_mode_check;
alter table public.statements add constraint statements_mode_check check (mode in ('payg', 'package', 'budget'));

-- ---------- dated history: budget amounts and client rates ----------
create table public.budget_amounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  effective_from date not null check (extract(day from effective_from) = 1),
  created_by text,
  created_at timestamptz not null default now(),
  unique (account_id, effective_from)
);
create table public.client_rates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null references public.rate_card (key) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  effective_from date not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (account_id, key, effective_from)
);
create index client_rates_lookup_idx on public.client_rates (account_id, key, effective_from desc);
revoke all on public.budget_amounts, public.client_rates from anon, authenticated;
alter table public.budget_amounts enable row level security;
alter table public.client_rates enable row level security;
-- No client access: the Billing page gets what it may show through my_billing().

-- A client's rate for a key on a date: the dated rate in force, else their standing override,
-- else the rate card in their currency.
create or replace function private.rate_on(p_account uuid, p_key text, p_date date) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.amount from public.client_rates r where r.account_id = p_account and r.key = p_key
       and r.effective_from <= p_date order by r.effective_from desc limit 1),
    (select o.amount from public.rate_overrides o where o.account_id = p_account and o.key = p_key),
    (select case a.currency when 'USD' then c.amount_usd else c.amount_aed end
       from public.rate_card c, public.accounts a where c.key = p_key and a.id = p_account))
$$;
-- Every existing caller (overage, offers) now sees the dated rate in force today.
create or replace function private.rate_for(p_account uuid, p_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select private.rate_on(p_account, p_key, (now() at time zone 'Asia/Dubai')::date)
$$;

-- The budget for a calendar month, or null (no budget package then).
create or replace function private.budget_for(p_account uuid, p_month date) returns numeric
language sql stable security definer set search_path = '' as $$
  select b.amount from public.budget_amounts b
  join public.account_plans pl on pl.account_id = b.account_id and pl.mode = 'budget'
  where b.account_id = p_account and b.effective_from <= date_trunc('month', p_month)::date
    and (pl.started_on is null or date_trunc('month', pl.started_on)::date <= date_trunc('month', p_month)::date)
  order by b.effective_from desc limit 1
$$;

create or replace function private.shows_budget(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(a.show_budget, coalesce(pl.mode, 'payg') = 'budget')
  from public.accounts a left join public.account_plans pl on pl.account_id = a.id
  where a.id = p_account
$$;

-- ---------- line items: frozen prices and where they came from ----------
alter table public.line_items
  add column service_date date,
  add column rate_key text check (length(rate_key) <= 40),
  add column price_basis text check (price_basis in ('client_rate', 'price_list', 'override', 'manual', 'booking')),
  add column list_price numeric(12, 2) check (list_price >= 0),
  add column override_reason text check (length(override_reason) <= 300),
  add column logged boolean not null default false,
  add column sort int not null default 0,
  add constraint line_items_override_reason check (price_basis is distinct from 'override'
    or length(btrim(coalesce(override_reason, ''))) >= 3);
update public.line_items set billed_invoice_id = null
  where billed_invoice_id is not null and billed_invoice_id not in (select id from public.invoices);
alter table public.line_items add constraint line_items_billed_invoice_fk
  foreign key (billed_invoice_id) references public.invoices (id) on delete set null;
create index line_items_billed_idx on public.line_items (billed_invoice_id);

-- ---------- a budget month: total, budget, activity by shoot ----------
create or replace function private.budget_month(p_account uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select date_trunc('month', p_month)::date as month),
  items as (
    select li.*, p.ref, p.title, p.shoot_date, p.meta, p.delivered_at
    from public.line_items li left join public.projects p on p.id = li.project_id, m
    where li.account_id = p_account and li.delivered_month = m.month
  ), groups as (
    select project_id, min(ref) as ref, min(title) as title,
      coalesce(min(service_date), min(shoot_date), min((delivered_at at time zone 'Asia/Dubai')::date),
        min((created_at at time zone 'Asia/Dubai')::date)) as day,
      min(meta -> 'booking' -> 'location' ->> 'address') as location,
      round(sum(qty * unit_price), 2) as total,
      jsonb_agg(jsonb_build_object('description', description, 'qty', qty, 'unit_price', unit_price,
        'amount', round(qty * unit_price, 2), 'kind', kind) order by sort, created_at) as items
    from items group by project_id
  )
  select jsonb_build_object(
    'month', (select month from m),
    'budget', private.budget_for(p_account, (select month from m)),
    'total', coalesce((select round(sum(qty * unit_price), 2) from items), 0),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('project_id', project_id, 'ref', ref,
        'title', title, 'date', day, 'location', location, 'total', total, 'items', items)
        order by day desc nulls last, ref desc) from groups), '[]'::jsonb))
$$;

-- ---------- statements know budget months too ----------
create or replace function private.build_statement(p_account uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_vat_on boolean; v_lines jsonb; v_sub numeric; v_pm jsonb; v_vat numeric;
  v_month date := date_trunc('month', p_month)::date; v_budget numeric; v_used numeric; v_mode text;
begin
  select * into a from public.accounts where id = p_account;
  select vat_registered into v_vat_on from public.billing_settings where id;
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'kind', li.kind, 'ref', p.ref, 'amount', round(li.qty * li.unit_price, 2))
      order by coalesce(li.service_date, (p.delivered_at at time zone 'Asia/Dubai')::date), li.sort, li.created_at), '[]'::jsonb)
    into v_lines
  from public.line_items li left join public.projects p on p.id = li.project_id
  where li.account_id = p_account and li.delivered_month = v_month;
  v_budget := private.budget_for(p_account, v_month);
  if v_budget is not null then
    v_mode := 'budget';
    select coalesce(sum((l ->> 'amount')::numeric), 0) into v_used from jsonb_array_elements(v_lines) l;
    v_sub := greatest(v_budget, v_used);
  else
    v_pm := private.package_month(p_account, v_month);
    if v_pm is not null then
      v_mode := 'package';
      v_sub := (v_pm ->> 'estimate')::numeric;
    else
      v_mode := 'payg';
      select coalesce(sum((l ->> 'amount')::numeric), 0) into v_sub from jsonb_array_elements(v_lines) l;
    end if;
  end if;
  v_vat := (case when coalesce(v_vat_on, false) then round(v_sub * 0.05, 2) else 0 end);
  return jsonb_build_object('account_id', p_account, 'month', v_month, 'currency', a.currency,
    'mode', v_mode,
    'package', (case when v_mode = 'package' then jsonb_build_object('name', v_pm ->> 'name',
      'price', (v_pm ->> 'price')::numeric, 'full_price', (v_pm ->> 'full_price')::numeric,
      'prorated', (v_pm ->> 'prorated')::boolean, 'term_months', (v_pm ->> 'term_months')::int,
      'overage_total', (v_pm ->> 'overage_total')::numeric, 'extras_total', (v_pm ->> 'extras_total')::numeric,
      'before_total', (v_pm ->> 'before_total')::numeric)
      when v_mode = 'budget' then jsonb_build_object('name', 'Monthly package', 'price', v_budget,
        'used', v_used, 'additional', greatest(v_used - v_budget, 0)) end),
    'lines', v_lines, 'overage', coalesce(v_pm -> 'usage', '[]'::jsonb),
    'subtotal', round(v_sub, 2), 'vat_rate', (case when coalesce(v_vat_on, false) then 5 else 0 end),
    'vat', v_vat, 'total', round(v_sub, 2) + v_vat);
end $$;

-- ---------- the client's Billing page ----------
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
    -- Budget and activity: only with the client's switch on.
    'budget', (case when pl.mode = 'budget' and v_show then v_bm end),
    -- Recent months' activity for the same switch (pay-as-you-go and fixed clients with it on).
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
        from jsonb_array_elements(v_plan -> 'usage') u), '[]'::jsonb)) end),
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

-- What the booking form may show: whether this account books in the portal, and (Owner/Admins
-- with the budget switch on only) the rates for a live estimate. Members get no prices.
create or replace function public.my_booking_options(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.account_role(p_account); pl public.account_plans%rowtype; a public.accounts%rowtype;
  v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if v_role is null then raise exception 'not a member of that account' using errcode = '42501'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  return jsonb_build_object(
    'can_book', coalesce(pl.mode, 'payg') in ('budget', 'package'),
    'currency', a.currency,
    'rates', (case when v_role in ('owner', 'admin') and private.shows_budget(p_account) then jsonb_build_object(
      'reel', private.rate_on(p_account, 'reel', v_today),
      'long_form', private.rate_on(p_account, 'long_form', v_today)) end));
end $$;

-- ---------- bookings from the portal ----------
create or replace function public.book_shoot(p_account uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ref text; s jsonb; v_addr text; v_title text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' end;
begin
  if v_uid is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_plans where account_id = p_account and mode in ('budget', 'package')) then
    raise exception 'booking in the portal is for package clients; book on the website' using errcode = '22023';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if length(coalesce(p_location ->> 'unit', '')) > 200 or length(coalesce(p_location ->> 'access', '')) > 1000 then
    raise exception 'location details too long' using errcode = '22023';
  end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ->> 'service' <> 'property' and coalesce((s ->> 'qty')::int, 0) not between 1 and 100 then
      raise exception 'quantity between 1 and 100' using errcode = '22023';
    end if;
    if s ->> 'service' = 'property' and jsonb_typeof(s -> 'property') <> 'object' then
      raise exception 'choose the property details' using errcode = '22023';
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.projects where account_id = p_account and created_at > now() - interval '1 day'
      and created_by is not null) >= 30 then
    raise exception 'too many new projects today' using errcode = '22023';
  end if;
  v_title := 'Shoot · ' || left(split_part(v_addr, ',', 1), 120);
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, shoot_date, slot, meta, created_by, requested_by)
  values (p_account, 'shoot', v_ref, v_title, 'requested', p_date, v_slot,
    jsonb_build_object('source', 'portal', 'booking', jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''))),
      'services', p_services, 'slot', p_slot,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    v_uid, v_uid)
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name)
    values (v_id, 'created', 'requested', private.my_name());
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ---------- deliverables, each with its own status and revision rounds ----------
create table public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  kind text not null check (kind in ('reel', 'long_form', 'photos', 'tour', 'video', 'other')),
  status text not null default 'editing' check (status in ('editing', 'delivered', 'in_revision', 'approved')),
  rounds_allowed int not null default 2 check (rounds_allowed between 0 and 20),
  rounds_used int not null default 0 check (rounds_used >= 0),
  link_url text check (link_url ~ '^https://\S+$' and length(link_url) <= 2000),
  sort int not null default 0,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_deliverables_project_idx on public.project_deliverables (project_id, sort);
create trigger project_deliverables_updated_at before update on public.project_deliverables
  for each row execute function public.set_updated_at();

create table public.deliverable_revisions (
  id bigint generated always as identity primary key,
  deliverable_id uuid not null references public.project_deliverables (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  round int not null,
  note text not null check (length(btrim(note)) between 1 and 2000),
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_name text,
  at timestamptz not null default now()
);
create index deliverable_revisions_deliverable_idx on public.deliverable_revisions (deliverable_id, round);
create index deliverable_revisions_project_idx on public.deliverable_revisions (project_id);
create index deliverable_revisions_requested_by_idx on public.deliverable_revisions (requested_by);

alter table public.project_files add column deliverable_id uuid references public.project_deliverables (id) on delete set null;
create index project_files_deliverable_idx on public.project_files (deliverable_id);

alter table public.project_events drop constraint project_events_kind_check;
alter table public.project_events add constraint project_events_kind_check check (kind in (
  'created', 'status', 'delivery', 'revision_requested', 'revision_in_progress', 'revision_delivered',
  'approved', 'auto_completed', 'note', 'files_added', 'script_posted', 'script_approved', 'script_changes',
  'logged', 'deliverable'));

revoke all on public.project_deliverables, public.deliverable_revisions from anon, authenticated;
grant select on public.project_deliverables, public.deliverable_revisions to authenticated;
alter table public.project_deliverables enable row level security;
alter table public.deliverable_revisions enable row level security;
create policy "read deliverables of visible projects" on public.project_deliverables
  for select to authenticated using (project_id in (select id from public.projects));
create policy "read revisions of visible projects" on public.deliverable_revisions
  for select to authenticated using (project_id in (select id from public.projects));
alter publication supabase_realtime add table public.project_deliverables;

-- The client asks for a revision of one deliverable (its rounds are counted on their own).
create or replace function public.request_deliverable_revision(p_deliverable uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.project_deliverables%rowtype; p public.projects%rowtype;
begin
  select * into d from public.project_deliverables where id = p_deliverable for update;
  select * into p from public.projects where id = d.project_id;
  if d.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if d.status <> 'delivered' then
    raise exception 'revisions are for delivered items' using errcode = '22023';
  end if;
  if d.rounds_used >= d.rounds_allowed then
    raise exception 'no revision rounds left for this item' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'say what should change (a timecode or photo number helps)' using errcode = '22023';
  end if;
  update public.project_deliverables set status = 'in_revision', rounds_used = rounds_used + 1 where id = d.id;
  insert into public.deliverable_revisions (deliverable_id, project_id, round, note, requested_by, requested_by_name)
    values (d.id, d.project_id, d.rounds_used + 1, left(btrim(p_note), 2000), auth.uid(), private.my_name());
  insert into public.project_events (project_id, kind, note, actor_name)
    values (d.project_id, 'revision_requested', left(d.label || ': ' || btrim(p_note), 1000), private.my_name());
  insert into public.project_messages (project_id, author_id, author_name, body)
    values (d.project_id, auth.uid(), private.my_name(), 'Revision request for ' || d.label || ': ' || btrim(p_note));
  return jsonb_build_object('round', d.rounds_used + 1, 'of', d.rounds_allowed, 'label', d.label,
    'ref', p.ref, 'title', p.title, 'project', p.id);
end $$;

create or replace function public.approve_deliverable(p_deliverable uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.project_deliverables%rowtype; p public.projects%rowtype;
begin
  select * into d from public.project_deliverables where id = p_deliverable for update;
  select * into p from public.projects where id = d.project_id;
  if d.id is null or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
    raise exception 'not your project' using errcode = '42501';
  end if;
  if d.status <> 'delivered' then raise exception 'nothing to approve right now' using errcode = '22023'; end if;
  update public.project_deliverables set status = 'approved' where id = d.id;
  insert into public.project_events (project_id, kind, note, actor_name)
    values (d.project_id, 'deliverable', d.label || ': approved', private.my_name());
end $$;

-- ---------- inquiries ----------
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  subject text not null check (length(btrim(subject)) between 1 and 140),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  admin_unread boolean not null default true,
  client_unread boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inquiries_account_idx on public.inquiries (account_id, last_message_at desc);
create index inquiries_project_idx on public.inquiries (project_id);
create index inquiries_created_by_idx on public.inquiries (created_by);
create index inquiries_admin_idx on public.inquiries (status, last_message_at desc);
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  is_admin boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 4000),
  link_url text check (link_url ~ '^https://\S+$' and length(link_url) <= 2000),
  link_label text check (length(link_label) <= 80),
  attachment_key text check (attachment_key not like '%..%' and length(attachment_key) <= 400),
  attachment_name text check (length(attachment_name) <= 160),
  attachment_bytes bigint check (attachment_bytes between 1 and 26214400),
  attachment_type text check (length(attachment_type) <= 120),
  at timestamptz not null default now()
);
create index inquiry_messages_inquiry_idx on public.inquiry_messages (inquiry_id, at);
create index inquiry_messages_author_idx on public.inquiry_messages (author_id);

-- Who sees an inquiry: the account's Owner/Admins, everyone on an open account, else its author.
create or replace function private.sees_inquiry(p_account uuid, p_created uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_account in (select private.my_admin_account_ids())
    or p_account in (select private.my_open_account_ids())
    or (p_account in (select private.my_account_ids()) and auth.uid() = p_created), false)
$$;
revoke all on function private.sees_inquiry(uuid, uuid) from public, anon;
grant execute on function private.sees_inquiry(uuid, uuid) to authenticated;

revoke all on public.inquiries, public.inquiry_messages from anon, authenticated;
grant select on public.inquiries, public.inquiry_messages to authenticated;
alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;
create policy "read visible inquiries" on public.inquiries
  for select to authenticated using ((select private.sees_inquiry(account_id, created_by)));
create policy "read messages of visible inquiries" on public.inquiry_messages
  for select to authenticated using (inquiry_id in (select id from public.inquiries));
alter publication supabase_realtime add table public.inquiries, public.inquiry_messages;

create or replace function private.check_attachment(p_account uuid, p_att jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_att is null or p_att = 'null'::jsonb then return; end if;
  if coalesce(p_att ->> 'key', '') not like 'inquiries/' || p_account || '/%' or p_att ->> 'key' like '%..%' then
    raise exception 'not an attachment for this account' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_att ->> 'name')), 0) not between 1 and 160 then
    raise exception 'the attachment needs a name' using errcode = '22023';
  end if;
end $$;

create or replace function public.create_inquiry(p_account uuid, p_subject text, p_body text,
  p_project uuid default null, p_attachment jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; p public.projects%rowtype;
begin
  if auth.uid() is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_subject)), 0) not between 1 and 140 then
    raise exception 'add a subject' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'write your message' using errcode = '22023';
  end if;
  if p_project is not null then
    select * into p from public.projects where id = p_project;
    if p.id is null or p.account_id <> p_account
      or not private.sees_project(p.account_id, p.created_by, p.requested_by, p.assigned_member_ids) then
      raise exception 'that shoot isn''t yours' using errcode = '42501';
    end if;
  end if;
  perform private.check_attachment(p_account, p_attachment);
  if (select count(*) from public.inquiries where account_id = p_account and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many new inquiries today' using errcode = '22023';
  end if;
  insert into public.inquiries (account_id, project_id, subject, created_by, created_by_name)
    values (p_account, p_project, btrim(p_subject), auth.uid(), private.my_name()) returning id into v;
  insert into public.inquiry_messages (inquiry_id, author_id, author_name, body, attachment_key, attachment_name,
    attachment_bytes, attachment_type)
    values (v, auth.uid(), private.my_name(), btrim(p_body), p_attachment ->> 'key', p_attachment ->> 'name',
      (p_attachment ->> 'bytes')::bigint, p_attachment ->> 'type');
  return v;
end $$;

create or replace function public.reply_inquiry(p_inquiry uuid, p_body text, p_attachment jsonb default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare q public.inquiries%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry for update;
  if q.id is null or not private.sees_inquiry(q.account_id, q.created_by) then
    raise exception 'not your inquiry' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'write your message' using errcode = '22023';
  end if;
  perform private.check_attachment(q.account_id, p_attachment);
  insert into public.inquiry_messages (inquiry_id, author_id, author_name, body, attachment_key, attachment_name,
    attachment_bytes, attachment_type)
    values (q.id, auth.uid(), private.my_name(), btrim(p_body), p_attachment ->> 'key', p_attachment ->> 'name',
      (p_attachment ->> 'bytes')::bigint, p_attachment ->> 'type');
  update public.inquiries set admin_unread = true, client_unread = false, status = 'open', last_message_at = now()
    where id = q.id;
end $$;

create or replace function public.set_inquiry_status(p_inquiry uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.inquiries%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry;
  if q.id is null or not private.sees_inquiry(q.account_id, q.created_by) then
    raise exception 'not your inquiry' using errcode = '42501';
  end if;
  if p_status not in ('open', 'resolved') then raise exception 'unknown status' using errcode = '22023'; end if;
  update public.inquiries set status = p_status where id = q.id;
end $$;

create or replace function public.read_inquiry(p_inquiry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.inquiries%rowtype;
begin
  select * into q from public.inquiries where id = p_inquiry;
  if q.id is null or not private.sees_inquiry(q.account_id, q.created_by) then
    raise exception 'not your inquiry' using errcode = '42501';
  end if;
  update public.inquiries set client_unread = false where id = q.id and client_unread;
end $$;

-- ---------- invoices: drafts first ----------
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'approved', 'due', 'paid', 'overdue'));
alter table public.invoices alter column number drop not null;
alter table public.invoices
  add column category text check (category in ('budget', 'fixed', 'payg', 'property', 'one_off', 'manual')),
  add column period_start date,
  add column period_end date,
  add column project_id uuid references public.projects (id) on delete set null,
  add column lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  add column subtotal numeric(12, 2),
  add column vat_rate numeric(5, 2) not null default 0,
  add column vat numeric(12, 2) not null default 0,
  add column publish_on date,
  add column approved_at timestamptz,
  add column approved_by text,
  add column published_at timestamptz,
  add column pdf_source text not null default 'ledger' check (pdf_source in ('generated', 'ledger')),
  add column basis_total numeric(12, 2),
  add column advance boolean not null default false,
  add constraint invoices_number_when_live check (status in ('draft') or number is not null);
create index invoices_project_idx on public.invoices (project_id);
create index invoices_queue_idx on public.invoices (status, publish_on);
-- One month-end draft per client, kind and period; one per delivered project.
create unique index invoices_period_once on public.invoices (account_id, category, period_start, advance)
  where category in ('budget', 'fixed', 'payg');
create unique index invoices_project_once on public.invoices (project_id)
  where category in ('property', 'one_off');
update public.invoices set published_at = coalesce(published_at, created_at), subtotal = coalesce(subtotal, amount)
  where status in ('due', 'paid', 'overdue');

alter table public.billing_settings
  add column invoice_prefix text not null default 'MW-' check (invoice_prefix ~ '^[A-Z0-9-]{1,12}$'),
  add column next_invoice_no int not null default 1001 check (next_invoice_no between 1 and 99999999),
  add column default_due_days int not null default 7 check (default_due_days between 0 and 90),
  add column company_name text check (length(company_name) <= 120),
  add column company_address text check (length(company_address) <= 300),
  add column company_trn text check (company_trn ~ '^[0-9]{15}$'),
  add column company_email text check (length(company_email) <= 160);

-- Clients only ever see published invoices.
drop policy "managers read invoices" on public.invoices;
create policy "managers read published invoices" on public.invoices
  for select to authenticated using (status in ('due', 'paid', 'overdue')
    and account_id in (select private.my_admin_account_ids()));

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
    'pay_online', private.pays_online(i.account_id));
end $$;

-- Lines → subtotal, VAT (5% when the business is VAT registered) and total.
create or replace function private.invoice_totals(p_lines jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (select coalesce(round(sum(round((l ->> 'qty')::numeric * (l ->> 'unit_price')::numeric, 2)), 2), 0) as sub
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l),
  v as (select coalesce((select vat_registered from public.billing_settings where id), false) as on_)
  select jsonb_build_object('subtotal', s.sub, 'vat_rate', case when v.on_ then 5 else 0 end,
    'vat', case when v.on_ then round(s.sub * 0.05, 2) else 0 end,
    'total', s.sub + case when v.on_ then round(s.sub * 0.05, 2) else 0 end)
  from s, v
$$;

-- Normalised lines: description, qty, unit_price, amount (and the line item they came from).
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
    if v_q is null or v_q <= 0 or v_p is null or v_p < 0 then
      raise exception 'quantities above 0 and prices of 0 or more' using errcode = '22023';
    end if;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('description', btrim(l ->> 'description'),
      'qty', v_q, 'unit_price', v_p, 'amount', round(v_q * v_p, 2),
      'line_item_id', l ->> 'line_item_id', 'kind', l ->> 'kind')));
  end loop;
  return out;
end $$;

create or replace function private.month_label(p_month date) returns text
language sql immutable set search_path = '' as $$ select to_char(p_month, 'FMMonth YYYY') $$;

-- A draft invoice; marks the line items it bills. Returns the new id.
create or replace function private.new_draft(p_account uuid, p_category text, p_start date, p_end date,
  p_lines jsonb, p_publish_on date, p_actor text, p_project uuid default null, p_advance boolean default false,
  p_basis numeric default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; t jsonb; a public.accounts%rowtype; v_lines jsonb := private.clean_lines(p_lines);
  v_days int; v_issue date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into a from public.accounts where id = p_account;
  select default_due_days into v_days from public.billing_settings where id;
  t := private.invoice_totals(v_lines);
  insert into public.invoices (account_id, number, issued_on, due_on, amount, currency, status, category,
    period_start, period_end, project_id, lines, subtotal, vat_rate, vat, publish_on, pdf_source, basis_total,
    advance, note, created_by)
  values (p_account, null, coalesce(p_publish_on, v_issue),
    coalesce(p_publish_on, v_issue) + coalesce(v_days, 7), (t ->> 'total')::numeric, a.currency, 'draft',
    p_category, p_start, p_end, p_project, v_lines, (t ->> 'subtotal')::numeric, (t ->> 'vat_rate')::numeric,
    (t ->> 'vat')::numeric, p_publish_on, 'generated', p_basis, p_advance, p_note, p_actor)
  returning id into v;
  update public.line_items set billed_invoice_id = v
    where id in (select (l ->> 'line_item_id')::uuid from jsonb_array_elements(v_lines) l
      where l ? 'line_item_id') and account_id = p_account and billed_invoice_id is null;
  return v;
end $$;

-- What a month-end draft bills, from the client's activity (also used to refresh a draft).
create or replace function private.month_end_lines(p_account uuid, p_month date, p_advance boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pl public.account_plans%rowtype; a public.accounts%rowtype; v_lines jsonb := '[]'::jsonb;
  v_budget numeric; v_used numeric; v_pm jsonb; u jsonb; e jsonb; v_cat text; v_basis numeric;
  v_month date := date_trunc('month', p_month)::date; v_items jsonb;
begin
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  if pl.mode = 'budget' then
    v_cat := 'budget';
    v_budget := private.budget_for(p_account, v_month);
    if p_advance then
      -- The package for the month, billed before it starts.
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
      -- Mark the month's items as billed (they're locked once a draft covers them).
      v_lines := v_lines || coalesce((select jsonb_agg(jsonb_build_object('mark', x ->> 'line_item_id'))
        from jsonb_array_elements(v_items) x), '[]'::jsonb);
      v_basis := v_used;
    end if;
  elsif pl.mode = 'package' then
    v_cat := 'fixed';
    v_pm := private.package_month(p_account, v_month);
    if v_pm is null then return null; end if;
    v_lines := jsonb_build_array(jsonb_build_object('description', (v_pm ->> 'name') || ' · '
      || private.month_label(v_month) || (case when (v_pm ->> 'prorated')::boolean then ' (pro-rated)' else '' end),
      'qty', 1, 'unit_price', (v_pm ->> 'price')::numeric));
    for u in select * from jsonb_array_elements(v_pm -> 'usage') loop
      if (u ->> 'over')::numeric > 0 then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', 'Extra ' || lower(u ->> 'label')
          || ' beyond the package', 'qty', (u ->> 'over')::numeric, 'unit_price', coalesce((u ->> 'rate')::numeric, 0)));
      end if;
    end loop;
    for e in select * from jsonb_array_elements(coalesce(v_pm -> 'extras', '[]'::jsonb) || coalesce(v_pm -> 'before', '[]'::jsonb)) loop
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', e ->> 'description',
        'qty', (e ->> 'qty')::numeric, 'unit_price', (e ->> 'unit_price')::numeric));
    end loop;
    v_basis := (v_pm ->> 'estimate')::numeric;
  else
    v_cat := 'payg';
    -- Everything not yet billed, delivered up to this month.
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

-- Split "mark" entries (items to lock) from billable lines.
create or replace function private.month_end_draft(p_account uuid, p_month date, p_advance boolean, p_actor text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v uuid; v_lines jsonb; v_marks uuid[]; v_month date := date_trunc('month', p_month)::date;
  v_publish date;
begin
  r := private.month_end_lines(p_account, v_month, p_advance);
  if r is null then return null; end if;
  select coalesce(jsonb_agg(l) filter (where not l ? 'mark'), '[]'::jsonb),
    array_agg((l ->> 'mark')::uuid) filter (where l ? 'mark')
    into v_lines, v_marks from jsonb_array_elements(r -> 'lines') l;
  if jsonb_array_length(v_lines) = 0 then return null; end if;
  if exists (select 1 from public.invoices where account_id = p_account and category = r ->> 'category'
      and period_start = v_month and advance = p_advance) then
    return null;
  end if;
  -- Month-end invoices publish on the month's last day; a package billed in advance on its 1st.
  v_publish := (case when p_advance then v_month else (v_month + interval '1 month' - interval '1 day')::date end);
  v := private.new_draft(p_account, r ->> 'category', v_month, (v_month + interval '1 month' - interval '1 day')::date,
    v_lines, v_publish, p_actor, null, p_advance, (r ->> 'basis')::numeric);
  if v_marks is not null then
    update public.line_items set billed_invoice_id = v where id = any (v_marks) and billed_invoice_id is null;
  end if;
  return v;
end $$;

-- The 25th (or any later day of the month): month-end drafts for review, and next month's
-- package drafts for clients billed in advance. Safe to run again (one draft per period).
create or replace function public.portal_admin_generate_drafts(p_secret text, p_actor text, p_today date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := coalesce(p_today, (now() at time zone 'Asia/Dubai')::date);
  v_month date := date_trunc('month', v_today)::date; r record; v uuid; v_ids uuid[] := '{}';
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if extract(day from v_today) < 25 then
    return jsonb_build_object('created', 0, 'ids', '[]'::jsonb, 'note', 'drafts are made from the 25th');
  end if;
  for r in select a.id, pl.mode, pl.bill_in_advance, a.payg_invoicing
    from public.accounts a left join public.account_plans pl on pl.account_id = a.id
  loop
    if r.mode in ('budget', 'package') or (coalesce(r.mode, 'payg') = 'payg' and r.payg_invoicing = 'month_end') then
      v := private.month_end_draft(r.id, v_month, false, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
    if r.mode = 'budget' and r.bill_in_advance then
      v := private.month_end_draft(r.id, (v_month + interval '1 month')::date, true, p_actor);
      if v is not null then v_ids := v_ids || v; end if;
    end if;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into private.portal_admin_log (actor, action, detail)
      values (p_actor, 'create', 'Invoice drafts for ' || private.month_label(v_month) || ': ' || array_length(v_ids, 1));
  end if;
  return jsonb_build_object('created', coalesce(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
end $$;

-- A delivered project of a pay-as-you-go client billed per project: a draft for its items.
create or replace function private.project_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_lines jsonb; v_basis numeric; v_mode text;
begin
  if new.status <> 'delivered' or old.status = 'delivered' or new.account_id is null then return new; end if;
  select * into a from public.accounts where id = new.account_id;
  select mode into v_mode from public.account_plans where account_id = new.account_id;
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
create trigger projects_draft_on_delivery after update of status on public.projects
  for each row execute function private.project_draft();
revoke all on function private.project_draft() from public, anon, authenticated;

-- Publishing: visible to the client, numbered if not yet, issued today. Returns who to email.
create or replace function private.publish_invoice(p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; v_today date := (now() at time zone 'Asia/Dubai')::date; v_days int;
begin
  select * into i from public.invoices where id = p_id for update;
  if i.status not in ('draft', 'approved') then raise exception 'already published' using errcode = '22023'; end if;
  select default_due_days into v_days from public.billing_settings where id;
  -- Issued today; the due date stays as set unless it has already passed.
  update public.invoices set status = 'due', published_at = now(), issued_on = v_today,
    due_on = case when i.due_on < v_today then v_today + coalesce(v_days, 7) else i.due_on end,
    approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, p_actor)
    where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || coalesce(i.number, '') || ' published');
  return jsonb_build_object('id', i.id, 'account', i.account_id, 'number', i.number,
    'recipients', private.billing_recipients(i.account_id, 'invoice_issued'));
end $$;

create or replace function private.next_invoice_number() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.billing_settings%rowtype;
begin
  update public.billing_settings set next_invoice_no = next_invoice_no + 1 where id returning * into s;
  return s.invoice_prefix || (s.next_invoice_no - 1);
end $$;

create or replace function public.portal_admin_approve_invoice(p_secret text, p_actor text, p_id uuid,
  p_publish_now boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  if i.status not in ('draft', 'approved') then raise exception 'already published' using errcode = '22023'; end if;
  if jsonb_array_length(i.lines) = 0 and i.pdf_source = 'generated' then
    raise exception 'add at least one line' using errcode = '22023';
  end if;
  update public.invoices set status = 'approved', approved_at = now(), approved_by = p_actor,
    number = coalesce(number, private.next_invoice_number())
    where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice draft approved');
  -- One-off invoices (no publish date) go out on approval; month-end ones on their date.
  if p_publish_now or i.publish_on is null or i.publish_on <= (now() at time zone 'Asia/Dubai')::date then
    return private.publish_invoice(p_id, p_actor) || jsonb_build_object('published', true);
  end if;
  return jsonb_build_object('id', p_id, 'published', false, 'publish_on', i.publish_on, 'recipients', '[]'::jsonb);
end $$;

-- Daily: approved invoices whose date has come are published.
create or replace function public.portal_admin_publish_due(p_secret text, p_actor text, p_today date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := coalesce(p_today, (now() at time zone 'Asia/Dubai')::date); r record; v jsonb := '[]'::jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  for r in select id from public.invoices where status = 'approved' and publish_on is not null and publish_on <= v_today
    order by publish_on, created_at
  loop
    v := v || jsonb_build_array(private.publish_invoice(r.id, p_actor));
  end loop;
  return v;
end $$;

-- Edit a draft (or an approved one, which goes back to approved with the same number).
create or replace function public.portal_admin_save_draft(p_secret text, p_actor text, p_id uuid, p_lines jsonb,
  p_note text, p_due date, p_pdf_source text default 'generated', p_pdf_key text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; v_lines jsonb := private.clean_lines(p_lines); t jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  if i.status not in ('draft', 'approved') then raise exception 'published invoices can''t be edited' using errcode = '22023'; end if;
  if p_pdf_source not in ('generated', 'ledger') then raise exception 'unknown PDF source' using errcode = '22023'; end if;
  if p_pdf_key is not null and (p_pdf_key not like 'invoices/' || i.account_id || '/%' or p_pdf_key like '%..%') then
    raise exception 'not a PDF for this client' using errcode = '22023';
  end if;
  if p_pdf_source = 'ledger' and coalesce(p_pdf_key, i.pdf_key) is null then
    raise exception 'upload the Ledger PDF first' using errcode = '22023';
  end if;
  if p_due is null or p_due < coalesce(i.publish_on, (now() at time zone 'Asia/Dubai')::date) then
    raise exception 'the due date must be on or after the invoice date' using errcode = '22023';
  end if;
  t := private.invoice_totals(v_lines);
  -- Line items dropped from the draft go back to unbilled; new ones are marked.
  update public.line_items set billed_invoice_id = null where billed_invoice_id = p_id
    and id::text not in (select l ->> 'line_item_id' from jsonb_array_elements(v_lines) l where l ? 'line_item_id')
    and (i.category not in ('budget') or i.advance);
  update public.invoices set lines = v_lines, subtotal = (t ->> 'subtotal')::numeric, vat_rate = (t ->> 'vat_rate')::numeric,
    vat = (t ->> 'vat')::numeric, amount = (t ->> 'total')::numeric,
    note = nullif(btrim(coalesce(p_note, '')), ''), due_on = p_due, pdf_source = p_pdf_source,
    pdf_key = coalesce(p_pdf_key, pdf_key)
    where id = p_id;
  return t;
end $$;

-- Rebuild a month-end draft from the latest activity (after more work was logged).
create or replace function public.portal_admin_refresh_draft(p_secret text, p_actor text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; r jsonb; v_lines jsonb; v_marks uuid[]; t jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null or i.status <> 'draft' or i.category not in ('budget', 'fixed', 'payg') then
    raise exception 'only month-end drafts can be refreshed' using errcode = '22023';
  end if;
  update public.line_items set billed_invoice_id = null where billed_invoice_id = p_id;
  r := private.month_end_lines(i.account_id, i.period_start, i.advance);
  select coalesce(jsonb_agg(l) filter (where not l ? 'mark'), '[]'::jsonb),
    array_agg((l ->> 'mark')::uuid) filter (where l ? 'mark')
    into v_lines, v_marks from jsonb_array_elements(coalesce(r -> 'lines', '[]'::jsonb)) l;
  v_lines := private.clean_lines(v_lines);
  t := private.invoice_totals(v_lines);
  update public.invoices set lines = v_lines, subtotal = (t ->> 'subtotal')::numeric, vat_rate = (t ->> 'vat_rate')::numeric,
    vat = (t ->> 'vat')::numeric, amount = (t ->> 'total')::numeric, basis_total = (r ->> 'basis')::numeric
    where id = p_id;
  update public.line_items set billed_invoice_id = p_id
    where (id = any (coalesce(v_marks, '{}'))
      or id::text in (select l ->> 'line_item_id' from jsonb_array_elements(v_lines) l where l ? 'line_item_id'))
      and billed_invoice_id is null;
  return t;
end $$;

-- The queue: drafts and approved first, then the rest; with whether activity moved since a draft.
create or replace function public.portal_admin_invoice_queue(p_secret text, p_actor text, p_status text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.rank, x.publish_on nulls first, x.created_at desc) from (
    select i.id, i.account_id, a.name as account_name, i.number, i.category, i.period_start, i.period_end,
      i.amount, i.currency, i.status, i.publish_on, i.issued_on, i.due_on, i.advance, i.project_id,
      i.created_at, i.basis_total, i.payment_state,
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

create or replace function public.portal_admin_invoice(p_secret text, p_actor text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select to_jsonb(i) || jsonb_build_object('account_name', a.name, 'account_type', a.type, 'account_trn', a.trn,
      'project_ref', p.ref, 'project_title', p.title,
      'shown_status', case when i.status = 'due' and i.due_on < (now() at time zone 'Asia/Dubai')::date then 'overdue' else i.status end,
      'pays_online', private.pays_online(i.account_id),
      'activity_total', case when i.category in ('budget', 'fixed', 'payg') and not i.advance
        then (private.month_end_lines(i.account_id, i.period_start, false) ->> 'basis')::numeric end)
    into v
  from public.invoices i join public.accounts a on a.id = i.account_id
  left join public.projects p on p.id = i.project_id
  where i.id = p_id;
  return v;
end $$;

-- A one-off draft made by hand (replaces the direct "create invoice"): never sent directly.
create or replace function public.portal_admin_create_invoice(p_secret text, p_actor text, p_account uuid,
  p_number text, p_issued date, p_due date, p_amount numeric, p_currency text, p_status text,
  p_pdf_key text, p_note text default null, p_statement_month date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid; v_lines jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_pdf_key is not null and (p_pdf_key not like 'invoices/' || p_account || '/%' or p_pdf_key like '%..%') then
    raise exception 'not a PDF for this client' using errcode = '22023';
  end if;
  v_lines := jsonb_build_array(jsonb_build_object('description',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Services'), 'qty', 1, 'unit_price', p_amount));
  v := private.new_draft(p_account, 'manual', p_statement_month,
    case when p_statement_month is not null then (p_statement_month + interval '1 month' - interval '1 day')::date end,
    v_lines, null, p_actor, null, false, null, nullif(btrim(coalesce(p_note, '')), ''));
  update public.invoices set number = nullif(btrim(coalesce(p_number, '')), ''),
    due_on = greatest(coalesce(p_due, due_on), issued_on), statement_month = p_statement_month,
    pdf_key = p_pdf_key, pdf_source = case when p_pdf_key is not null then 'ledger' else 'generated' end
    where id = v;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', p_account, 'Invoice draft · ' || p_currency || ' ' || p_amount);
  return jsonb_build_object('id', v, 'recipients', '[]'::jsonb);
end $$;

-- Deleting a draft frees its line items for the next one.
create or replace function public.portal_admin_delete_invoice(p_secret text, p_actor text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id;
  if i.id is null then return null; end if;
  update public.line_items set billed_invoice_id = null where billed_invoice_id = p_id;
  delete from public.invoices where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || coalesce(i.number, 'draft') || ' deleted');
  return i.pdf_key;
end $$;

-- ---------- admin: plans, budgets and rates with history ----------
create or replace function public.portal_admin_set_budget(p_secret text, p_actor text, p_account uuid,
  p_amount numeric, p_from date, p_advance boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_from)::date; pl public.account_plans%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_amount is null or p_amount <= 0 then raise exception 'enter the monthly amount' using errcode = '22023'; end if;
  if v_from is null then raise exception 'choose when it starts' using errcode = '22023'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  if pl.mode is distinct from 'budget' then
    insert into public.account_plans (account_id, mode, package_id, started_on, renews_on, term_months, ends_on, bill_in_advance)
      values (p_account, 'budget', null, v_from, (v_from + interval '1 month')::date, 1, null, coalesce(p_advance, false))
    on conflict (account_id) do update set mode = 'budget', package_id = null, started_on = v_from,
      renews_on = (v_from + interval '1 month')::date, term_months = 1, ends_on = null,
      bill_in_advance = coalesce(p_advance, false), updated_at = now();
  elsif p_advance is not null then
    update public.account_plans set bill_in_advance = p_advance, updated_at = now() where account_id = p_account;
  end if;
  insert into public.budget_amounts (account_id, amount, effective_from, created_by)
    values (p_account, round(p_amount, 2), v_from, p_actor)
  on conflict (account_id, effective_from) do update set amount = excluded.amount, created_by = excluded.created_by,
    created_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Monthly package ' || round(p_amount, 2) || ' from ' || v_from);
end $$;

create or replace function public.portal_admin_set_client_rate(p_secret text, p_actor text, p_account uuid,
  p_key text, p_amount numeric, p_from date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_amount is null or p_amount < 0 then raise exception 'enter the rate' using errcode = '22023'; end if;
  if p_from is null then raise exception 'choose when it applies from' using errcode = '22023'; end if;
  if not exists (select 1 from public.rate_card where key = p_key) then
    raise exception 'unknown service' using errcode = '22023';
  end if;
  insert into public.client_rates (account_id, key, amount, effective_from, created_by)
    values (p_account, p_key, round(p_amount, 2), p_from, p_actor)
  on conflict (account_id, key, effective_from) do update set amount = excluded.amount,
    created_by = excluded.created_by, created_at = now();
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Rate ' || p_key || ' ' || round(p_amount, 2) || ' from ' || p_from);
end $$;

create or replace function public.portal_admin_set_billing_switches(p_secret text, p_actor text, p_account uuid,
  p_show_budget boolean, p_payg_invoicing text, p_advance boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_payg_invoicing is not null and p_payg_invoicing not in ('per_project', 'month_end') then
    raise exception 'unknown invoicing' using errcode = '22023';
  end if;
  update public.accounts set show_budget = p_show_budget,
    payg_invoicing = coalesce(p_payg_invoicing, payg_invoicing) where id = p_account;
  if p_advance is not null then
    update public.account_plans set bill_in_advance = p_advance, updated_at = now()
      where account_id = p_account and mode = 'budget';
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Billing switches');
end $$;

-- A client's budget and rate history, for the client page.
create or replace function public.portal_admin_billing_history(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return jsonb_build_object(
    'budgets', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'effective_from', effective_from,
        'created_by', created_by, 'created_at', created_at) order by effective_from desc)
      from public.budget_amounts where account_id = p_account), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'label', c.label, 'amount', r.amount,
        'effective_from', r.effective_from, 'created_by', r.created_by, 'created_at', r.created_at)
        order by r.effective_from desc, c.sort)
      from public.client_rates r join public.rate_card c on c.key = r.key where r.account_id = p_account), '[]'::jsonb),
    'current_rates', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'unit', c.unit,
        'amount', private.rate_on(p_account, c.key, v_today)) order by c.sort)
      from public.rate_card c), '[]'::jsonb),
    'budget_month', private.budget_month(p_account, private.dubai_month(now())),
    'show_budget', private.shows_budget(p_account),
    'show_budget_set', (select show_budget from public.accounts where id = p_account),
    'payg_invoicing', (select payg_invoicing from public.accounts where id = p_account),
    'bill_in_advance', (select bill_in_advance from public.account_plans where account_id = p_account),
    'mode', coalesce((select mode from public.account_plans where account_id = p_account), 'payg'));
end $$;

-- ---------- admin: log what we shot; deliverables ----------
-- Lines: [{key, description, qty, unit_price, list_price, basis, reason}] where basis is
-- client_rate (the server reprices from the client's rate on the shoot date), price_list
-- (property shoots, priced by the app from the site's price list) or override (reason needed).
-- Replaces the project's earlier log unless an item is already on an invoice.
create or replace function public.portal_admin_log_shoot(p_secret text, p_actor text, p_project uuid,
  p_lines jsonb, p_deliverables jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; l jsonb; v_date date; v_month date; v_mode text; v_price numeric;
  v_list numeric; v_basis text; v_n int := 0; v_sort int := 0; d jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null or p.account_id is null then
    raise exception 'log against a client''s shoot' using errcode = '22023';
  end if;
  if exists (select 1 from public.line_items where project_id = p_project and logged and billed_invoice_id is not null) then
    raise exception 'already on an invoice: change it on the invoice draft instead' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 60 then
    raise exception 'up to 60 lines' using errcode = '22023';
  end if;
  v_date := coalesce(p.shoot_date, (now() at time zone 'Asia/Dubai')::date);
  select mode into v_mode from public.account_plans where account_id = p.account_id;
  -- Budget clients see it in this month's activity straight away; others when it's delivered.
  v_month := case when v_mode = 'budget' then date_trunc('month', v_date)::date
    when p.delivered_at is not null then private.dubai_month(p.delivered_at) end;
  delete from public.line_items where project_id = p_project and logged;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce(length(btrim(l ->> 'description')), 0) not between 1 and 200 then
      raise exception 'every line needs a description' using errcode = '22023';
    end if;
    if coalesce((l ->> 'qty')::numeric, 0) <= 0 then raise exception 'quantities above 0' using errcode = '22023'; end if;
    v_basis := coalesce(l ->> 'basis', 'client_rate');
    if v_basis = 'client_rate' then
      v_list := private.rate_on(p.account_id, l ->> 'key', v_date);
      if v_list is null then
        raise exception 'no rate for % yet: set it in the client''s rates or override the price', l ->> 'key'
          using errcode = '22023';
      end if;
      v_price := v_list;
    elsif v_basis = 'price_list' then
      v_list := (l ->> 'unit_price')::numeric;
      v_price := v_list;
    elsif v_basis = 'override' then
      if length(btrim(coalesce(l ->> 'reason', ''))) < 3 then
        raise exception 'say why the price was changed' using errcode = '22023';
      end if;
      v_price := (l ->> 'unit_price')::numeric;
      v_list := (l ->> 'list_price')::numeric;
    else
      raise exception 'unknown price basis' using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 then raise exception 'prices of 0 or more' using errcode = '22023'; end if;
    v_sort := v_sort + 1;
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, override_reason, logged, sort)
    select p_project, p.account_id, btrim(l ->> 'description'), (l ->> 'qty')::numeric, v_price, a.currency,
      coalesce(l ->> 'kind', l ->> 'key'), v_month, v_date, l ->> 'key', v_basis, v_list,
      case when v_basis = 'override' then btrim(l ->> 'reason') end, true, v_sort
    from public.accounts a where a.id = p.account_id;
    v_n := v_n + 1;
  end loop;
  -- Deliverables from the log, the first time (after that they're edited on their own).
  if p_deliverables is not null and not exists (select 1 from public.project_deliverables where project_id = p_project) then
    v_sort := 0;
    for d in select * from jsonb_array_elements(p_deliverables) loop
      v_sort := v_sort + 1;
      insert into public.project_deliverables (project_id, label, kind, sort)
        values (p_project, left(btrim(d ->> 'label'), 80), d ->> 'kind', v_sort);
    end loop;
  end if;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p_project, 'logged', 'Logged what was shot: ' || v_n || ' item' || case when v_n = 1 then '' else 's' end,
      'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': logged ' || v_n || ' items');
  return jsonb_build_object('logged', v_n);
end $$;

-- The deliverables list: [{id?, label, kind, link_url}] in order; missing ones are removed.
create or replace function public.portal_admin_save_deliverables(p_secret text, p_actor text, p_project uuid,
  p_list jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb; v_sort int := 0; v_keep uuid[] := '{}'; v_id uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 60 then
    raise exception 'up to 60 deliverables' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(p_list) loop
    v_sort := v_sort + 1;
    if d ? 'id' and (d ->> 'id') ~ '^[0-9a-f-]{36}$' then
      update public.project_deliverables set label = left(btrim(d ->> 'label'), 80), kind = d ->> 'kind',
        link_url = nullif(btrim(coalesce(d ->> 'link_url', '')), ''), sort = v_sort
        where id = (d ->> 'id')::uuid and project_id = p_project returning id into v_id;
    else
      insert into public.project_deliverables (project_id, label, kind, link_url, sort)
        values (p_project, left(btrim(d ->> 'label'), 80), d ->> 'kind',
          nullif(btrim(coalesce(d ->> 'link_url', '')), ''), v_sort)
        returning id into v_id;
    end if;
    if v_id is not null then v_keep := v_keep || v_id; end if;
  end loop;
  delete from public.project_deliverables where project_id = p_project and not (id = any (v_keep));
end $$;

create or replace function public.portal_admin_set_deliverable(p_secret text, p_actor text, p_id uuid,
  p_status text default null, p_add_round boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.project_deliverables%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into d from public.project_deliverables where id = p_id for update;
  if d.id is null then raise exception 'no such deliverable' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('editing', 'delivered', 'in_revision', 'approved') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  update public.project_deliverables set
    status = coalesce(p_status, status),
    rounds_allowed = rounds_allowed + case when p_add_round then 1 else 0 end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
    where id = p_id;
  if p_status is not null and p_status <> d.status then
    insert into public.project_events (project_id, kind, note, actor_name, by_admin)
      values (d.project_id, 'deliverable', d.label || ': ' || replace(p_status, '_', ' '), 'Milkywayy', true);
  end if;
  return jsonb_build_object('project', d.project_id, 'label', d.label, 'from', d.status, 'to', coalesce(p_status, d.status));
end $$;

-- Files for a deliverable go through the existing upload/link flow; this ties a file to it.
create or replace function public.portal_admin_file_deliverable(p_secret text, p_actor text, p_file uuid,
  p_deliverable uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.project_files f set deliverable_id = p_deliverable
    where f.id = p_file and (p_deliverable is null or exists (select 1 from public.project_deliverables d
      where d.id = p_deliverable and d.project_id = f.project_id));
end $$;

create or replace function public.portal_admin_deliverables(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return jsonb_build_object(
    'deliverables', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('revisions',
        coalesce((select jsonb_agg(to_jsonb(r) order by r.round) from public.deliverable_revisions r
          where r.deliverable_id = d.id), '[]'::jsonb)) order by d.sort)
      from public.project_deliverables d where d.project_id = p_project), '[]'::jsonb),
    'logged', coalesce((select jsonb_agg(to_jsonb(li) order by li.sort, li.created_at) from public.line_items li
      where li.project_id = p_project and li.logged), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'label', c.label, 'unit', c.unit,
        'amount', private.rate_on(p.account_id, c.key, coalesce(p.shoot_date, (now() at time zone 'Asia/Dubai')::date)))
        order by c.sort)
      from public.rate_card c, public.projects p where p.id = p_project), '[]'::jsonb));
end $$;

-- ---------- admin: inquiries ----------
create or replace function public.portal_admin_inquiries(p_secret text, p_actor text, p_status text default null,
  p_account uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.admin_unread desc, x.last_message_at desc) from (
    select q.id, q.subject, q.status, q.admin_unread, q.last_message_at, q.created_at, q.created_by_name,
      q.account_id, a.name as account_name, q.project_id, p.ref as project_ref, p.title as project_title,
      (select count(*) from public.inquiry_messages m where m.inquiry_id = q.id) as messages
    from public.inquiries q join public.accounts a on a.id = q.account_id
    left join public.projects p on p.id = q.project_id
    where (p_status is null or q.status = p_status) and (p_account is null or q.account_id = p_account)
    limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_inquiry(p_secret text, p_actor text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.inquiries set admin_unread = false where id = p_id and admin_unread;
  select to_jsonb(q) || jsonb_build_object('account_name', a.name, 'project_ref', p.ref, 'project_title', p.title,
      'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.at) from public.inquiry_messages m
        where m.inquiry_id = q.id), '[]'::jsonb))
    into v
  from public.inquiries q join public.accounts a on a.id = q.account_id
  left join public.projects p on p.id = q.project_id
  where q.id = p_id;
  return v;
end $$;

-- Our reply (optionally with a private link, e.g. raw footage on Google Drive). Returns who to email.
create or replace function public.portal_admin_reply_inquiry(p_secret text, p_actor text, p_id uuid, p_body text,
  p_link_url text default null, p_link_label text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.inquiries%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into q from public.inquiries where id = p_id for update;
  if q.id is null then raise exception 'no such inquiry' using errcode = '22023'; end if;
  if coalesce(length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'write the reply' using errcode = '22023';
  end if;
  if p_link_url is not null and btrim(p_link_url) <> '' and btrim(p_link_url) !~ '^https://\S+$' then
    raise exception 'the link must start with https://' using errcode = '22023';
  end if;
  insert into public.inquiry_messages (inquiry_id, author_name, is_admin, body, link_url, link_label)
    values (q.id, 'Milkywayy', true, btrim(p_body), nullif(btrim(coalesce(p_link_url, '')), ''),
      nullif(left(btrim(coalesce(p_link_label, '')), 80), ''));
  update public.inquiries set client_unread = true, admin_unread = false, last_message_at = now() where id = q.id;
  return jsonb_build_object('subject', q.subject, 'account', q.account_id, 'recipients', coalesce((
    select jsonb_agg(distinct jsonb_build_object('email', lower(coalesce(pr.email, u.email)), 'name', coalesce(pr.full_name, '')))
    from auth.users u left join public.profiles pr on pr.user_id = u.id
    where u.id = q.created_by and coalesce(pr.email, u.email) is not null
      and coalesce((pr.notification_prefs -> 'inquiry_reply' ->> 'email')::boolean, true)), '[]'::jsonb));
end $$;

create or replace function public.portal_admin_set_inquiry_status(p_secret text, p_actor text, p_id uuid,
  p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_status not in ('open', 'resolved') then raise exception 'unknown status' using errcode = '22023'; end if;
  update public.inquiries set status = p_status where id = p_id;
end $$;

-- ---------- privileges ----------
revoke all on function private.rate_on(uuid, text, date), private.budget_for(uuid, date),
  private.shows_budget(uuid), private.budget_month(uuid, date), private.check_attachment(uuid, jsonb),
  private.invoice_totals(jsonb), private.clean_lines(jsonb), private.month_label(date),
  private.new_draft(uuid, text, date, date, jsonb, date, text, uuid, boolean, numeric, text),
  private.month_end_lines(uuid, date, boolean), private.month_end_draft(uuid, date, boolean, text),
  private.publish_invoice(uuid, text), private.next_invoice_number()
  from public, anon, authenticated;

revoke all on function public.my_booking_options(uuid), public.book_shoot(uuid, date, text, jsonb, jsonb, text, numeric),
  public.request_deliverable_revision(uuid, text), public.approve_deliverable(uuid),
  public.create_inquiry(uuid, text, text, uuid, jsonb), public.reply_inquiry(uuid, text, jsonb),
  public.set_inquiry_status(uuid, text), public.read_inquiry(uuid) from public, anon;
grant execute on function public.my_booking_options(uuid), public.book_shoot(uuid, date, text, jsonb, jsonb, text, numeric),
  public.request_deliverable_revision(uuid, text), public.approve_deliverable(uuid),
  public.create_inquiry(uuid, text, text, uuid, jsonb), public.reply_inquiry(uuid, text, jsonb),
  public.set_inquiry_status(uuid, text), public.read_inquiry(uuid) to authenticated;

revoke all on function public.portal_admin_generate_drafts(text, text, date),
  public.portal_admin_approve_invoice(text, text, uuid, boolean), public.portal_admin_publish_due(text, text, date),
  public.portal_admin_save_draft(text, text, uuid, jsonb, text, date, text, text),
  public.portal_admin_refresh_draft(text, text, uuid), public.portal_admin_invoice_queue(text, text, text),
  public.portal_admin_invoice(text, text, uuid), public.portal_admin_set_budget(text, text, uuid, numeric, date, boolean),
  public.portal_admin_set_client_rate(text, text, uuid, text, numeric, date),
  public.portal_admin_set_billing_switches(text, text, uuid, boolean, text, boolean),
  public.portal_admin_billing_history(text, text, uuid), public.portal_admin_log_shoot(text, text, uuid, jsonb, jsonb),
  public.portal_admin_save_deliverables(text, text, uuid, jsonb), public.portal_admin_set_deliverable(text, text, uuid, text, boolean),
  public.portal_admin_file_deliverable(text, text, uuid, uuid), public.portal_admin_deliverables(text, text, uuid),
  public.portal_admin_inquiries(text, text, text, uuid), public.portal_admin_inquiry(text, text, uuid),
  public.portal_admin_reply_inquiry(text, text, uuid, text, text, text), public.portal_admin_set_inquiry_status(text, text, uuid, text)
  from public;
grant execute on function public.portal_admin_generate_drafts(text, text, date),
  public.portal_admin_approve_invoice(text, text, uuid, boolean), public.portal_admin_publish_due(text, text, date),
  public.portal_admin_save_draft(text, text, uuid, jsonb, text, date, text, text),
  public.portal_admin_refresh_draft(text, text, uuid), public.portal_admin_invoice_queue(text, text, text),
  public.portal_admin_invoice(text, text, uuid), public.portal_admin_set_budget(text, text, uuid, numeric, date, boolean),
  public.portal_admin_set_client_rate(text, text, uuid, text, numeric, date),
  public.portal_admin_set_billing_switches(text, text, uuid, boolean, text, boolean),
  public.portal_admin_billing_history(text, text, uuid), public.portal_admin_log_shoot(text, text, uuid, jsonb, jsonb),
  public.portal_admin_save_deliverables(text, text, uuid, jsonb), public.portal_admin_set_deliverable(text, text, uuid, text, boolean),
  public.portal_admin_file_deliverable(text, text, uuid, uuid), public.portal_admin_deliverables(text, text, uuid),
  public.portal_admin_inquiries(text, text, text, uuid), public.portal_admin_inquiry(text, text, uuid),
  public.portal_admin_reply_inquiry(text, text, uuid, text, text, text), public.portal_admin_set_inquiry_status(text, text, uuid, text)
  to anon, authenticated;

-- ---------- invoice settings and the PDF's data ----------
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
    invoice_prefix = coalesce(nullif(upper(btrim(p ->> 'invoice_prefix')), ''), invoice_prefix),
    next_invoice_no = coalesce((p ->> 'next_invoice_no')::int, next_invoice_no),
    default_due_days = coalesce((p ->> 'default_due_days')::int, default_due_days),
    company_name = case when p ? 'company_name' then nullif(btrim(p ->> 'company_name'), '') else company_name end,
    company_address = case when p ? 'company_address' then nullif(btrim(p ->> 'company_address'), '') else company_address end,
    company_trn = case when p ? 'company_trn' then nullif(btrim(p ->> 'company_trn'), '') else company_trn end,
    company_email = case when p ? 'company_email' then nullif(btrim(p ->> 'company_email'), '') else company_email end,
    updated_at = now()
  where id;
  insert into private.portal_admin_log (actor, action, detail) values (p_actor, 'update', 'Billing settings');
end $$;

-- Everything the invoice PDF prints, for the client's Owner/Admins and published invoices only.
create or replace function public.my_invoice_pdf(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  select * into i from public.invoices where id = p_invoice and status in ('due', 'paid', 'overdue');
  if i.id is null or coalesce(private.account_role(i.account_id), '') not in ('owner', 'admin') then
    raise exception 'not your invoice' using errcode = '42501';
  end if;
  return private.invoice_pdf_data(p_invoice);
end $$;

create or replace function private.invoice_pdf_data(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'stripe_session_id',
    'account', jsonb_build_object('name', a.name, 'trn', a.trn, 'billing_address', a.billing_address),
    'company', jsonb_build_object('name', s.company_name, 'address', s.company_address, 'trn', s.company_trn,
      'email', s.company_email, 'vat_registered', s.vat_registered),
    'bank', jsonb_build_object('account_name', s.bank_account_name, 'bank', s.bank_name, 'iban', s.bank_iban,
      'swift', s.bank_swift),
    'pays_online', private.pays_online(i.account_id))
  from public.invoices i join public.accounts a on a.id = i.account_id, public.billing_settings s
  where i.id = p_invoice and s.id
$$;

create or replace function public.portal_admin_invoice_pdf(p_secret text, p_actor text, p_invoice uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return private.invoice_pdf_data(p_invoice);
end $$;

revoke all on function private.invoice_pdf_data(uuid) from public, anon, authenticated;
revoke all on function public.my_invoice_pdf(uuid) from public, anon;
grant execute on function public.my_invoice_pdf(uuid) to authenticated;
revoke all on function public.portal_admin_invoice_pdf(text, text, uuid) from public;
grant execute on function public.portal_admin_invoice_pdf(text, text, uuid) to anon, authenticated;

-- Drafts and approved invoices only change through approval and publishing, never by status.
create or replace function public.portal_admin_set_invoice_status(p_secret text, p_actor text, p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  if i.status in ('draft', 'approved') or p_status not in ('due', 'paid', 'overdue') then
    raise exception 'approve and publish the draft first' using errcode = '22023';
  end if;
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
