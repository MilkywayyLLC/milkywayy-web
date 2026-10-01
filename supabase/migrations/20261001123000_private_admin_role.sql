-- Security advisor: admin_role() (SECURITY DEFINER) was callable over the API as an RPC.
-- Move it into a schema the API doesn't expose; the policy helpers call it from there.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admins where email = lower(auth.jwt() ->> 'email')
$$;
revoke all on function private.admin_role() from public;
grant execute on function private.admin_role() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$ select private.admin_role() is not null $$;
create or replace function public.is_owner() returns boolean
language sql stable set search_path = public as $$ select private.admin_role() = 'owner' $$;

drop function public.admin_role();
