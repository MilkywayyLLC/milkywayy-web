-- DEV PROJECT ONLY (milkywayy-portal-dev). Never apply to production: this file is deliberately
-- outside supabase/migrations/.
--
-- Test helpers for the portal tests, which run without a service-role key:
-- create confirmed or unconfirmed users, add website bookings, and clean up after a run.
-- Gated by E2E_PORTAL_SECRET (SHA-256 under 'e2e' in private.app_secrets) and, even with the
-- secret, limited to e2e-portal-…@example.com addresses.
--
-- Apply: paste into the SQL editor of the dev project, with the hash filled in:
--   insert into private.app_secrets (name, sha256) values ('e2e', '<sha256 of E2E_PORTAL_SECRET>')
--   on conflict (name) do update set sha256 = excluded.sha256, updated_at = now();

create or replace function private.e2e_gate(p_secret text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select sha256 into v_hash from private.app_secrets where name = 'e2e';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_email is not null and p_email !~ '^e2e-portal-[a-z0-9-]+@example\.com$' then
    raise exception 'test addresses only' using errcode = '42501';
  end if;
end $$;
revoke all on function private.e2e_gate(text, text) from public, anon, authenticated;

-- A user who can sign in with email + password; confirmed = email verified.
create or replace function public.e2e_create_user(p_secret text, p_email text, p_password text, p_confirmed boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  perform private.e2e_gate(p_secret, p_email);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    case when p_confirmed then now() end,
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', p_confirmed),
    'email', now(), now(), now());
  return v_id;
end $$;

-- Marks a test user's email as verified (what clicking the confirmation link does).
create or replace function public.e2e_confirm_email(p_secret text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, p_email);
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = p_email;
end $$;

-- A website booking (property lead with one property line), as submit_lead() would save it.
create or replace function public.e2e_add_booking(p_secret text, p_email text, p_type text default 'property')
returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text := 'MW-' || nextval('public.lead_ref_seq');
begin
  perform private.e2e_gate(p_secret, p_email);
  insert into public.leads (ref, type, name, email, data)
    values (v_ref, p_type, 'E2E portal', p_email, '{"test": true}') returning id into v_id;
  if p_type = 'property' then
    insert into public.booking_properties (lead_id, line_no, property_type, size_index, size_label,
      services, area, building, unit, shoot_date, slot, subtotal)
    values (v_id, 1, 'apartment', 2, '2 Bed', array['photo', 'short'], 'Dubai Marina', 'Marina Gate 1',
      '2304', current_date + 7, 'Morning', 1050);
  end if;
  return v_ref;
end $$;

-- Deletes every test user, account and booking whose address starts with p_prefix.
create or replace function public.e2e_cleanup(p_secret text, p_prefix text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.e2e_gate(p_secret, null);
  if p_prefix !~ '^e2e-portal-[a-z0-9-]+$' then
    raise exception 'test prefix only' using errcode = '42501';
  end if;
  delete from public.accounts a where a.created_by in (select id from auth.users where email like p_prefix || '%');
  delete from public.leads where email like p_prefix || '%';
  delete from auth.users where email like p_prefix || '%';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.e2e_create_user(text, text, text, boolean), public.e2e_confirm_email(text, text),
  public.e2e_add_booking(text, text, text), public.e2e_cleanup(text, text) from public, authenticated;
grant execute on function public.e2e_create_user(text, text, text, boolean), public.e2e_confirm_email(text, text),
  public.e2e_add_booking(text, text, text), public.e2e_cleanup(text, text) to anon;

-- ---------- phone sign-in (step 3) ----------
-- Only Supabase's test numbers (Authentication → Phone → Test Phone Numbers and OTPs), which
-- never reach Twilio: +971 50 000 000x.
create or replace function private.e2e_phone_gate(p_secret text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, null);
  if p_phone !~ '^\+97150000000[0-9]$' then
    raise exception 'test numbers only' using errcode = '42501';
  end if;
end $$;
revoke all on function private.e2e_phone_gate(text, text) from public, anon, authenticated;

-- A website booking made with this phone number (no email). Returns its ref.
create or replace function public.e2e_add_phone_booking(p_secret text, p_phone text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text := 'MW-' || nextval('public.lead_ref_seq');
begin
  perform private.e2e_phone_gate(p_secret, p_phone);
  insert into public.leads (ref, type, name, phone, data)
    values (v_ref, 'property', 'E2E portal phone', p_phone, '{"test": true}') returning id into v_id;
  insert into public.booking_properties (lead_id, line_no, property_type, size_index, size_label,
    services, area, building, unit, shoot_date, slot, subtotal)
  values (v_id, 1, 'villa', 3, '4 Bed', array['photo'], 'Arabian Ranches', 'Savannah', '17',
    current_date + 3, 'Evening', 1400);
  return v_ref;
end $$;

-- Removes the test number's user, its accounts and its bookings.
create or replace function public.e2e_cleanup_phone(p_secret text, p_phone text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.e2e_phone_gate(p_secret, p_phone);
  delete from public.accounts a where a.created_by in (select id from auth.users where phone = substr(p_phone, 2));
  delete from public.account_invites where phone_e164 = p_phone;
  delete from public.leads where phone = p_phone;
  delete from auth.users where phone = substr(p_phone, 2);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.e2e_add_phone_booking(text, text), public.e2e_cleanup_phone(text, text)
  from public, authenticated;
grant execute on function public.e2e_add_phone_booking(text, text), public.e2e_cleanup_phone(text, text) to anon;

-- ---------- step 6: admin-created clients have no creator; find them by their invites ----------
create or replace function public.e2e_cleanup(p_secret text, p_prefix text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.e2e_gate(p_secret, null);
  if p_prefix !~ '^e2e-portal-[a-z0-9-]+$' then
    raise exception 'test prefix only' using errcode = '42501';
  end if;
  delete from public.accounts a where a.created_by in (select id from auth.users where email like p_prefix || '%')
    or exists (select 1 from public.account_invites i where i.account_id = a.id and i.email like p_prefix || '%');
  delete from public.leads where email like p_prefix || '%';
  delete from auth.users where email like p_prefix || '%';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.e2e_cleanup(text, text) from public, authenticated;
grant execute on function public.e2e_cleanup(text, text) to anon;

-- ---------- email codes (sign-in by code, 3 Oct 2026) ----------
-- Test addresses may also be Resend's test inbox (delivered+e2e-portal-…@resend.dev), which
-- accepts mail without delivering it, so the "send a code" step can run once Resend is the mailer.
create or replace function private.e2e_gate(p_secret text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select sha256 into v_hash from private.app_secrets where name = 'e2e';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_email is not null
    and p_email !~ '^e2e-portal-[a-z0-9-]+@example\.com$'
    and p_email !~ '^delivered\+e2e-portal-[a-z0-9-]+@resend\.dev$' then
    raise exception 'test addresses only' using errcode = '42501';
  end if;
end $$;
revoke all on function private.e2e_gate(text, text) from public, anon, authenticated;

-- Sets a known sign-in code for a test user (what Supabase stores: sha224(email || code)).
create or replace function public.e2e_email_code(p_secret text, p_email text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, p_email);
  update auth.users
    set recovery_token = encode(extensions.digest(lower(p_email) || p_code, 'sha224'), 'hex'),
        recovery_sent_at = now()
    where email = lower(p_email);
end $$;
revoke all on function public.e2e_email_code(text, text, text) from public, authenticated;
grant execute on function public.e2e_email_code(text, text, text) to anon;

create or replace function public.e2e_cleanup(p_secret text, p_prefix text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.e2e_gate(p_secret, null);
  if p_prefix !~ '^e2e-portal-[a-z0-9-]+$' then
    raise exception 'test prefix only' using errcode = '42501';
  end if;
  delete from public.accounts a
    where a.created_by in (select id from auth.users where email like p_prefix || '%' or email like 'delivered+' || p_prefix || '%')
    or exists (select 1 from public.account_invites i where i.account_id = a.id and i.email like p_prefix || '%');
  delete from public.leads where email like p_prefix || '%' or email like 'delivered+' || p_prefix || '%';
  delete from auth.users where email like p_prefix || '%' or email like 'delivered+' || p_prefix || '%';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.e2e_cleanup(text, text) from public, authenticated;
grant execute on function public.e2e_cleanup(text, text) to anon;

-- ---------- Phase 10: unclaimed booking projects have no account; remove them by their lead ----------
-- (e2e_cleanup and e2e_cleanup_phone gain a first line:)
--   delete from public.projects where lead_id in (select id from public.leads where email like …);
--   delete from public.projects where lead_id in (select id from public.leads where phone = p_phone);
-- Applied to the dev project as migration dev_portal_e2e_cleanup_projects.

-- ---------- Phase 10: a WhatsApp number on a test booking (admin WhatsApp-link test) ----------
-- Applied to the dev project as migration dev_portal_e2e_lead_phone.
create or replace function public.e2e_set_lead_phone(p_secret text, p_ref text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, null);
  if p_phone !~ '^\+97150000000[0-9]$' then
    raise exception 'test numbers only' using errcode = '42501';
  end if;
  update public.leads set phone = p_phone where ref = p_ref and email like 'e2e-portal-%';
end $$;
revoke all on function public.e2e_set_lead_phone(text, text, text) from public, authenticated;
grant execute on function public.e2e_set_lead_phone(text, text, text) to anon;

-- ---------- Phase 11: a test WhatsApp number on a test user's profile ----------
-- Applied to the dev project as migration dev_portal_e2e_profile_phone.
create or replace function public.e2e_set_profile_phone(p_secret text, p_email text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, p_email);
  if p_phone !~ '^\+97150000000[0-9]$' then
    raise exception 'test numbers only' using errcode = '42501';
  end if;
  update public.profiles set phone_e164 = p_phone
    where user_id = (select id from auth.users where email = lower(p_email));
end $$;
revoke all on function public.e2e_set_profile_phone(text, text, text) from public, authenticated;
grant execute on function public.e2e_set_profile_phone(text, text, text) to anon;

-- ---------- Phase 12: back-date a test project's delivery (billing tests) ----------
-- Applied to the dev project as migration dev_portal_e2e_backdate_delivery.
create or replace function public.e2e_backdate_delivery(p_secret text, p_project uuid, p_months int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := now() - make_interval(months => p_months);
begin
  perform private.e2e_gate(p_secret, null);
  if not exists (select 1 from public.projects p join public.account_members m on m.account_id = p.account_id
      join auth.users u on u.id = m.user_id where p.id = p_project and u.email like 'e2e-portal-%') then
    raise exception 'test projects only' using errcode = '42501';
  end if;
  update public.projects set delivered_at = v_at where id = p_project;
  update public.line_items set delivered_month = private.dubai_month(v_at) where project_id = p_project;
end $$;
revoke all on function public.e2e_backdate_delivery(text, uuid, int) from public, authenticated;
grant execute on function public.e2e_backdate_delivery(text, uuid, int) to anon;

-- Phase 13: an old share-link slug pointing at a test listing (what the Phase 14 import would add).
-- Applied to the dev project as migration dev_portal_e2e_share_alias.
create or replace function public.e2e_share_alias(p_secret text, p_slug text, p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, null);
  if not exists (select 1 from public.listings l join public.account_members m on m.account_id = l.account_id
      join auth.users u on u.id = m.user_id where l.id = p_listing and u.email like 'e2e-portal-%') then
    raise exception 'test listings only' using errcode = '42501';
  end if;
  insert into public.share_aliases (kind, slug, listing_id, source) values ('l', p_slug, p_listing, 'e2e')
    on conflict (kind, slug) do update set listing_id = excluded.listing_id;
end $$;
revoke all on function public.e2e_share_alias(text, text, uuid) from public, authenticated;
grant execute on function public.e2e_share_alias(text, text, uuid) to anon;

-- Billing (calendar months): put a test project's delivery on an exact date (and its line items
-- in that month). Applied to the dev project as migration dev_portal_e2e_set_delivered_at.
create or replace function public.e2e_set_delivered_at(p_secret text, p_project uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.e2e_gate(p_secret, null);
  if not exists (select 1 from public.projects p join public.account_members m on m.account_id = p.account_id
      join auth.users u on u.id = m.user_id where p.id = p_project and u.email like 'e2e-portal-%') then
    raise exception 'test projects only' using errcode = '42501';
  end if;
  update public.projects set delivered_at = p_at where id = p_project;
  update public.line_items set delivered_month = private.dubai_month(p_at) where project_id = p_project;
end $$;
revoke all on function public.e2e_set_delivered_at(text, uuid, timestamptz) from public, authenticated;
grant execute on function public.e2e_set_delivered_at(text, uuid, timestamptz) to anon;
