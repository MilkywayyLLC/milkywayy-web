-- Phase 1 part 1 (27 Oct 2026): a teammate without price access booked with no estimate (my_booking_options
-- hides rates from them), so no booking invoice was issued and month-end had nothing to bill. The server
-- now prices every booking with the company's rates through this gated function; the rates never reach
-- the teammate's browser. Additive only.

create or replace function public.portal_admin_account_rates(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Dubai')::date;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select jsonb_object_agg(r.key, private.rate_on(p_account, r.key, v_today))
    from public.rate_card r where r.grp is not null or r.key in ('reel', 'long_form'));
end $$;
revoke all on function public.portal_admin_account_rates(text, text, uuid) from public;
grant execute on function public.portal_admin_account_rates(text, text, uuid) to anon, authenticated;

-- Stores an estimate worked out on the server on a booking that has none (the backfill, and a booking
-- whose estimate failed). Never overwrites one.
create or replace function public.portal_admin_set_estimate(p_secret text, p_actor text, p_project uuid,
  p_estimate numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.projects set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{booking,estimate}', to_jsonb(p_estimate), true)
    where id = p_project and type = 'shoot' and meta ? 'booking'
      and nullif(meta -> 'booking' ->> 'estimate', '') is null;
  update public.projects set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('estimate', p_estimate)
    where id = p_project and type <> 'shoot' and nullif(meta ->> 'estimate', '') is null;
end $$;
revoke all on function public.portal_admin_set_estimate(text, text, uuid, numeric) from public;
grant execute on function public.portal_admin_set_estimate(text, text, uuid, numeric) to anon, authenticated;

-- The backfill's list: live bookings with no estimate, or on 50% / 100% terms with no booking invoice.
create or replace function public.portal_admin_unpriced_bookings(p_secret text, p_actor text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'ref', p.ref, 'account_id', p.account_id,
      'account', a.name, 'type', p.type, 'status', p.status, 'title', p.title,
      'services', p.meta -> 'booking' -> 'services', 'terms', private.booking_terms(p.account_id),
      'estimate', nullif(coalesce(p.meta -> 'booking' ->> 'estimate', p.meta ->> 'estimate'), '')::numeric,
      'has_invoice', exists (select 1 from public.invoices i where i.project_id = p.id and i.status <> 'void'))
      order by p.created_at)
    from public.projects p join public.accounts a on a.id = p.account_id
    where p.type = 'shoot' and p.status not in ('cancelled') and p.meta ? 'booking'
      and (nullif(p.meta -> 'booking' ->> 'estimate', '') is null
        or (private.booking_terms(p.account_id) in ('prepay', 'split') and p.status in ('requested', 'confirmed')
          and not exists (select 1 from public.invoices i where i.project_id = p.id and i.status <> 'void'))))
    , '[]'::jsonb);
end $$;
revoke all on function public.portal_admin_unpriced_bookings(text, text) from public;
grant execute on function public.portal_admin_unpriced_bookings(text, text) to anon, authenticated;
