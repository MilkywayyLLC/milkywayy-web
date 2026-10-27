-- Phase 1 part 12 (27 Oct 2026): how the creator's brand shows in the share page header.
--   logo       the logo alone
--   icon_name  the logo small, with the name
--   name       the name alone
-- Null keeps what pages did before (logo and name, whichever exist). Additive.
alter table public.accounts add column if not exists brand_layout text
  check (brand_layout in ('logo', 'icon_name', 'name'));
grant update (brand_layout) on public.accounts to authenticated;

create or replace function private.share_brand(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', coalesce(a.brand_name, case when a.type = 'company' then a.name end),
    'logo', a.brand_logo_key, 'layout', a.brand_layout)
  from public.accounts a where a.id = p_account
$$;
