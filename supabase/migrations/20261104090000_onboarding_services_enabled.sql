-- Services ticked at sign-up are enabled (owner, 24 Oct 2026).
-- create_my_account() and portal_admin_create_client() stored the ticks only as services_interest, so a
-- client who ticked Post-production or AI avatars still got svc_post / svc_avatars = false. Property
-- shoots and Production are one service (svc_production, default true), so that one never turns off.
-- Additive: a trigger covers both creation paths, then a one-off backfill. Nothing is ever switched off.

create or replace function private.accounts_services_from_interest() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.svc_production := new.svc_production or 'production' = any (new.services_interest)
    or 'shoots' = any (new.services_interest);
  new.svc_post := new.svc_post or 'post' = any (new.services_interest);
  new.svc_avatars := new.svc_avatars or 'avatars' = any (new.services_interest);
  return new;
end $$;
revoke all on function private.accounts_services_from_interest() from public, anon, authenticated;

create trigger accounts_services_from_interest before insert on public.accounts
  for each row execute function private.accounts_services_from_interest();

-- Backfill existing accounts from their onboarding answers.
update public.accounts set
  svc_production = svc_production or 'production' = any (services_interest) or 'shoots' = any (services_interest),
  svc_post = svc_post or 'post' = any (services_interest),
  svc_avatars = svc_avatars or 'avatars' = any (services_interest)
where (not svc_production and ('production' = any (services_interest) or 'shoots' = any (services_interest)))
   or (not svc_post and 'post' = any (services_interest))
   or (not svc_avatars and 'avatars' = any (services_interest));
