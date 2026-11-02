-- Billing fix round (2 Nov 2026). Additive only: new columns, tables and functions; nothing dropped.
--  1. Nothing is delivered unbilled: Delivered/Completed needs the charges logged (or "as booked"
--     confirmed), and the invoice draft fires on Completed as well as Delivered.
--  2. Projects flagged "Paid outside the portal" (and past projects) are never billed.
--  3. End-of-month clients on "one per delivery": the invoice is due on the last day of the month.
--  4. Per-client "Payment options" (card + bank transfer by default).
--  5. Pay all: one Stripe Checkout over several due invoices.
--  6. Admin: "Delivered but not logged", booking refs on the invoice queue, test accounts.

-- ---------- 4. payment options ----------
alter table public.accounts
  add column if not exists payment_options text not null default 'both'
  check (payment_options in ('both', 'card', 'bank'));
alter table public.accounts alter column pay_online set default true;
-- Every existing client starts on card + bank transfer.
update public.accounts set payment_options = 'both', bank_transfer = true, pay_online = true;

create or replace function public.portal_admin_set_payment_options(p_secret text, p_actor text, p_account uuid, p_options text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if p_options not in ('both', 'card', 'bank') then
    raise exception 'unknown payment option' using errcode = '22023';
  end if;
  -- The older switches follow, so everything that still reads them agrees.
  update public.accounts set payment_options = p_options,
    bank_transfer = p_options <> 'card', pay_online = p_options <> 'bank'
    where id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Payment options: ' || p_options);
end $$;

create or replace function public.my_payment_options(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(private.account_role(p_account), '') in ('owner', 'admin')
      or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
        and private.member_can(m.role, m.access, 'billing'))) then
    return null;
  end if;
  return jsonb_build_object(
    'bank_transfer', (select bank_transfer from public.accounts where id = p_account),
    'payment_options', (select payment_options from public.accounts where id = p_account),
    'card', (select case when c.pm_id is null then null else jsonb_build_object('brand', c.brand, 'last4', c.last4,
        'exp', c.exp) end from private.stripe_customers c where c.account_id = p_account),
    'autopay', coalesce((select c.autopay and c.pm_id is not null from private.stripe_customers c
      where c.account_id = p_account), false),
    'failed', (select jsonb_agg(jsonb_build_object('number', i.number, 'error', i.autopay_error))
      from public.invoices i where i.account_id = p_account and i.status in ('due', 'overdue') and i.autopay_error is not null));
end $$;

-- The pay page's view of an invoice: now with the payment options and our bank details (Business & billing).
create or replace function private.bank_details() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce(btrim(s.bank_iban), '') = '' and coalesce(btrim(s.bank_name), '') = ''
      and coalesce(btrim(s.bank_account_name), '') = '' and coalesce(btrim(s.bank_swift), '') = '' then null
    else jsonb_build_object('account_name', nullif(btrim(s.bank_account_name), ''), 'bank', nullif(btrim(s.bank_name), ''),
      'iban', nullif(btrim(s.bank_iban), ''), 'swift', nullif(btrim(s.bank_swift), '')) end
  from public.billing_settings s where s.id
$$;
revoke all on function private.bank_details() from public, anon, authenticated;

create or replace function public.portal_admin_pay_view(p_secret text, p_actor text, p_invoice uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i public.invoices%rowtype; p public.projects%rowtype; v_billing boolean; v_booker boolean;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_invoice and status in ('due', 'overdue', 'paid');
  if i.id is null then return null; end if;
  select * into p from public.projects where id = i.project_id;
  select coalesce(m.role in ('owner', 'admin') or private.member_can(m.role, m.access, 'billing'), false)
    into v_billing from public.account_members m where m.account_id = i.account_id and m.user_id = p_user;
  v_booker := p.id is not null and i.stage in ('full', 'deposit')
    and exists (select 1 from public.account_members m where m.account_id = i.account_id and m.user_id = p_user)
    and coalesce(p.requested_by, p.created_by) = p_user;
  if not coalesce(v_billing, false) and not v_booker then return null; end if;
  return jsonb_build_object('id', i.id, 'account_id', i.account_id, 'account', (select name from public.accounts where id = i.account_id),
    'number', i.number, 'amount', i.amount, 'currency', i.currency, 'status', i.status, 'stage', i.stage,
    'unpaid', i.status in ('due', 'overdue'), 'payment_state', i.payment_state, 'reject_reason', i.reject_reason,
    'due_on', i.due_on,
    'stripe_session_id', i.stripe_session_id, 'billing', coalesce(v_billing, false),
    'bank_transfer', (select bank_transfer from public.accounts where id = i.account_id),
    'payment_options', (select payment_options from public.accounts where id = i.account_id),
    'bank', private.bank_details(),
    'customer_id', (select customer_id from private.stripe_customers where account_id = i.account_id),
    'project', case when p.id is null then null else jsonb_build_object('id', p.id, 'ref', p.ref, 'type', p.type,
      'title', p.title, 'status', p.status, 'shoot_date', p.shoot_date,
      'start_time', p.meta -> 'booking' ->> 'start_time', 'estimate', private.booking_value(p.id)) end);
end $$;

-- ---------- 2. paid outside the portal ----------
alter table public.projects add column if not exists paid_outside boolean not null default false;
-- MW-1757 was settled outside the portal and must never be charged.
update public.projects set paid_outside = true where ref = 'MW-1757';

create or replace function private.billing_exempt(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p.paid_outside, false) or coalesce(p.meta ->> 'past', '') = 'true'
  from public.projects p where p.id = p_project
$$;
revoke all on function private.billing_exempt(uuid) from public, anon, authenticated;

create or replace function public.portal_admin_set_paid_outside(p_secret text, p_actor text, p_project uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'no such project' using errcode = '22023'; end if;
  if p_on and exists (select 1 from public.line_items where project_id = p_project and billed_invoice_id is not null) then
    raise exception 'it is already on an invoice' using errcode = '22023';
  end if;
  update public.projects set paid_outside = p_on where id = p_project;
  if p_on then delete from public.line_items where project_id = p_project and billed_invoice_id is null; end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || case when p_on then 'paid outside the portal' else 'billable again' end);
end $$;

-- An exempt project never gets charges.
create or replace function private.no_charges_when_exempt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and private.billing_exempt(new.project_id) then
    raise exception 'paid outside the portal: it is not billed' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists line_items_exempt on public.line_items;
create trigger line_items_exempt before insert on public.line_items
  for each row execute function private.no_charges_when_exempt();
revoke all on function private.no_charges_when_exempt() from public, anon, authenticated;

-- ---------- 1. no unbilled deliveries ----------
create or replace function private.needs_logged_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('delivered', 'completed') and old.status not in ('delivered', 'completed', 'cancelled')
      and new.account_id is not null and not private.billing_exempt(new.id)
      and not exists (select 1 from public.line_items where project_id = new.id)
      and not exists (select 1 from public.shoot_confirmations where project_id = new.id) then
    raise exception 'add the charges first: log what we shot before it is delivered' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists projects_need_log on public.projects;
create trigger projects_need_log before update of status on public.projects
  for each row execute function private.needs_logged_work();
revoke all on function private.needs_logged_work() from public, anon, authenticated;

-- ---------- 1 + 3. the draft fires on Delivered or Completed; month-end clients are due at month end ----------
create or replace function private.project_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_lines jsonb; v_basis numeric; v_mode text; v_paid numeric; v_value numeric;
  v_split boolean; v_items jsonb; v_inv jsonb; v_draft uuid;
begin
  if new.status not in ('delivered', 'completed') or old.status in ('delivered', 'completed')
      or new.account_id is null or private.billing_exempt(new.id) then return new; end if;
  select * into a from public.accounts where id = new.account_id;
  select mode into v_mode from public.account_plans where account_id = new.account_id;
  if exists (select 1 from public.invoices where project_id = new.id and stage in ('full', 'deposit') and status <> 'void') then
    if exists (select 1 from public.invoices where project_id = new.id and status <> 'void'
        and (stage = 'balance' or (category = 'booking' and stage is null))) then
      return new;
    end if;
    select coalesce(sum(subtotal), 0), bool_or(stage = 'deposit') into v_paid, v_split
      from public.invoices where project_id = new.id and stage in ('full', 'deposit', 'adjustment') and status <> 'void';
    v_value := private.booking_value(new.id);
    select coalesce(jsonb_agg(jsonb_build_object('line_item_id', li.id)), '[]'::jsonb) into v_items
      from public.line_items li where li.project_id = new.id and li.billed_invoice_id is null;
    if round(v_value - v_paid, 2) > 0 then
      v_lines := jsonb_build_array(jsonb_build_object('description', (case when v_split then 'Balance' else 'Additional work' end)
        || ' · ' || new.ref || ' · ' || new.title
        || ' (' || to_char(v_value, 'FM999,999,990.00') || ' less ' || to_char(v_paid, 'FM999,999,990.00') || ' invoiced)',
        'qty', 1, 'unit_price', round(v_value - v_paid, 2)));
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
  v_draft := private.new_draft(new.account_id, case when new.type = 'shoot' then 'property' else 'one_off' end,
    (now() at time zone 'Asia/Dubai')::date, null, v_lines, null, 'system', new.id, false, v_basis,
    new.ref || ' · ' || new.title);
  -- End of month: each delivery's invoice falls due on the last day of the month it was delivered.
  if a.payment_terms = 'month_end' then
    update public.invoices
      set due_on = (date_trunc('month', now() at time zone 'Asia/Dubai') + interval '1 month' - interval '1 day')::date
      where id = v_draft;
  end if;
  return new;
end $$;

-- ---------- 6. admin: delivered but not logged ----------
create or replace function public.portal_admin_unlogged_deliveries(p_secret text, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(row_to_json(x) order by x.at desc) from (
    select p.id, p.ref, p.type, p.title, p.status, a.name as account_name,
      coalesce(p.delivered_at, p.completed_at, p.updated_at) as at
    from public.projects p join public.accounts a on a.id = p.account_id
    where p.status in ('delivered', 'completed') and not private.billing_exempt(p.id)
      and not exists (select 1 from public.line_items li where li.project_id = p.id)
      and not exists (select 1 from public.shoot_confirmations c where c.project_id = p.id)
    limit 100) x), '[]'::jsonb);
end $$;

-- ---------- 6. invoice queue: booking refs; test accounts can have invoices deleted ----------
alter table public.accounts add column if not exists is_test boolean not null default false;

create or replace function public.portal_admin_set_test_account(p_secret text, p_actor text, p_account uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set is_test = p_on where id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Test account ' || case when p_on then 'on' else 'off' end);
end $$;

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

-- Drafts (and approved-not-yet-published) can always go; anything else only on a test account.
create or replace function public.portal_admin_delete_invoice(p_secret text, p_actor text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; v_test boolean;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_id;
  if i.id is null then return null; end if;
  select is_test into v_test from public.accounts where id = i.account_id;
  if i.status not in ('draft', 'approved') and not coalesce(v_test, false) then
    raise exception 'only drafts can be deleted; cancel an issued invoice instead' using errcode = '22023';
  end if;
  update public.line_items set billed_invoice_id = null where billed_invoice_id = p_id;
  delete from public.invoices where id = p_id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || coalesce(i.number, 'draft') || ' deleted');
  return i.pdf_key;
end $$;

-- ---------- 5. pay all: one Checkout over several due invoices ----------
create table if not exists public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  invoice_ids uuid[] not null,
  amount numeric not null,
  currency text not null,
  stripe_session_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.payment_batches enable row level security;

create or replace function private.batch_view(p_batch uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.payment_batches%rowtype; v_billing boolean;
begin
  select * into b from public.payment_batches where id = p_batch;
  if b.id is null then return null; end if;
  select coalesce(m.role in ('owner', 'admin') or private.member_can(m.role, m.access, 'billing'), false)
    into v_billing from public.account_members m where m.account_id = b.account_id and m.user_id = p_user;
  if not coalesce(v_billing, false) then return null; end if;
  return jsonb_build_object('id', b.id, 'account_id', b.account_id,
    'account', (select name from public.accounts where id = b.account_id),
    'currency', b.currency, 'amount', b.amount,
    'unpaid', exists (select 1 from public.invoices where id = any (b.invoice_ids) and status in ('due', 'overdue')),
    'payment_options', (select payment_options from public.accounts where id = b.account_id),
    'bank', private.bank_details(),
    'customer_id', (select customer_id from private.stripe_customers where account_id = b.account_id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'amount', i.amount,
        'status', i.status, 'due_on', i.due_on, 'payment_state', i.payment_state,
        'refs', (select coalesce(jsonb_agg(distinct pr.ref), '[]'::jsonb) from public.projects pr
          where pr.id = i.project_id or pr.id in (select li.project_id from public.line_items li where li.billed_invoice_id = i.id))
      ) order by i.due_on, i.number), '[]'::jsonb) from public.invoices i where i.id = any (b.invoice_ids)));
end $$;
revoke all on function private.batch_view(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_admin_batch_create(p_secret text, p_actor text, p_user uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int; v_accounts int; v_cur int; v_acc uuid; v_amt numeric; v_curr text; v_id uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select count(*), count(distinct account_id), count(distinct currency), min(account_id::text)::uuid, sum(amount), min(currency)
    into v_n, v_accounts, v_cur, v_acc, v_amt, v_curr
    from public.invoices where id = any (p_ids) and status in ('due', 'overdue') and coalesce(payment_state, '') <> 'submitted';
  if v_n = 0 or v_n <> cardinality(p_ids) then
    raise exception 'some of those invoices are paid or already submitted' using errcode = '22023';
  end if;
  if v_accounts <> 1 or v_cur <> 1 then
    raise exception 'pay one company and currency at a time' using errcode = '22023';
  end if;
  insert into public.payment_batches (account_id, invoice_ids, amount, currency, created_by)
    values (v_acc, p_ids, v_amt, v_curr, p_user) returning id into v_id;
  return private.batch_view(v_id, p_user);
end $$;

create or replace function public.portal_admin_batch_view(p_secret text, p_actor text, p_batch uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return private.batch_view(p_batch, p_user);
end $$;

create or replace function public.portal_admin_set_batch_session(p_secret text, p_actor text, p_batch uuid, p_session text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.payment_batches set stripe_session_id = p_session where id = p_batch and paid_at is null;
end $$;

create or replace function public.portal_admin_batch_paid(p_secret text, p_actor text, p_batch uuid, p_session text,
  p_amount_minor bigint, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.payment_batches%rowtype; i public.invoices%rowtype; v_out jsonb := '[]'::jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into b from public.payment_batches where id = p_batch for update;
  if b.id is null then raise exception 'no such payment' using errcode = '22023'; end if;
  if b.stripe_session_id is distinct from p_session then raise exception 'session mismatch' using errcode = '22023'; end if;
  if round(b.amount * 100) <> p_amount_minor or lower(b.currency) <> lower(p_currency) then
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  for i in select * from public.invoices where id = any (b.invoice_ids) order by due_on, number for update loop
    if i.status = 'paid' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('already', true, 'account', i.account_id, 'recipients', '[]'::jsonb));
      continue;
    end if;
    update public.invoices set status = 'paid', paid_at = now(), paid_via = 'stripe', payment_state = null where id = i.id;
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ' paid by card (Stripe, pay all)');
    v_out := v_out || jsonb_build_array(jsonb_build_object('already', false, 'account', i.account_id, 'number', i.number,
      'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on,
      'project_id', case when i.stage in ('full', 'deposit') then i.project_id end,
      'recipients', private.billing_recipients(i.account_id, 'payment_received')));
  end loop;
  update public.payment_batches set paid_at = coalesce(paid_at, now()) where id = b.id;
  return jsonb_build_object('results', v_out);
end $$;
