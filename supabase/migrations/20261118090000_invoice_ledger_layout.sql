-- The invoice PDF in the Milkywayy Ledger layout (owner, 2 Nov 2026). Layout only: no totals, statuses or
-- numbering change. New: licence no., phone, bank account no. and a signature in Business & billing, the
-- client's contact name for "Attn", and each line's date for its sub-line.

alter table public.billing_settings
  add column if not exists company_licence text check (length(company_licence) <= 60),
  add column if not exists company_phone text check (length(company_phone) <= 40),
  add column if not exists bank_account_no text check (length(bank_account_no) <= 34),
  add column if not exists signature_key text;

-- From the Ledger template (MW-CH-02112026-001); editable in Business & billing. The signature is uploaded there.
update public.billing_settings set
  company_licence = coalesce(company_licence, '2538077.01'),
  company_phone = coalesce(company_phone, '+971 50 726 3306'),
  bank_account_no = coalesce(bank_account_no, '9050203284')
where id;

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
    next_invoice_no = coalesce((p ->> 'next_invoice_no')::int, next_invoice_no),
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

-- Freezes with the rest on issue. Invoices already issued keep their snapshot as it is, so they show no
-- licence, phone, Attn or signature. "Attn" is the account owner, unless that's just the account's own name.
create or replace function private.invoice_live_details(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account', jsonb_build_object('name', a.name, 'trn', a.trn, 'billing_address', a.billing_address,
      'attn', (select nullif(nullif(btrim(pr.full_name), ''), a.name)
        from public.account_members m join public.profiles pr on pr.user_id = m.user_id
        where m.account_id = a.id and m.role = 'owner' order by m.created_at limit 1)),
    'company', jsonb_build_object('name', s.company_name, 'address', s.company_address, 'trn', s.company_trn,
      'email', s.company_email, 'vat_registered', s.vat_registered, 'licence', s.company_licence,
      'phone', s.company_phone, 'signature_key', s.signature_key))
  from public.accounts a, public.billing_settings s
  where a.id = p_account and s.id
$$;
revoke all on function private.invoice_live_details(uuid) from public, anon, authenticated;

-- 'line_dates': line item id -> the date of the work, for the line's sub-line. Bank details stay live.
create or replace function private.invoice_pdf_data(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'stripe_session_id' - 'stripe_payment_intent' - 'autopay_attempts' - 'autopay_at'
      - 'autopay_error' - 'issued_details',
    'account', coalesce(i.issued_details, private.invoice_live_details(i.account_id)) -> 'account',
    'company', coalesce(i.issued_details, private.invoice_live_details(i.account_id)) -> 'company',
    'current', private.invoice_live_details(i.account_id),
    'bank', jsonb_build_object('account_name', s.bank_account_name, 'bank', s.bank_name,
      'account_no', s.bank_account_no, 'iban', s.bank_iban, 'swift', s.bank_swift),
    'line_dates', (select coalesce(jsonb_object_agg(li.id, coalesce(li.service_date, p.shoot_date)), '{}'::jsonb)
      from public.line_items li left join public.projects p on p.id = li.project_id
      where coalesce(li.service_date, p.shoot_date) is not null
        and li.id::text in (select l ->> 'line_item_id' from jsonb_array_elements(i.lines) l)),
    'pays_online', private.pays_online(i.account_id))
  from public.invoices i, public.billing_settings s
  where i.id = p_invoice and s.id
$$;
