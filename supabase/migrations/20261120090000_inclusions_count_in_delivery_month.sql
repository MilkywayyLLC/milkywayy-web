-- Package usage counts in the delivery month again, not the month an item was logged (owner, 2 Nov 2026).
-- 20261029090200 decided an item counts in its service day, else its project's delivery, else today, with no
-- service day stamped on it, so private.redecide_inclusions can decide it again when a delivery date changes.
-- 20261105090000 rewrote this function from an older copy and brought the stamp back: an item logged in one
-- month and delivered in another used up the wrong month's inclusions and could be billed as an Extra.
-- Same function as today, apart from how v_day is worked out and no stamp. Value packages are unaffected.
-- Nothing to backfill: on 2 Nov 2026 production has no client on a package and no Included items.

create or replace function private.apply_inclusions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text := coalesce(new.kind, new.rate_key); v_day date; v_pm jsonb; v_qty numeric; v_used numeric;
  v_left numeric; v_rate numeric; pl public.account_plans%rowtype; v_value boolean;
begin
  if new.included is not null or new.account_id is null then return new; end if;
  new.included := false;
  if new.price_basis in ('override', 'manual') or v_key is null then return new; end if;
  select * into pl from public.account_plans where account_id = new.account_id;
  if pl.mode is distinct from 'package' then return new; end if;
  select k.allowance is not null and k.half_day_cap is not null into v_value
    from public.packages k where k.id = pl.package_id;
  if coalesce(v_value, false) then return new; end if;
  v_day := coalesce(new.service_date,
    (select (p.delivered_at at time zone 'Asia/Dubai')::date from public.projects p where p.id = new.project_id),
    (now() at time zone 'Asia/Dubai')::date);
  v_pm := private.package_month(new.account_id, v_day);
  if v_pm is null or v_day < (v_pm ->> 'period_start')::date then return new; end if;
  select (i ->> 'qty')::numeric into v_qty from jsonb_array_elements(v_pm -> 'inclusions') i
    where i ->> 'key' = v_key limit 1;
  if v_qty is null then return new; end if;
  select coalesce(sum(li.qty), 0) into v_used from public.line_items li
    left join public.projects p on p.id = li.project_id
    where li.account_id = new.account_id and li.included and coalesce(li.kind, li.rate_key) = v_key
      and private.item_day(li.service_date, p.delivered_at, li.created_at) >= (v_pm ->> 'period_start')::date
      and private.item_day(li.service_date, p.delivered_at, li.created_at) < (v_pm ->> 'renews_on')::date;
  v_left := greatest(v_qty - v_used, 0);
  select nullif(o ->> 'amount', '')::numeric into v_rate
    from public.packages k, jsonb_array_elements(k.overage) o
    where k.id = pl.package_id and o ->> 'key' = v_key limit 1;
  if v_left <= 0 then
    new.unit_price := coalesce(v_rate, new.unit_price);
    return new;
  end if;
  if new.qty > v_left then
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, override_reason, logged, sort, included)
    values (new.project_id, new.account_id, new.description, new.qty - v_left, coalesce(v_rate, new.unit_price),
      new.currency, new.kind, new.delivered_month, new.service_date, new.rate_key, new.price_basis, new.list_price,
      new.override_reason, new.logged, new.sort, false);
    new.qty := v_left;
  end if;
  new.included := true;
  new.list_price := coalesce(new.list_price, new.unit_price);
  new.unit_price := 0;
  return new;
end $$;
