-- Issued invoices keep the details they were issued with (owner, 2 Nov 2026). The PDF used to read the
-- client's and our company details live, so a later rename or new TRN rewrote old invoices, paid ones too.
-- A trigger freezes them when an invoice leaves draft/approved, whichever path issues it. Drafts stay live.
-- Bank details stay live on purpose: an unpaid invoice should show the account to pay today.

alter table public.invoices add column if not exists issued_details jsonb;

create or replace function private.invoice_live_details(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account', jsonb_build_object('name', a.name, 'trn', a.trn, 'billing_address', a.billing_address),
    'company', jsonb_build_object('name', s.company_name, 'address', s.company_address, 'trn', s.company_trn,
      'email', s.company_email, 'vat_registered', s.vat_registered))
  from public.accounts a, public.billing_settings s
  where a.id = p_account and s.id
$$;
revoke all on function private.invoice_live_details(uuid) from public, anon, authenticated;

create or replace function private.invoice_freeze_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.issued_details is not null then
    new.issued_details := old.issued_details;
  elsif new.status in ('draft', 'approved') then
    new.issued_details := null;
  else
    new.issued_details := private.invoice_live_details(new.account_id);
  end if;
  return new;
end $$;
revoke all on function private.invoice_freeze_details() from public, anon, authenticated;

drop trigger if exists invoices_freeze_details on public.invoices;
create trigger invoices_freeze_details before insert or update on public.invoices
  for each row execute function private.invoice_freeze_details();

-- Already issued: today's details are the best record we have. Only issued_details changes, so the
-- triggers on status don't fire.
update public.invoices set issued_details = private.invoice_live_details(account_id)
  where status not in ('draft', 'approved') and issued_details is null;

-- 'current' is for statements, which are new documents and show today's details.
create or replace function private.invoice_pdf_data(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'stripe_session_id' - 'stripe_payment_intent' - 'autopay_attempts' - 'autopay_at'
      - 'autopay_error' - 'issued_details',
    'account', coalesce(i.issued_details, private.invoice_live_details(i.account_id)) -> 'account',
    'company', coalesce(i.issued_details, private.invoice_live_details(i.account_id)) -> 'company',
    'current', private.invoice_live_details(i.account_id),
    'bank', jsonb_build_object('account_name', s.bank_account_name, 'bank', s.bank_name, 'iban', s.bank_iban,
      'swift', s.bank_swift),
    'pays_online', private.pays_online(i.account_id))
  from public.invoices i, public.billing_settings s
  where i.id = p_invoice and s.id
$$;
