-- Follow-up (owner, 17 Oct 2026): Included / Extra is decided for the day an item counts in: its
-- service day, else its project's delivery, else today (no service day is stamped on it any more).
-- When a project's delivery date changes, its unbilled items without a service day are decided
-- again for the new month (an Included item goes back to its logged price first).

create or replace function private.apply_inclusions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text := coalesce(new.kind, new.rate_key); v_day date; v_pm jsonb; v_qty numeric; v_used numeric;
  v_left numeric; v_rate numeric; pl public.account_plans%rowtype;
begin
  if new.included is not null or new.account_id is null then return new; end if;
  new.included := false;
  if new.price_basis in ('override', 'manual') or v_key is null then return new; end if;
  select * into pl from public.account_plans where account_id = new.account_id;
  if pl.mode is distinct from 'package' then return new; end if;
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
  -- A package's own extra rate for this service, if it has one; else the client's price as logged.
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

create or replace function private.redecide_inclusions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.line_items%rowtype;
begin
  if new.delivered_at is not distinct from old.delivered_at or new.account_id is null then return new; end if;
  for r in select * from public.line_items where project_id = new.id and billed_invoice_id is null
      and service_date is null and included is not null order by sort, created_at loop
    delete from public.line_items where id = r.id;
    r.unit_price := case when r.included then coalesce(r.list_price, r.unit_price) else r.unit_price end;
    r.included := null;
    insert into public.line_items select (r).*;
  end loop;
  return new;
end $$;
-- After projects_stamp_delivered_items (same event, name order), so the month is already stamped.
create trigger projects_zz_redecide_inclusions after update of delivered_at on public.projects
  for each row execute function private.redecide_inclusions();
revoke all on function private.redecide_inclusions() from public, anon, authenticated;
