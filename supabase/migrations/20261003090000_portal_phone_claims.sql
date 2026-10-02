-- Client portal, Phase 9 step 3: WhatsApp / SMS sign-in (Supabase phone auth via Twilio Verify).
--
-- Additive: replaces only the portal's own functions from 20261002200000_portal_accounts.sql.
-- A verified phone now counts like a verified email (CLIENT_PORTAL_GUIDE §3.2, §3.5):
--   * earlier website bookings whose phone matches attach on sign-in (claim via 'phone');
--   * invites sent to that number are accepted on sign-in.
-- Verified = auth.users.phone_confirmed_at is set, which only a correct code sets.

-- The caller's verified phone as E.164 (+971…), or null. auth.users stores it without the +.
create or replace function private.my_verified_phone() returns text
language sql stable security definer set search_path = '' as $$
  select '+' || u.phone from auth.users u
  where u.id = auth.uid() and coalesce(u.phone, '') <> '' and u.phone_confirmed_at is not null
$$;
revoke all on function private.my_verified_phone() from public, anon;
grant execute on function private.my_verified_phone() to authenticated;

create or replace function public.accept_my_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_phone text := private.my_verified_phone();
  v_n int := 0;
  r record;
begin
  if v_uid is null or (v_email is null and v_phone is null) then
    return 0;
  end if;
  for r in
    select * from public.account_invites
    where accepted_at is null
      and ((v_email is not null and email = v_email) or (v_phone is not null and phone_e164 = v_phone))
    order by created_at
    for update
  loop
    insert into public.account_members (account_id, user_id, role, invited_by)
      values (r.account_id, v_uid, r.role, r.invited_by)
      on conflict (account_id, user_id) do nothing;
    update public.account_invites set accepted_at = now(), accepted_by = v_uid where id = r.id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into public.profiles (user_id, email, phone_e164) values (v_uid, v_email, v_phone)
      on conflict (user_id) do update set
        email = coalesce(excluded.email, public.profiles.email),
        phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164);
  end if;
  return v_n;
end $$;

create or replace function public.claim_my_bookings(p_account uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.my_verified_email();
  v_phone text := private.my_verified_phone();
  v_account uuid := p_account;
  v_refs text[];
  v_pending int;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_email is null and v_phone is null then
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', 0);
  end if;
  if v_account is not null and private.account_role(v_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if v_account is null then
    select m.account_id into v_account from public.account_members m
    where m.user_id = v_uid
    order by (m.role = 'owner') desc, m.created_at
    limit 1;
  end if;

  if v_account is null then
    select count(*) into v_pending from public.leads l
    where ((v_email is not null and l.email = v_email) or (v_phone is not null and l.phone = v_phone))
      and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
      and not exists (select 1 from public.lead_claims c where c.lead_id = l.id);
    return jsonb_build_object('claimed', '[]'::jsonb, 'pending', v_pending);
  end if;

  with claimed as (
    insert into public.lead_claims (lead_id, account_id, claimed_by, via)
    select l.id, v_account, v_uid,
      case when v_email is not null and l.email = v_email then 'email' else 'phone' end
    from public.leads l
    where ((v_email is not null and l.email = v_email) or (v_phone is not null and l.phone = v_phone))
      and l.type = 'property'
      and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
    on conflict (lead_id) do nothing
    returning lead_id
  )
  select coalesce(array_agg(l.ref order by l.created_at), '{}') into v_refs
  from claimed c join public.leads l on l.id = c.lead_id;

  return jsonb_build_object('claimed', to_jsonb(v_refs), 'pending', 0, 'account', v_account);
end $$;

revoke all on function public.accept_my_invites(), public.claim_my_bookings(uuid) from public, anon;
grant execute on function public.accept_my_invites(), public.claim_my_bookings(uuid) to authenticated;

-- Phone matches on leads.phone (E.164, constrained since booking_lines). An index keeps the
-- claim fast as leads grow; leads.email gets one too (both are new indexes, nothing altered).
create index if not exists leads_phone_idx on public.leads (phone) where phone is not null;
create index if not exists leads_email_idx on public.leads (email) where email is not null;
