-- Book media (owner, 18 Oct 2026): members without price access on a monthly package also get
-- what's left of each inclusion this month, as counts only (no amounts), so the booking page can
-- say "Included in your package" / "Extra charges apply". Rates and amounts stay owner/admin/billing
-- only, unchanged. Applied to the dev project only.
create or replace function public.my_booking_options(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.account_role(p_account); pl public.account_plans%rowtype; a public.accounts%rowtype;
  v_today date := (now() at time zone 'Asia/Dubai')::date; v_mode text; v_money boolean; v_pm jsonb;
begin
  if v_role is null then raise exception 'not a member of that account' using errcode = '42501'; end if;
  select * into pl from public.account_plans where account_id = p_account;
  select * into a from public.accounts where id = p_account;
  v_mode := coalesce(pl.mode, 'payg');
  v_money := v_role in ('owner', 'admin')
    or exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing'));
  if v_mode = 'package' then v_pm := private.plan_view(p_account); end if;
  return jsonb_build_object(
    'can_book', private.sees_area(p_account, 'shoot') and a.svc_production,
    'services', jsonb_build_object('production', a.svc_production, 'post', a.svc_post, 'avatars', a.svc_avatars),
    'mode', v_mode,
    'currency', a.currency,
    'sees_prices', v_money,
    'show_amount', v_money and (v_mode = 'payg' or private.shows_budget(p_account)),
    'rates', (case when v_money then (select jsonb_object_agg(r.key, private.rate_on(p_account, r.key, v_today))
      from public.rate_card r where r.grp is not null or r.key in ('reel', 'long_form')) end),
    -- Package clients: what's left of each inclusion this month (counts only; everyone who books).
    'left', (case when v_pm is not null then (select jsonb_object_agg(u ->> 'key', jsonb_build_object(
        'qty', (u ->> 'qty')::numeric, 'remaining', (u ->> 'remaining')::numeric))
      from jsonb_array_elements(v_pm -> 'usage') u) end));
end $$;
