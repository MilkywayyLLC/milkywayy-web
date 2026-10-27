-- Admin redesign (27 Oct 2026), additive only. `invoices.paid_at` already exists and is set by the
-- Stripe webhook (`paid_at = now()`), Mark as paid (`coalesce(paid_at, now())`) and a confirmed
-- bank receipt. This makes sure the column is there, backfills any paid invoice without a time
-- (its confirmed receipt, else when it was created), and adds a read-only revenue total for
-- Admin → Today. No existing function or relationship changes.

alter table public.invoices add column if not exists paid_at timestamptz;

update public.invoices i set paid_at = coalesce(
    (select max(coalesce(p.decided_at, p.submitted_at)) from public.payment_proofs p
      where p.invoice_id = i.id and p.status = 'confirmed'),
    i.created_at)
  where i.status = 'paid' and i.paid_at is null;

create index if not exists invoices_paid_at_idx on public.invoices (paid_at) where status = 'paid';

-- Revenue for a Dubai calendar month (default: this month): paid invoices by currency, with what
-- was refunded on them. Owner admin only (the portal admin gate).
create or replace function public.portal_admin_revenue(p_secret text, p_actor text,
  p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Dubai')::date))::date;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((
    select jsonb_agg(jsonb_build_object('currency', x.currency, 'total', x.total,
        'refunded', x.refunded, 'count', x.n) order by x.currency)
    from (
      select i.currency, sum(i.amount) as total, sum(coalesce(i.refunded, 0)) as refunded,
        count(*) as n
      from public.invoices i
      where i.status = 'paid'
        and (i.paid_at at time zone 'Asia/Dubai')::date >= v_from
        and (i.paid_at at time zone 'Asia/Dubai')::date < (v_from + interval '1 month')::date
      group by i.currency
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.portal_admin_revenue(text, text, date) from public;
grant execute on function public.portal_admin_revenue(text, text, date) to anon, authenticated;
