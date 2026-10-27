-- Phase 1 part 10 (27 Oct 2026): invoices.
--  * The PDF follows who sees Billing: owners, admins and teammates with billing access (it was
--    owners and admins only, so a billing teammate saw the invoice but got "not your invoice").
--  * The PDF data leaves out Stripe ids and automatic-payment details.
-- Additive.
create or replace function public.my_invoice_pdf(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.invoices%rowtype;
begin
  select * into i from public.invoices where id = p_invoice and status in ('due', 'paid', 'overdue');
  if i.id is null or i.account_id not in (select private.my_billing_account_ids()) then
    raise exception 'not your invoice' using errcode = '42501';
  end if;
  return private.invoice_pdf_data(p_invoice);
end $$;

create or replace function private.invoice_pdf_data(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'stripe_session_id' - 'stripe_payment_intent' - 'autopay_attempts' - 'autopay_at'
      - 'autopay_error',
    'account', jsonb_build_object('name', a.name, 'trn', a.trn, 'billing_address', a.billing_address),
    'company', jsonb_build_object('name', s.company_name, 'address', s.company_address, 'trn', s.company_trn,
      'email', s.company_email, 'vat_registered', s.vat_registered),
    'bank', jsonb_build_object('account_name', s.bank_account_name, 'bank', s.bank_name, 'iban', s.bank_iban,
      'swift', s.bank_swift),
    'pays_online', private.pays_online(i.account_id))
  from public.invoices i join public.accounts a on a.id = i.account_id, public.billing_settings s
  where i.id = p_invoice and s.id
$$;

-- The admin invoice list's "Refunded" / "Part refunded": invoices with money given back.
create or replace function public.portal_admin_refunded_invoices(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_object_agg(i.id, i.refunded) from public.invoices i where i.refunded > 0),
    '{}'::jsonb);
end $$;
revoke all on function public.portal_admin_refunded_invoices(text, text) from public;
grant execute on function public.portal_admin_refunded_invoices(text, text) to anon, authenticated;
