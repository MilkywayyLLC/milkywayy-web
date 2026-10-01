-- The booking message is built before the ref exists; submit_lead swaps {{REF}} for the issued
-- ref inside the lead's data, so the saved WhatsApp message is exactly what the visitor sends.
create or replace function public.submit_lead(
  p_secret text,
  p_lead jsonb,
  p_ip_hash text,
  p_limit int default 6,
  p_window_minutes int default 10
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_fp text;
  v_ref text;
  v_recent int;
begin
  select sha256 into v_hash from private.app_secrets where name = 'lead';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_lead ->> 'type' not in ('production', 'property', 'post', 'avatars', 'contact', 'free-test') then
    raise exception 'unknown lead type' using errcode = '22023';
  end if;
  if length(p_lead::text) > 60000 then
    raise exception 'lead too large' using errcode = '22023';
  end if;

  v_fp := encode(extensions.digest(coalesce(p_ip_hash, '') || (p_lead - 'utm' - 'referrer')::text, 'sha256'), 'hex');
  select ref into v_ref from public.leads
    where fingerprint = v_fp and created_at > now() - interval '2 minutes'
    order by created_at desc limit 1;
  if v_ref is not null then
    return jsonb_build_object('ref', v_ref, 'duplicate', true);
  end if;

  select count(*) into v_recent from public.leads
    where ip_hash = p_ip_hash and created_at > now() - make_interval(mins => p_window_minutes);
  if v_recent >= p_limit then
    return jsonb_build_object('rate_limited', true);
  end if;

  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.leads (ref, type, name, company, phone, email, preferred_reply, data, page, utm, referrer, ip_hash, fingerprint)
  values (
    v_ref,
    p_lead ->> 'type',
    left(nullif(p_lead ->> 'name', ''), 120),
    left(nullif(p_lead ->> 'company', ''), 120),
    left(nullif(p_lead ->> 'phone', ''), 40),
    left(nullif(lower(p_lead ->> 'email'), ''), 200),
    left(nullif(p_lead ->> 'preferred_reply', ''), 20),
    replace(coalesce(p_lead -> 'data', '{}')::text, '{{REF}}', v_ref)::jsonb,
    left(nullif(p_lead ->> 'page', ''), 200),
    coalesce(p_lead -> 'utm', '{}'),
    left(nullif(p_lead ->> 'referrer', ''), 500),
    p_ip_hash,
    v_fp
  );
  return jsonb_build_object('ref', v_ref);
end $$;
