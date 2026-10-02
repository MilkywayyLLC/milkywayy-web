-- Client portal: sign-in codes always in English.
--
-- Twilio Verify picks the message language from the country code (+971 → Arabic) and Supabase's
-- built-in Twilio Verify provider can't override it. So Supabase's Send SMS hook (the send-sms
-- Edge Function) sends each code itself through Twilio Verify with Locale=en and Supabase's own
-- code (Verify "custom code"). Supabase still creates and checks the code.
--
-- The hook isn't told whether the person chose WhatsApp or SMS, so our server records the choice
-- just before asking for a code, and the hook reads it. After a successful sign-in, the
-- otp-feedback Edge Function tells Twilio the code was used (required for custom codes).
-- Everything here is gated by PORTAL_HOOK_SECRET (hash under 'portal_hook').

create table private.otp_requests (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  channel text not null check (channel in ('whatsapp', 'sms')),
  requested_at timestamptz not null default now(),
  verification_sid text,
  sent_at timestamptz
);
revoke all on private.otp_requests from public, anon, authenticated;

create or replace function private.portal_hook_gate(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select sha256 into v_hash from private.app_secrets where name = 'portal_hook';
  if v_hash is null or v_hash <> encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke all on function private.portal_hook_gate(text) from public, anon, authenticated;

-- Our server, before asking Supabase for a code: which channel this number wants.
create or replace function public.portal_otp_intent(p_secret text, p_phone text, p_channel text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_hook_gate(p_secret);
  insert into private.otp_requests (phone, channel, requested_at)
    values (p_phone, p_channel, now())
    on conflict (phone) do update set channel = excluded.channel, requested_at = now(),
      verification_sid = null, sent_at = null;
end $$;

-- The send-sms hook: the channel to use (WhatsApp unless SMS was asked for in the last 10 minutes).
create or replace function public.portal_otp_channel(p_secret text, p_phone text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform private.portal_hook_gate(p_secret);
  select channel into v from private.otp_requests
    where phone = p_phone and requested_at > now() - interval '10 minutes';
  return coalesce(v, 'whatsapp');
end $$;

-- The send-sms hook, after Twilio accepted the code: remember the verification for feedback.
create or replace function public.portal_otp_sent(p_secret text, p_phone text, p_sid text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_hook_gate(p_secret);
  insert into private.otp_requests (phone, channel, verification_sid, sent_at)
    values (p_phone, 'whatsapp', p_sid, now())
    on conflict (phone) do update set verification_sid = excluded.verification_sid, sent_at = now();
end $$;

-- otp-feedback, after a successful sign-in: the verification to mark approved (once).
create or replace function public.portal_otp_used(p_secret text, p_phone text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform private.portal_hook_gate(p_secret);
  delete from private.otp_requests where phone = p_phone returning verification_sid into v;
  return v;
end $$;

revoke all on function public.portal_otp_intent(text, text, text), public.portal_otp_channel(text, text),
  public.portal_otp_sent(text, text, text), public.portal_otp_used(text, text) from public;
grant execute on function public.portal_otp_intent(text, text, text), public.portal_otp_channel(text, text),
  public.portal_otp_sent(text, text, text), public.portal_otp_used(text, text) to anon, authenticated;
