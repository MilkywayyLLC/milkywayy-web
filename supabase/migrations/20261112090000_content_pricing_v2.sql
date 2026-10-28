-- Content shoot pricing v2 and "Confirm what we shot" (owner, 28 Oct 2026). Additive: new rate card
-- items, two new tables, a wider invoice stage check; replaced functions keep their behaviour for
-- everything that isn't a v2 content shoot.
--
-- * Rate card: long-form edits by length (one per-minute rate per length, 5–30 min), overtime per
--   30 minutes, and the edit-only long-form add-on. Existing items (content_2h/4h/8h,
--   content_short_edit, reel) change in Admin → Prices & packages, not here.
-- * Bookings: a content shoot by hours with `v: 2` carries its long-form lengths (`longs`, up to 10)
--   and the prices it was booked at (`priced`, set by the server).
-- * Confirm what we shot: booked vs actual. The actual becomes the project's line items (month-end,
--   packages and the 50% balance work from them); more than booked = an adjustment invoice (locks the
--   downloads until paid); less = a smaller balance (50%) or an account credit (paid in full).
--   Required before a v2 content shoot is delivered.
-- * Account credits come off the next invoice published for that account, or go back to the card.

-- ---------- rate card ----------
insert into public.rate_card (key, label, unit, amount_aed, amount_usd, grp, includes, sort) values
  ('content_long_5', 'Long-form edit · 5 min', 'minute', 80, 22, 'production', 'Per minute, the whole video at this rate', 135),
  ('content_long_10', 'Long-form edit · 10 min', 'minute', 75, 20, 'production', 'Per minute, the whole video at this rate', 136),
  ('content_long_15', 'Long-form edit · 15 min', 'minute', 70, 19, 'production', 'Per minute, the whole video at this rate', 137),
  ('content_long_20', 'Long-form edit · 20 min', 'minute', 65, 18, 'production', 'Per minute, the whole video at this rate', 138),
  ('content_long_25', 'Long-form edit · 25 min', 'minute', 60, 16, 'production', 'Per minute, the whole video at this rate', 139),
  ('content_long_30', 'Long-form edit · 30 min', 'minute', 55, 15, 'production', 'Per minute, the whole video at this rate', 140),
  ('content_overtime', 'Content shoot · overtime', '30 min', 150, 41, 'production', 'Per 30 minutes beyond the booked length', 141),
  ('edit_long_extra', 'Long-form edit only · add-on', 'video', 100, 27, 'post', 'On top of the per-minute rate when you send the files', 163)
on conflict (key) do nothing;

-- ---------- invoices: an "adjustment" stage ----------
alter table public.invoices drop constraint if exists invoices_stage_check;
alter table public.invoices add constraint invoices_stage_check
  check (stage in ('full', 'deposit', 'balance', 'fee', 'adjustment'));

-- ---------- tables ----------
create table if not exists public.account_credits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  remaining numeric(12, 2) not null check (remaining >= 0),
  currency text not null check (currency in ('AED', 'USD')),
  status text not null default 'open' check (status in ('open', 'applied', 'refunded', 'void')),
  note text check (length(note) <= 300),
  -- [{invoice_id, number, amount, at}]
  applied jsonb not null default '[]' check (jsonb_typeof(applied) = 'array'),
  refund_id uuid references public.refunds (id) on delete set null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists account_credits_open on public.account_credits (account_id) where status = 'open';
alter table public.account_credits enable row level security;
drop policy if exists "managers read credits" on public.account_credits;
create policy "managers read credits" on public.account_credits
  for select to authenticated using (private.account_role(account_id) in ('owner', 'admin'));

create table if not exists public.shoot_confirmations (
  project_id uuid primary key references public.projects (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  booked jsonb not null,
  actual jsonb not null,
  -- What differs, priced: [{description, qty, unit_price, kind}]
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  booked_total numeric(12, 2) not null,
  actual_total numeric(12, 2) not null,
  diff numeric(12, 2) not null,
  outcome text not null check (outcome in ('none', 'invoice', 'balance', 'credit', 'usage', 'month_end')),
  invoice_id uuid references public.invoices (id) on delete set null,
  credit_id uuid references public.account_credits (id) on delete set null,
  note text check (length(note) <= 500),
  confirmed_by text,
  confirmed_at timestamptz not null default now()
);
alter table public.shoot_confirmations enable row level security;

-- ---------- bookings ----------
-- v2 content shoots: up to 10 long-form edits, each with its length (5–30 min, 5-min steps).
create or replace function private.check_shoot_services(p_services jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare s jsonb; v jsonb; v_raw boolean;
begin
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property', 'videos') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ->> 'service' = 'videos' then
      v := s -> 'videos';
      if jsonb_typeof(v) is distinct from 'object' or v ->> 'by' not in ('count', 'time', 'hours') then
        raise exception 'choose how many videos, or half day or full day' using errcode = '22023';
      end if;
      if v ->> 'by' = 'hours' then
        if v ->> 'hours' is null or v ->> 'hours' not in ('2', '4', '8') then
          raise exception 'choose a shoot length' using errcode = '22023';
        end if;
        if coalesce((v ->> 'short')::int, 0) not between 0 and 100
          or coalesce((v ->> 'long')::int, 0) not between 0 and (case when v ? 'longs' then 10 else 3 end) then
          raise exception 'edits out of range' using errcode = '22023';
        end if;
        if v ? 'longs' and (jsonb_typeof(v -> 'longs') <> 'array'
            or jsonb_array_length(v -> 'longs') <> coalesce((v ->> 'long')::int, 0)
            or exists (select 1 from jsonb_array_elements_text(v -> 'longs') m
              where m !~ '^\d{1,2}$' or m::int not in (5, 10, 15, 20, 25, 30))) then
          raise exception 'long-form lengths are 5 to 30 minutes' using errcode = '22023';
        end if;
      elsif v ->> 'by' = 'count' then
        if coalesce((v ->> 'short')::int, 0) not between 0 and 100 or coalesce((v ->> 'long')::int, 0) not between 0 and 100
          or coalesce((v ->> 'short')::int, 0) + coalesce((v ->> 'long')::int, 0) < 1 then
          raise exception 'quantity between 1 and 100' using errcode = '22023';
        end if;
        if coalesce((v ->> 'extra_min')::int, 0) not between 0 and 600 then
          raise exception 'extra minutes between 0 and 600' using errcode = '22023';
        end if;
      else
        if v ->> 'day' is null or v ->> 'day' not in ('half', 'full') then
          raise exception 'choose half day or full day' using errcode = '22023';
        end if;
        if length(coalesce(v ->> 'approx', '')) > 300 then raise exception 'notes too long' using errcode = '22023'; end if;
      end if;
    else
      if s ? 'mode' and s ->> 'mode' not in ('edited', 'raw') then
        raise exception 'shot and edited, or shoot only' using errcode = '22023';
      end if;
      v_raw := coalesce(s ->> 'mode' = 'raw', false);
      if s ? 'day' and s ->> 'day' not in ('half', 'full') then
        raise exception 'choose half day or full day' using errcode = '22023';
      end if;
      if s ->> 'service' <> 'property' then
        if v_raw and not s ? 'day' then raise exception 'choose half day or full day' using errcode = '22023'; end if;
        if not v_raw and coalesce((s ->> 'qty')::int, 0) not between 1 and 100 then
          raise exception 'quantity between 1 and 100' using errcode = '22023';
        end if;
      elsif not v_raw and jsonb_typeof(s -> 'property') is distinct from 'object' then
        raise exception 'choose the property details' using errcode = '22023';
      end if;
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
end $$;

-- ---------- downloads and the delivery invoice ----------
-- An unpaid adjustment invoice holds the downloads back too.
create or replace function private.files_locked(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invoices i join public.projects p on p.id = i.project_id
    where i.project_id = p_project and i.stage in ('full', 'deposit', 'balance', 'adjustment')
      and i.status in ('due', 'overdue') and p.files_released_at is null)
$$;

-- Delivered: as before, with an adjustment invoice counted as already invoiced (so the 50% balance is
-- the actual value less the deposit and the adjustment, and a 100% booking gets no second draft).
create or replace function private.project_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; v_lines jsonb; v_basis numeric; v_mode text; v_paid numeric; v_value numeric;
  v_split boolean; v_items jsonb; v_inv jsonb;
begin
  if new.status <> 'delivered' or old.status = 'delivered' or new.account_id is null then return new; end if;
  select * into a from public.accounts where id = new.account_id;
  select mode into v_mode from public.account_plans where account_id = new.account_id;
  if exists (select 1 from public.invoices where project_id = new.id and stage in ('full', 'deposit') and status <> 'void') then
    if exists (select 1 from public.invoices where project_id = new.id and status <> 'void'
        and (stage = 'balance' or (category = 'booking' and stage is null))) then
      return new;
    end if;
    select coalesce(sum(subtotal), 0), bool_or(stage = 'deposit') into v_paid, v_split
      from public.invoices where project_id = new.id and stage in ('full', 'deposit', 'adjustment') and status <> 'void';
    v_value := private.booking_value(new.id);
    select coalesce(jsonb_agg(jsonb_build_object('line_item_id', li.id)), '[]'::jsonb) into v_items
      from public.line_items li where li.project_id = new.id and li.billed_invoice_id is null;
    if round(v_value - v_paid, 2) > 0 then
      v_lines := jsonb_build_array(jsonb_build_object('description', (case when v_split then 'Balance' else 'Additional work' end)
        || ' · ' || new.ref || ' · ' || new.title
        || ' (' || to_char(v_value, 'FM999,999,990.00') || ' less ' || to_char(v_paid, 'FM999,999,990.00') || ' invoiced)',
        'qty', 1, 'unit_price', round(v_value - v_paid, 2)));
      v_inv := private.stage_invoice(new.id, case when v_split then 'balance' end, v_lines, 'system', v_split);
      update public.line_items set billed_invoice_id = (v_inv ->> 'id')::uuid
        where id in (select (x ->> 'line_item_id')::uuid from jsonb_array_elements(v_items) x);
    else
      update public.line_items set billed_invoice_id = (select id from public.invoices where project_id = new.id
          and stage in ('full', 'deposit') and status <> 'void' order by created_at limit 1)
        where id in (select (x ->> 'line_item_id')::uuid from jsonb_array_elements(v_items) x);
    end if;
    return new;
  end if;
  if coalesce(v_mode, 'payg') <> 'payg' or a.payg_invoicing <> 'per_project' then return new; end if;
  if exists (select 1 from public.invoices where project_id = new.id and category in ('property', 'one_off')) then
    return new;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'qty', li.qty,
      'unit_price', li.unit_price, 'line_item_id', li.id, 'kind', li.kind) order by li.sort, li.created_at), '[]'::jsonb),
    coalesce(round(sum(li.qty * li.unit_price), 2), 0)
    into v_lines, v_basis
  from public.line_items li where li.project_id = new.id and li.billed_invoice_id is null;
  if jsonb_array_length(v_lines) = 0 then return new; end if;
  perform private.new_draft(new.account_id, case when new.type = 'shoot' then 'property' else 'one_off' end,
    (now() at time zone 'Asia/Dubai')::date, null, v_lines, null, 'system', new.id, false, v_basis,
    new.ref || ' · ' || new.title);
  return new;
end $$;

-- A v2 content shoot is delivered only once what was shot is confirmed.
create or replace function private.needs_shot_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('delivered', 'completed') and old.status not in ('delivered', 'completed', 'cancelled')
      and new.type = 'shoot' and new.account_id is not null
      and coalesce(new.meta -> 'booking' -> 'services', '[]'::jsonb) @> '[{"videos": {"by": "hours", "v": 2}}]'
      and not exists (select 1 from public.shoot_confirmations c where c.project_id = new.id) then
    raise exception 'confirm what we shot first' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists projects_confirm_shot on public.projects;
create trigger projects_confirm_shot before update of status on public.projects
  for each row execute function private.needs_shot_confirmation();
revoke all on function private.needs_shot_confirmation() from public, anon, authenticated;

-- ---------- account credits on the next invoice ----------
-- Publishing a generated invoice takes the account's open credits (same currency, oldest first) off it
-- as "Account credit" lines; fully covered, it's paid.
create or replace function private.publish_invoice(p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices%rowtype; v_today date := (now() at time zone 'Asia/Dubai')::date; v_days int;
  c public.account_credits%rowtype; v_room numeric; v_take numeric; v_lines jsonb; t jsonb; v_used boolean := false;
begin
  select * into i from public.invoices where id = p_id for update;
  if i.status not in ('draft', 'approved') then raise exception 'already published' using errcode = '22023'; end if;
  select default_due_days into v_days from public.billing_settings where id;
  if coalesce(i.pdf_source, 'generated') = 'generated' and jsonb_array_length(coalesce(i.lines, '[]'::jsonb)) > 0 then
    v_lines := i.lines;
    v_room := coalesce(i.subtotal, 0);
    for c in select * from public.account_credits where account_id = i.account_id and currency = i.currency
        and status = 'open' and remaining > 0 order by created_at for update loop
      exit when v_room <= 0;
      v_take := least(c.remaining, v_room);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('description',
        'Account credit' || coalesce(' · ' || (select ref from public.projects where id = c.project_id), ''),
        'qty', 1, 'unit_price', -v_take, 'amount', -v_take, 'kind', 'credit'));
      v_room := v_room - v_take;
      update public.account_credits set remaining = remaining - v_take,
        status = case when remaining - v_take <= 0 then 'applied' else 'open' end,
        applied = applied || jsonb_build_array(jsonb_build_object('invoice_id', i.id, 'number', i.number,
          'amount', v_take, 'at', now()))
        where id = c.id;
      insert into private.portal_admin_log (actor, action, account_id, detail)
        values (p_actor, 'update', i.account_id, 'Account credit ' || v_take || ' applied to ' || coalesce(i.number, 'an invoice'));
      v_used := true;
    end loop;
    if v_used then
      t := private.invoice_totals(v_lines);
      update public.invoices set lines = v_lines, subtotal = (t ->> 'subtotal')::numeric,
        vat_rate = (t ->> 'vat_rate')::numeric, vat = (t ->> 'vat')::numeric, amount = (t ->> 'total')::numeric
        where id = p_id;
    end if;
  end if;
  update public.invoices set status = 'due', published_at = now(), issued_on = v_today,
    due_on = case when i.due_on < v_today then v_today + coalesce(v_days, 7) else i.due_on end,
    approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, p_actor)
    where id = p_id;
  if v_used and (t ->> 'total')::numeric = 0 then
    update public.invoices set status = 'paid', paid_at = now(), paid_via = 'manual' where id = p_id;
  end if;
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', i.account_id, 'Invoice ' || coalesce(i.number, '') || ' published');
  return jsonb_build_object('id', i.id, 'account', i.account_id, 'number', i.number,
    'recipients', private.billing_recipients(i.account_id, 'invoice_issued'));
end $$;

-- ---------- confirm what we shot ----------
-- p: {booked, actual, booked_total, actual_total, lines (what differs), items (the actual, priced),
--     services (the booking's services as shot), note (for the client)}. Prices come from the admin
-- (the booking's frozen prices, worked out in lib/portal/booking.ts).
create or replace function public.portal_admin_confirm_shoot(p_secret text, p_actor text, p_project uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype; a public.accounts%rowtype; v_mode text; v_terms text; l jsonb;
  v_booked numeric; v_actual numeric; v_diff numeric; v_paid numeric; v_split boolean; v_has boolean;
  v_outcome text := 'none'; v_inv jsonb; v_credit uuid; v_credit_amt numeric := 0; v_sort int := 0;
  v_date date; v_month date; v_note text; v_n int := 0;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into pr from public.projects where id = p_project for update;
  if pr.id is null or pr.account_id is null or pr.type <> 'shoot' then
    raise exception 'confirm a client''s shoot' using errcode = '22023';
  end if;
  if pr.status not in ('requested', 'confirmed', 'shot', 'editing') then
    raise exception 'this shoot can''t be confirmed now' using errcode = '22023';
  end if;
  if exists (select 1 from public.shoot_confirmations where project_id = pr.id) then
    raise exception 'already confirmed' using errcode = '22023';
  end if;
  if exists (select 1 from public.line_items where project_id = pr.id and logged and billed_invoice_id is not null) then
    raise exception 'already on an invoice: change it on the invoice draft instead' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') not between 1 and 40
      or jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') > 40 then
    raise exception 'nothing to confirm' using errcode = '22023';
  end if;
  v_booked := round((p ->> 'booked_total')::numeric, 2);
  v_actual := round((p ->> 'actual_total')::numeric, 2);
  if v_booked is null or v_actual is null or v_booked < 0 or v_actual < 0 then
    raise exception 'totals missing' using errcode = '22023';
  end if;
  v_diff := v_actual - v_booked;
  if p ? 'services' then perform private.check_shoot_services(p -> 'services'); end if;
  select * into a from public.accounts where id = pr.account_id;
  select mode into v_mode from public.account_plans where account_id = a.id;
  v_terms := private.booking_terms(a.id);
  v_date := coalesce(pr.shoot_date, (now() at time zone 'Asia/Dubai')::date);
  v_month := case when v_mode = 'budget' then date_trunc('month', v_date)::date
    when pr.delivered_at is not null then private.dubai_month(pr.delivered_at) end;

  -- The actual as the project's line items, at the booking's prices.
  delete from public.line_items where project_id = pr.id and logged;
  for l in select * from jsonb_array_elements(p -> 'items') loop
    if coalesce(length(btrim(l ->> 'description')), 0) not between 1 and 200
        or coalesce((l ->> 'qty')::numeric, 0) <= 0 or coalesce((l ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'every item needs a description, a quantity and a price' using errcode = '22023';
    end if;
    v_sort := v_sort + 1;
    insert into public.line_items (project_id, account_id, description, qty, unit_price, currency, kind,
      delivered_month, service_date, rate_key, price_basis, list_price, logged, sort)
    values (pr.id, a.id, btrim(l ->> 'description'), (l ->> 'qty')::numeric, (l ->> 'unit_price')::numeric,
      a.currency, left(l ->> 'key', 40), v_month, v_date, left(l ->> 'key', 40), 'booking',
      (l ->> 'unit_price')::numeric, true, v_sort);
  end loop;

  select exists (select 1 from public.invoices where project_id = pr.id and stage in ('full', 'deposit') and status <> 'void'),
    coalesce(bool_or(stage = 'deposit'), false),
    coalesce(sum(subtotal) filter (where status = 'paid'), 0)
    into v_has, v_split, v_paid
  from public.invoices where project_id = pr.id and stage in ('full', 'deposit') and status <> 'void';

  if v_mode = 'package' then
    v_outcome := 'usage';
  elsif v_terms = 'month_end' or not v_has then
    v_outcome := case when v_terms = 'month_end' then 'month_end' else 'none' end;
  elsif v_diff > 0 then
    v_inv := private.stage_invoice(pr.id, 'adjustment', p -> 'lines', p_actor);
    v_outcome := 'invoice';
  elsif v_diff < 0 and v_split then
    -- The balance on delivery is the actual less the deposit; a deposit above the actual is credit.
    v_outcome := 'balance';
    v_credit_amt := greatest(v_paid - v_actual, 0);
  elsif v_diff < 0 then
    v_outcome := 'credit';
    v_credit_amt := least(-v_diff, greatest(v_paid, 0));
    if v_credit_amt <= 0 then v_outcome := 'none'; end if;
  end if;
  if v_credit_amt > 0 then
    insert into public.account_credits (account_id, project_id, amount, remaining, currency, note, created_by)
      values (a.id, pr.id, round(v_credit_amt, 2), round(v_credit_amt, 2), a.currency,
        'After the shoot · ' || pr.ref, p_actor)
      returning id into v_credit;
  end if;

  v_note := nullif(left(btrim(coalesce(p ->> 'note', '')), 500), '');
  insert into public.shoot_confirmations (project_id, account_id, booked, actual, lines, booked_total, actual_total,
    diff, outcome, invoice_id, credit_id, note, confirmed_by)
  values (pr.id, a.id, coalesce(p -> 'booked', '{}'::jsonb), coalesce(p -> 'actual', '{}'::jsonb), p -> 'lines',
    v_booked, v_actual, v_diff, v_outcome, (v_inv ->> 'id')::uuid, v_credit, v_note, p_actor);

  -- The booking follows what was shot; the client sees the note on the booking.
  update public.projects set meta = (case when p ? 'services' and meta ? 'booking'
      then jsonb_set(meta, '{booking,services}', p -> 'services') else coalesce(meta, '{}'::jsonb) end)
    || jsonb_build_object('shot_update', jsonb_build_object('note', v_note, 'at', now(), 'diff', v_diff,
      'outcome', v_outcome, 'currency', a.currency))
    where id = pr.id;

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    insert into public.project_events (project_id, kind, note, actor_name, by_admin)
      values (pr.id, 'logged', left('Updated after the shoot: ' || btrim(l ->> 'description'), 1000), 'Milkywayy', true);
    v_n := v_n + 1;
  end loop;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (pr.id, 'logged', left(case when v_n = 0 then 'Confirmed what we shot: as booked'
      else 'Confirmed what we shot: ' || a.currency || ' ' || to_char(v_booked, 'FM999,999,990') || ' → '
        || to_char(v_actual, 'FM999,999,990') || ' (' || v_outcome || ')' end, 1000), 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', a.id, pr.ref || ': confirmed what we shot, ' || v_booked || ' → ' || v_actual
      || ' (' || v_outcome || coalesce(', invoice ' || (v_inv ->> 'number'), '')
      || case when v_credit_amt > 0 then ', credit ' || v_credit_amt else '' end || ')');
  return jsonb_build_object('outcome', v_outcome, 'diff', v_diff, 'invoice', v_inv, 'credit_id', v_credit,
    'credit', v_credit_amt);
end $$;

-- The confirmation (if any) and its credit, for the admin's project page.
create or replace function public.portal_admin_shoot_confirmation(p_secret text, p_actor text, p_project uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return (select to_jsonb(c) || jsonb_build_object(
      'invoice_number', (select number from public.invoices where id = c.invoice_id),
      'invoice_status', (select status from public.invoices where id = c.invoice_id),
      'credit', (select jsonb_build_object('id', k.id, 'amount', k.amount, 'remaining', k.remaining,
          'status', k.status, 'applied', k.applied,
          'card', exists (select 1 from public.invoices i where i.project_id = c.project_id and i.status = 'paid'
            and i.paid_via = 'stripe' and coalesce(i.stripe_session_id, i.stripe_payment_intent) is not null))
        from public.account_credits k where k.id = c.credit_id))
    from public.shoot_confirmations c where c.project_id = p_project);
end $$;

-- "Refund to card instead": the credit's open amount (with VAT, as it was paid) goes back to the card
-- the booking was paid with. Returns the refund for the server to send to Stripe.
create or replace function public.portal_admin_refund_credit(p_secret text, p_actor text, p_credit uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.account_credits%rowtype; i public.invoices%rowtype; v_amount numeric; v_r uuid;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into c from public.account_credits where id = p_credit for update;
  if c.id is null or c.status <> 'open' or c.remaining <= 0 then
    raise exception 'nothing left to refund' using errcode = '22023';
  end if;
  select * into i from public.invoices where project_id = c.project_id and status = 'paid' and paid_via = 'stripe'
    and coalesce(stripe_session_id, stripe_payment_intent) is not null
    order by created_at desc limit 1;
  if i.id is null then raise exception 'no card payment to refund' using errcode = '22023'; end if;
  v_amount := round(c.remaining * (1 + coalesce(i.vat_rate, 0) / 100), 2);
  if v_amount > i.amount - coalesce(i.refunded, 0) then
    raise exception 'refund more than was paid' using errcode = '22023';
  end if;
  insert into public.refunds (account_id, project_id, invoice_id, amount, currency, method, status, note, created_by)
    values (c.account_id, c.project_id, i.id, v_amount, c.currency, 'stripe', 'pending',
      'After-shoot credit, refunded to card', p_actor)
    returning id into v_r;
  update public.account_credits set status = 'refunded', remaining = 0, refund_id = v_r where id = c.id;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (c.project_id, 'logged', 'Credit refunded to card: ' || c.currency || ' ' || v_amount, 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', c.account_id, 'Credit ' || c.remaining || ' refunded to card (' || coalesce(i.number, '') || ')');
  return jsonb_build_object('id', v_r, 'amount', v_amount, 'stripe', true,
    'session', coalesce(i.stripe_session_id, i.stripe_payment_intent));
end $$;

-- The client's open credits (Billing), for those who see money.
create or replace function public.my_account_credits(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(private.account_role(p_account), '') not in ('owner', 'admin')
    and not exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = auth.uid()
      and private.member_can(m.role, m.access, 'billing')) then
    raise exception 'billing is for owners and admins' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'amount', k.amount, 'remaining', k.remaining,
      'currency', k.currency, 'status', k.status, 'created_at', k.created_at, 'applied', k.applied,
      'ref', (select ref from public.projects where id = k.project_id)) order by k.created_at desc)
    from public.account_credits k where k.account_id = p_account and k.status in ('open', 'applied')), '[]'::jsonb);
end $$;

revoke all on function public.portal_admin_confirm_shoot(text, text, uuid, jsonb),
  public.portal_admin_shoot_confirmation(text, text, uuid),
  public.portal_admin_refund_credit(text, text, uuid) from public, anon;
grant execute on function public.portal_admin_confirm_shoot(text, text, uuid, jsonb),
  public.portal_admin_shoot_confirmation(text, text, uuid),
  public.portal_admin_refund_credit(text, text, uuid) to anon, authenticated;
revoke all on function public.my_account_credits(uuid) from public, anon;
grant execute on function public.my_account_credits(uuid) to authenticated;
