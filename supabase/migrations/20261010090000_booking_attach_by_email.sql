-- Website bookings join the portal account of their email (owner, 3 Oct 2026).
-- The portal is email-only: a booking made with an email that already belongs to a portal user
-- (confirmed email) attaches to their account straight away, signed in or not. With no such user,
-- nothing changes: claim_my_bookings() attaches it the first time they sign in with that email.
-- Called by the website's server with LEAD_SECRET (it can only attach, never read). Additive.

create or replace function public.attach_booking_by_email(p_secret text, p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_lead uuid; v_email text; v_user uuid; v_account uuid;
begin
  select sha256 into v_hash from private.app_secrets where name = 'lead';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select l.id, lower(l.email) into v_lead, v_email from public.leads l
  where l.ref = p_ref and l.type = 'property' and l.created_at > now() - interval '1 hour'
    and exists (select 1 from public.booking_properties b where b.lead_id = l.id)
    and not exists (select 1 from public.lead_claims c where c.lead_id = l.id);
  if v_lead is null or coalesce(v_email, '') = '' then
    return false;
  end if;
  select u.id into v_user from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null
  limit 1;
  if v_user is null then
    return false;
  end if;
  -- Their own account first (Owner), else the account they joined first.
  select m.account_id into v_account from public.account_members m
  where m.user_id = v_user
  order by (m.role = 'owner') desc, m.created_at
  limit 1;
  if v_account is null then
    return false;
  end if;
  insert into public.lead_claims (lead_id, account_id, claimed_by, via)
    values (v_lead, v_account, v_user, 'email')
  on conflict (lead_id) do nothing;
  perform private.sync_booking_projects(v_lead);
  perform private.link_claimed_projects();
  return true;
end $$;
revoke all on function public.attach_booking_by_email(text, text) from public, authenticated;
grant execute on function public.attach_booking_by_email(text, text) to anon;
