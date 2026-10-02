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
