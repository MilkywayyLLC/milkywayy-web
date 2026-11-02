-- Invoice numbers never repeat, and the portal shows an invoice's period (owner, 2 Nov 2026).
-- The counter had gone back from 1018 to 1001, so INV-1001 was issued a second time. Only a Billing settings
-- save can lower it, so now it can only go up. It also skips any number already on an invoice (typed ones
-- too), whichever client has it, void included.

-- Past every number used so far, including deleted test invoices, which only the admin log remembers.
update public.billing_settings s set next_invoice_no = greatest(s.next_invoice_no, 1 + coalesce((
  select max(n) from (
    select substring(i.number from '^' || s.invoice_prefix || '(\d{1,9})$')::int as n from public.invoices i
    union all
    select substring(l.detail from '^Invoice ' || s.invoice_prefix || '(\d{1,9}) published$')::int
      from private.portal_admin_log l
  ) used
), 0))
where s.id;

-- One number, one invoice, across all clients.
create unique index invoices_number_once on public.invoices (number) where number is not null;

create or replace function private.next_invoice_number() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.billing_settings%rowtype; v text;
begin
  loop
    update public.billing_settings set next_invoice_no = next_invoice_no + 1 where id returning * into s;
    v := s.invoice_prefix || (s.next_invoice_no - 1);
    exit when not exists (select 1 from public.invoices where number = v);
  end loop;
  return v;
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
    bank_account_no = case when p ? 'bank_account_no' then nullif(btrim(p ->> 'bank_account_no'), '') else bank_account_no end,
    bank_iban = case when p ? 'bank_iban' then nullif(upper(replace(p ->> 'bank_iban', ' ', '')), '') else bank_iban end,
    bank_swift = case when p ? 'bank_swift' then nullif(upper(replace(p ->> 'bank_swift', ' ', '')), '') else bank_swift end,
    invoice_prefix = coalesce(nullif(upper(btrim(p ->> 'invoice_prefix')), ''), invoice_prefix),
    next_invoice_no = greatest(coalesce((p ->> 'next_invoice_no')::int, next_invoice_no), next_invoice_no),
    default_due_days = coalesce((p ->> 'default_due_days')::int, default_due_days),
    company_name = case when p ? 'company_name' then nullif(btrim(p ->> 'company_name'), '') else company_name end,
    company_address = case when p ? 'company_address' then nullif(btrim(p ->> 'company_address'), '') else company_address end,
    company_trn = case when p ? 'company_trn' then nullif(btrim(p ->> 'company_trn'), '') else company_trn end,
    company_email = case when p ? 'company_email' then nullif(btrim(p ->> 'company_email'), '') else company_email end,
    company_licence = case when p ? 'company_licence' then nullif(btrim(p ->> 'company_licence'), '') else company_licence end,
    company_phone = case when p ? 'company_phone' then nullif(btrim(p ->> 'company_phone'), '') else company_phone end,
    signature_key = case when p ? 'signature_key' then nullif(btrim(p ->> 'signature_key'), '') else signature_key end,
    updated_at = now()
  where id;
  insert into private.portal_admin_log (actor, action, detail) values (p_actor, 'update', 'Billing settings');
end $$;

-- The bank card shows the account number too: some UAE banks use it for local transfers.
create or replace function private.bank_details() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce(btrim(s.bank_iban), '') = '' and coalesce(btrim(s.bank_name), '') = ''
      and coalesce(btrim(s.bank_account_name), '') = '' and coalesce(btrim(s.bank_swift), '') = ''
      and coalesce(btrim(s.bank_account_no), '') = '' then null
    else jsonb_build_object('account_name', nullif(btrim(s.bank_account_name), ''), 'bank', nullif(btrim(s.bank_name), ''),
      'account_no', nullif(btrim(s.bank_account_no), ''),
      'iban', nullif(btrim(s.bank_iban), ''), 'swift', nullif(btrim(s.bank_swift), '')) end
  from public.billing_settings s where s.id
$$;

-- Checkout: the invoice's period and booking refs.
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
    'unpaid', i.status in ('due', 'overdue'), 'payment_state', i.payment_state, 'reject_reason', i.reject_reason,
    'due_on', i.due_on, 'period_start', i.period_start,
    'refs', (select coalesce(jsonb_agg(distinct pr.ref), '[]'::jsonb) from public.projects pr
      where pr.id = i.project_id or pr.id in (select li.project_id from public.line_items li where li.billed_invoice_id = i.id)),
    'stripe_session_id', i.stripe_session_id, 'billing', coalesce(v_billing, false),
    'bank_transfer', (select bank_transfer from public.accounts where id = i.account_id),
    'payment_options', (select payment_options from public.accounts where id = i.account_id),
    'bank', private.bank_details(),
    'customer_id', (select customer_id from private.stripe_customers where account_id = i.account_id),
    'project', case when p.id is null then null else jsonb_build_object('id', p.id, 'ref', p.ref, 'type', p.type,
      'title', p.title, 'status', p.status, 'shoot_date', p.shoot_date,
      'start_time', p.meta -> 'booking' ->> 'start_time', 'estimate', private.booking_value(p.id)) end);
end $$;

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
        'status', i.status, 'due_on', i.due_on, 'period_start', i.period_start, 'payment_state', i.payment_state,
        'refs', (select coalesce(jsonb_agg(distinct pr.ref), '[]'::jsonb) from public.projects pr
          where pr.id = i.project_id or pr.id in (select li.project_id from public.line_items li where li.billed_invoice_id = i.id))
      ) order by i.due_on, i.number), '[]'::jsonb) from public.invoices i where i.id = any (b.invoice_ids)));
end $$;

-- Billing emails name the period; every email path looks it up here.
create or replace function public.portal_admin_invoice_period(p_secret text, p_actor text, p_account uuid, p_number text)
returns date
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select period_start from public.invoices where account_id = p_account and number = p_number);
end $$;
revoke all on function public.portal_admin_invoice_period(text, text, uuid, text) from public;
grant execute on function public.portal_admin_invoice_period(text, text, uuid, text) to anon, authenticated;

-- A booking's Payment panel names the invoice's period too.
create or replace function public.my_project_payment(p_project uuid)
returns jsonb
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
        'payment_state', i.payment_state, 'period_start', i.period_start) order by i.created_at)
      from public.invoices i where i.project_id = p.id and i.stage is not null and i.status in ('due', 'paid', 'overdue')), '[]'::jsonb) end,
    'refunds', case when v_money then coalesce((select jsonb_agg(jsonb_build_object('amount', r.amount,
        'currency', r.currency, 'method', r.method, 'status', r.status) order by r.created_at)
      from public.refunds r where r.project_id = p.id), '[]'::jsonb) end);
end $$;
