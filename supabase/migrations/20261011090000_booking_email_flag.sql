-- Bookings attached by email while signed out (owner, 3 Oct 2026): flagged, so the admin confirms
-- them before trusting them, and the client sees "Requested — we'll confirm on WhatsApp" until the
-- status changes. The claim records how it happened (via 'booking-email'); the lead (data) and its
-- projects (meta) carry attached_by_email = true. Additive.

alter table public.lead_claims drop constraint lead_claims_via_check;
alter table public.lead_claims add constraint lead_claims_via_check
  check (via in ('email', 'phone', 'signed-in', 'admin', 'booking-email'));

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
    values (v_lead, v_account, v_user, 'booking-email')
  on conflict (lead_id) do nothing;
  perform private.sync_booking_projects(v_lead);
  perform private.link_claimed_projects();
  -- Flag it where the admin and the client look: the lead and its projects.
  update public.leads set data = data || jsonb_build_object('attached_by_email', true,
      'attached_account', (select name from public.accounts where id = v_account))
    where id = v_lead;
  update public.projects set meta = meta || '{"attached_by_email": true}'::jsonb where lead_id = v_lead;
  return true;
end $$;
