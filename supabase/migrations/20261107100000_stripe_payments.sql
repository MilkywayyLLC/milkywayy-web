-- Phase 1 parts 2–3 (27 Oct 2026): Stripe as the primary gateway, checkout on our site, saved cards and
-- automatic month-end payments, bank transfer as a per-client option, "Pending confirmation" after
-- payment (no auto-confirm), admin time proposals, and teammates sending a booking to the company for
-- payment. Additive only: new columns default to today's behaviour, new functions, one trigger body
-- replaced (a paid booking no longer confirms itself).

-- ---------- columns ----------
-- Bank transfer + receipt upload: on by default (today's behaviour); the admin can switch it off per client.
alter table public.accounts add column if not exists bank_transfer boolean not null default true;

alter table public.invoices add column if not exists stripe_payment_intent text
  check (length(stripe_payment_intent) <= 200);
alter table public.invoices add column if not exists autopay_attempts int not null default 0;
alter table public.invoices add column if not exists autopay_at timestamptz;
alter table public.invoices add column if not exists autopay_error text check (length(autopay_error) <= 300);

-- The company's Stripe customer and its saved card (one per account). Server only: clients read the
-- brand / last 4 through my_payment_options, never the ids.
create table if not exists private.stripe_customers (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  customer_id text not null,
  pm_id text,
  brand text,
  last4 text,
  exp text,
  autopay boolean not null default false,
  autopay_by text,
  updated_at timestamptz not null default now()
);
revoke all on private.stripe_customers from public, anon, authenticated;

-- ---------- a paid booking waits for Milkywayy to confirm ----------
-- Before: a paid full/deposit invoice confirmed the shoot. Now it stays Requested ("Pending
-- confirmation" in the portal) and the admin confirms it, or proposes another time.
create or replace function private.invoice_paid_confirms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  if new.status <> 'paid' or old.status = 'paid' or new.project_id is null or new.stage not in ('full', 'deposit') then
    return new;
  end if;
  select * into p from public.projects where id = new.project_id for update;
  if p.type = 'shoot' and p.status = 'requested' then
    update public.projects set meta = (coalesce(meta, '{}'::jsonb) - 'pay_by') || jsonb_build_object('paid_at', now())
      where id = p.id;
    insert into public.project_events (project_id, kind, note, actor_name, by_admin)
      values (p.id, 'note', 'Paid (' || new.number || '). Waiting for Milkywayy to confirm the date and time.',
        'Milkywayy', true);
  end if;
  return new;
end $$;

-- ---------- paying an invoice on our site ----------
-- Who may pay it: billing people of the account, or (a booking invoice) the teammate who booked it.
create or replace function public.portal_admin_pay_view(p_secret text, p_actor text, p_invoice uuid, p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    'unpaid', i.status in ('due', 'overdue'), 'payment_state', i.payment_state,
    'stripe_session_id', i.stripe_session_id, 'billing', coalesce(v_billing, false),
    'bank_transfer', (select bank_transfer from public.accounts where id = i.account_id),
    'customer_id', (select customer_id from private.stripe_customers where account_id = i.account_id),
    'project', case when p.id is null then null else jsonb_build_object('id', p.id, 'ref', p.ref, 'type', p.type,
      'title', p.title, 'status', p.status, 'shoot_date', p.shoot_date,
      'start_time', p.meta -> 'booking' ->> 'start_time', 'estimate', private.booking_value(p.id)) end);
end $$;

create or replace function public.portal_admin_set_payment_intent(p_secret text, p_actor text, p_invoice uuid, p_pi text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.invoices set stripe_payment_intent = p_pi where id = p_invoice and status <> 'paid';
end $$;

-- A PaymentIntent (saved card, automatic payment) paid an invoice: same checks as a Checkout session.
create or replace function public.portal_admin_stripe_pi_paid(p_secret text, p_actor text, p_invoice uuid,
  p_pi text, p_amount_minor bigint, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null then raise exception 'no such invoice' using errcode = '22023'; end if;
  if i.stripe_payment_intent is distinct from p_pi then raise exception 'intent mismatch' using errcode = '22023'; end if;
  if round(i.amount * 100) <> p_amount_minor or lower(i.currency) <> lower(p_currency) then
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  if i.status = 'paid' then
    return jsonb_build_object('already', true, 'account', i.account_id, 'recipients', '[]'::jsonb);
  end if;
  update public.invoices set status = 'paid', paid_at = now(), paid_via = 'stripe', payment_state = null,
    autopay_error = null where id = i.id;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || i.number || ' paid by card (Stripe, saved card)');
  return jsonb_build_object('already', false, 'account', i.account_id, 'number', i.number,
    'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on,
    'project_id', case when i.stage in ('full', 'deposit') then i.project_id end,
    'recipients', private.billing_recipients(i.account_id, 'payment_received'));
end $$;

-- ---------- saved card and automatic payments ----------
create or replace function public.portal_admin_stripe_customer(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select jsonb_build_object('customer_id', c.customer_id, 'pm_id', c.pm_id, 'brand', c.brand,
      'last4', c.last4, 'exp', c.exp, 'autopay', c.autopay, 'autopay_by', c.autopay_by)
    from private.stripe_customers c where c.account_id = p_account);
end $$;

-- p: {customer_id?, pm_id?, brand?, last4?, exp?, autopay?, by?, clear_card?}
create or replace function public.portal_admin_set_stripe_customer(p_secret text, p_actor text, p_account uuid, p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  -- Only a payload with a customer id can create the row (NOT NULL is checked before ON CONFLICT).
  if p ->> 'customer_id' is not null then
    insert into private.stripe_customers (account_id, customer_id)
      values (p_account, p ->> 'customer_id')
      on conflict (account_id) do nothing;
  end if;
  update private.stripe_customers set
    customer_id = coalesce(p ->> 'customer_id', customer_id),
    pm_id = case when (p ->> 'clear_card')::boolean then null else coalesce(p ->> 'pm_id', pm_id) end,
    brand = case when (p ->> 'clear_card')::boolean then null else coalesce(p ->> 'brand', brand) end,
    last4 = case when (p ->> 'clear_card')::boolean then null else coalesce(p ->> 'last4', last4) end,
    exp = case when (p ->> 'clear_card')::boolean then null else coalesce(p ->> 'exp', exp) end,
    autopay = case when (p ->> 'clear_card')::boolean then false else coalesce((p ->> 'autopay')::boolean, autopay) end,
    autopay_by = case when p ? 'autopay' then p ->> 'by' else autopay_by end,
    updated_at = now()
  where account_id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, case
      when (p ->> 'clear_card')::boolean then 'Saved card removed'
      when p ? 'pm_id' then 'Card saved'
      when p ? 'autopay' then 'Automatic payments ' || case when (p ->> 'autopay')::boolean then 'on' else 'off' end
      else 'Stripe customer' end);
end $$;

-- The client's Billing page: how they can pay (billing people only). No Stripe ids.
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
    'card', (select case when c.pm_id is null then null else jsonb_build_object('brand', c.brand, 'last4', c.last4,
        'exp', c.exp) end from private.stripe_customers c where c.account_id = p_account),
    'autopay', coalesce((select c.autopay and c.pm_id is not null from private.stripe_customers c
      where c.account_id = p_account), false),
    'failed', (select jsonb_agg(jsonb_build_object('number', i.number, 'error', i.autopay_error))
      from public.invoices i where i.account_id = p_account and i.status in ('due', 'overdue') and i.autopay_error is not null));
end $$;
revoke all on function public.my_payment_options(uuid) from public, anon;
grant execute on function public.my_payment_options(uuid) to authenticated;

-- Month-end invoices to charge now: autopay on with a card, published and due, not a booking invoice,
-- at most 3 tries a day apart.
create or replace function public.portal_admin_autopay_due(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'account', i.account_id, 'number', i.number,
      'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on, 'customer_id', c.customer_id, 'pm_id', c.pm_id,
      'attempts', i.autopay_attempts))
    from public.invoices i join private.stripe_customers c on c.account_id = i.account_id
    where c.autopay and c.pm_id is not null and i.status in ('due', 'overdue') and i.stage is null
      and i.number is not null and i.amount > 0 and coalesce(i.payment_state, '') <> 'submitted'
      and i.due_on <= (now() at time zone 'Asia/Dubai')::date and i.autopay_attempts < 3
      and (i.autopay_at is null or i.autopay_at < now() - interval '20 hours')), '[]'::jsonb);
end $$;

create or replace function public.portal_admin_autopay_result(p_secret text, p_actor text, p_invoice uuid,
  p_pi text, p_error text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.invoices set autopay_attempts = autopay_attempts + 1, autopay_at = now(),
      stripe_payment_intent = coalesce(p_pi, stripe_payment_intent), autopay_error = left(p_error, 300)
    where id = p_invoice returning * into i;
  if p_error is not null then
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'update', i.account_id, 'Automatic payment failed for ' || i.number || ': ' || left(p_error, 200));
  end if;
  return jsonb_build_object('account', i.account_id, 'number', i.number, 'amount', i.amount, 'currency', i.currency,
    'due_on', i.due_on, 'attempts', i.autopay_attempts,
    'recipients', private.billing_recipients(i.account_id, 'invoice_issued'));
end $$;

create or replace function public.portal_admin_set_bank_transfer(p_secret text, p_actor text, p_account uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.accounts set bank_transfer = p_on where id = p_account;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p_account, 'Bank transfer ' || case when p_on then 'allowed' else 'off' end);
end $$;

-- ---------- Milkywayy proposes another time; the client accepts or declines ----------
create or replace function public.portal_admin_propose_time(p_secret text, p_actor text, p_project uuid,
  p_date date, p_start text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null or p.type <> 'shoot' or p.status not in ('requested', 'confirmed') then
    raise exception 'can''t be changed' using errcode = '22023';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'bad time' using errcode = '22023'; end if;
  update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('proposal',
      jsonb_build_object('date', p_date, 'start_time', p_start, 'note', nullif(btrim(coalesce(p_note, '')), ''),
        'at', now(), 'was_date', p.shoot_date, 'was_start', p.meta -> 'booking' ->> 'start_time'))
    where id = p.id;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p.id, 'note', 'New time proposed: ' || to_char(p_date, 'Dy DD Mon') || ' · ' || p_start
      || coalesce('. ' || nullif(btrim(coalesce(p_note, '')), ''), ''), 'Milkywayy', true);
  return jsonb_build_object('ref', p.ref, 'title', p.title, 'account', p.account_id,
    'recipients', private.event_recipients(p.id, 'booking_confirmed'));
end $$;

create or replace function public.portal_admin_accept_proposal(p_secret text, p_actor text, p_project uuid, p_by text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  v := p.meta -> 'proposal';
  if p.id is null or v is null or p.status not in ('requested', 'confirmed') then
    raise exception 'no proposal' using errcode = '22023';
  end if;
  update public.projects set shoot_date = (v ->> 'date')::date, status = 'confirmed',
      meta = jsonb_set(coalesce(meta, '{}'::jsonb) - 'proposal', '{booking,start_time}', to_jsonb(v ->> 'start_time'), true)
    where id = p.id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name, by_admin)
    values (p.id, 'status', p.status, 'confirmed', 'Accepted the new time: ' || to_char((v ->> 'date')::date, 'Dy DD Mon')
      || ' · ' || (v ->> 'start_time'), coalesce(p_by, 'Client'), false);
  return jsonb_build_object('ref', p.ref, 'title', p.title, 'date', v ->> 'date', 'start_time', v ->> 'start_time');
end $$;

-- ---------- a teammate sends a booking to the company for payment ----------
create or replace function public.portal_admin_send_to_company(p_secret text, p_actor text, p_project uuid,
  p_user uuid, p_by text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; i public.invoices%rowtype;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_project for update;
  if p.id is null or coalesce(p.requested_by, p.created_by) is distinct from p_user then
    raise exception 'not yours' using errcode = '42501';
  end if;
  select * into i from public.invoices where project_id = p.id and stage in ('full', 'deposit')
    and status in ('due', 'overdue') order by created_at desc limit 1;
  if i.id is null then raise exception 'nothing to pay' using errcode = '22023'; end if;
  update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('pay_by', 'company')
    where id = p.id;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p.id, 'note', 'Sent to the company for payment (' || i.number || ')', coalesce(p_by, 'Teammate'), false);
  return jsonb_build_object('ref', p.ref, 'title', p.title, 'account', p.account_id,
    'account_name', (select name from public.accounts where id = p.account_id),
    'number', i.number, 'amount', i.amount, 'currency', i.currency, 'due_on', i.due_on,
    'recipients', private.billing_recipients(p.account_id, 'invoice_issued'));
end $$;

revoke all on function public.portal_admin_pay_view(text, text, uuid, uuid),
  public.portal_admin_set_payment_intent(text, text, uuid, text),
  public.portal_admin_stripe_pi_paid(text, text, uuid, text, bigint, text),
  public.portal_admin_stripe_customer(text, text, uuid),
  public.portal_admin_set_stripe_customer(text, text, uuid, jsonb),
  public.portal_admin_autopay_due(text, text),
  public.portal_admin_autopay_result(text, text, uuid, text, text),
  public.portal_admin_set_bank_transfer(text, text, uuid, boolean),
  public.portal_admin_propose_time(text, text, uuid, date, text, text),
  public.portal_admin_accept_proposal(text, text, uuid, text),
  public.portal_admin_send_to_company(text, text, uuid, uuid, text) from public;
grant execute on function public.portal_admin_pay_view(text, text, uuid, uuid),
  public.portal_admin_set_payment_intent(text, text, uuid, text),
  public.portal_admin_stripe_pi_paid(text, text, uuid, text, bigint, text),
  public.portal_admin_stripe_customer(text, text, uuid),
  public.portal_admin_set_stripe_customer(text, text, uuid, jsonb),
  public.portal_admin_autopay_due(text, text),
  public.portal_admin_autopay_result(text, text, uuid, text, text),
  public.portal_admin_set_bank_transfer(text, text, uuid, boolean),
  public.portal_admin_propose_time(text, text, uuid, date, text, text),
  public.portal_admin_accept_proposal(text, text, uuid, text),
  public.portal_admin_send_to_company(text, text, uuid, uuid, text) to anon, authenticated;
