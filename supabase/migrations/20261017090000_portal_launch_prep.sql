-- Launch preparation (owner, 4 Oct 2026). Phase 14 replaced: nothing is imported from the old
-- portal. Instead:
-- * Invites: Milkywayy emails "Your Milkywayy portal is ready"; we keep when it was last sent so
--   the admin can resend and see it.
-- * Past projects: the admin adds a client's earlier work as a Completed project with its original
--   date; files are uploaded/linked and published into it without changing its status, kept for
--   the client's retention period from the day they're added. Clients see it like any completed
--   project; a past property shoot can make listing share pages.
-- * No old share links: the slug-alias table goes (unknown /l/ and /c/ show "isn't available").
-- Additive except share_aliases (never used in production).

-- ---------- invites ----------
alter table public.account_invites add column last_sent_at timestamptz;

-- Record that the invite email went out (called after Resend accepted it).
create or replace function public.portal_admin_invite_sent(p_secret text, p_actor text, p_invite uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  update public.account_invites set last_sent_at = now() where id = p_invite and accepted_at is null;
  select jsonb_build_object('id', i.id, 'account_id', i.account_id, 'account_name', a.name, 'name', i.name,
      'email', i.email, 'role', i.role, 'last_sent_at', i.last_sent_at)
    into v
  from public.account_invites i join public.accounts a on a.id = i.account_id
  where i.id = p_invite and i.accepted_at is null;
  if v is not null then
    insert into private.portal_admin_log (actor, action, account_id, detail)
      values (p_actor, 'invite', (v ->> 'account_id')::uuid, 'Invite email sent to ' || (v ->> 'email'));
  end if;
  return v;
end $$;

-- Open invites of a client, with when the email was last sent.
create or replace function public.portal_admin_open_invites(p_secret text, p_actor text, p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'email', i.email,
      'phone', i.phone_e164, 'role', i.role, 'created_at', i.created_at, 'last_sent_at', i.last_sent_at,
      'account_name', a.name)
      order by i.created_at)
    from public.account_invites i join public.accounts a on a.id = i.account_id
    where i.account_id = p_account and i.accepted_at is null), '[]'::jsonb);
end $$;

-- ---------- past projects ----------
create or replace function public.portal_admin_create_past_project(
  p_secret text, p_actor text, p_account uuid, p_type text, p_title text, p_date date,
  p_kind text default null, p_area text default null, p_building text default null,
  p_unit text default null, p_property_type text default null, p_size text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text; v_at timestamptz;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'no such client' using errcode = '22023';
  end if;
  if p_type not in ('shoot', 'edit', 'avatar') then
    raise exception 'unknown project type' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'give it a title' using errcode = '22023';
  end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Dubai')::date then
    raise exception 'the original date must be in the past' using errcode = '22023';
  end if;
  if p_type = 'shoot' and (coalesce(btrim(p_building), '') = '' or coalesce(btrim(p_area), '') = '') then
    raise exception 'add the building and area' using errcode = '22023';
  end if;
  if p_property_type is not null and p_property_type not in ('apartment', 'villa', 'commercial') then
    raise exception 'unknown property type' using errcode = '22023';
  end if;
  v_at := (p_date + time '12:00') at time zone 'Asia/Dubai';
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, meta, shoot_date, delivered_at, completed_at)
  values (p_account, p_type, v_ref, btrim(p_title), 'completed',
    jsonb_strip_nulls(jsonb_build_object('past', true, 'original_date', p_date,
      'area', nullif(btrim(coalesce(p_area, '')), ''), 'building', nullif(btrim(coalesce(p_building, '')), ''),
      'unit', nullif(btrim(coalesce(p_unit, '')), ''), 'property_type', p_property_type,
      'size', nullif(btrim(coalesce(p_size, '')), ''), 'kind', nullif(btrim(coalesce(p_kind, '')), ''),
      'notes', nullif(btrim(coalesce(p_notes, '')), ''))),
    (case when p_type = 'shoot' then p_date end), v_at, now())
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, note, actor_name, by_admin)
    values (v_id, 'created', 'completed', 'Added from before the portal (' || to_char(p_date, 'DD Mon YYYY') || ')',
      'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'create', p_account, v_ref || ': past ' || p_type || ' project added');
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- Publishing: as before; into a Completed project (a past project) it doesn't reopen it, and the
-- new files are kept for the client's retention period from today. Recipients are returned for
-- "delivered"; the admin's "Notify client" box (off for past projects) decides whether to email.
create or replace function public.portal_admin_publish_delivery(
  p_secret text, p_actor text, p_id uuid, p_delivery_no int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; v_label text; v_n int; v_months int;
begin
  perform private.portal_admin_gate(p_secret, p_actor);
  select * into p from public.projects where id = p_id for update;
  select coalesce(a.retention_months, 12) into v_months from public.accounts a where a.id = p.account_id;
  update public.project_files set published = true,
      expires_at = (case when p.status = 'completed' and source = 'r2'
        then now() + make_interval(months => coalesce(v_months, 12)) else expires_at end)
    where project_id = p_id and delivery_no = p_delivery_no and deleted_at is null and not published;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'add files to this delivery first' using errcode = '22023'; end if;
  select delivery_label into v_label from public.project_files
    where project_id = p_id and delivery_no = p_delivery_no limit 1;
  insert into public.project_events (project_id, kind, note, actor_name, by_admin)
    values (p_id, 'delivery', v_label || ' published (' || v_n || ' item' || (case when v_n = 1 then '' else 's' end) || ')', 'Milkywayy', true);
  insert into private.portal_admin_log (actor, action, account_id, detail)
    values (p_actor, 'update', p.account_id, p.ref || ': ' || v_label || ' published');
  if p.status = 'completed' then
    return jsonb_build_object('event', 'delivered', 'label', v_label,
      'recipients', (case when p.account_id is not null then private.event_recipients(p_id, 'delivered') else '[]'::jsonb end));
  end if;
  if p.revision_state in ('requested', 'in_progress') then
    return public.portal_admin_revision(p_secret, p_actor, p_id, 'delivered') || jsonb_build_object('label', v_label);
  end if;
  return public.portal_admin_set_status(p_secret, p_actor, p_id, 'delivered') || jsonb_build_object('label', v_label);
end $$;

revoke all on function public.portal_admin_invite_sent(text, text, uuid),
  public.portal_admin_open_invites(text, text, uuid),
  public.portal_admin_create_past_project(text, text, uuid, text, text, date, text, text, text, text, text, text, text)
  from public;
grant execute on function public.portal_admin_invite_sent(text, text, uuid),
  public.portal_admin_open_invites(text, text, uuid),
  public.portal_admin_create_past_project(text, text, uuid, text, text, date, text, text, text, text, text, text, text)
  to anon, authenticated;

-- ---------- no old share links ----------
create or replace function private.new_share_slug(p_title text) returns text
language plpgsql volatile set search_path = '' as $$
declare v_base text; v text;
begin
  v_base := btrim(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 48), '-');
  if length(v_base) < 2 then v_base := 'home'; end if;
  loop
    v := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.listings where slug = v)
      and not exists (select 1 from public.collections where slug = v);
  end loop;
  return v;
end $$;
revoke all on function private.new_share_slug(text) from public, anon, authenticated;

create or replace function public.share_page(p_secret text, p_kind text, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.listings%rowtype; c public.collections%rowtype; v_photos jsonb;
begin
  perform private.portal_admin_gate(p_secret, 'share-page');
  if p_kind = 'l' then
    select * into l from public.listings where slug = p_slug;
    if not found then return jsonb_build_object('state', 'missing'); end if;
    if not private.share_live(l.status, l.disabled_at, l.expires_on) then
      return jsonb_build_object('state', 'unavailable');
    end if;
    v_photos := private.share_photos(l.photo_ids);
    if jsonb_array_length(v_photos) = 0 then return jsonb_build_object('state', 'unavailable'); end if;
    return jsonb_build_object('state', 'live',
      'listing', jsonb_build_object('id', l.id, 'slug', l.slug, 'title', l.title, 'purpose', l.purpose,
        'price', l.price, 'currency', l.currency, 'location', l.location, 'property_type', l.property_type,
        'beds', l.beds, 'baths', l.baths, 'size_sqft', l.size_sqft, 'furnishing', l.furnishing,
        'description', l.description, 'highlights', to_jsonb(l.highlights), 'permit_no', l.permit_no,
        'permit_qr', l.permit_qr_key, 'video_url', l.video_url, 'tour_url', l.tour_url),
      'photos', v_photos,
      'reel', (select jsonb_build_object('web', f.web_key, 'poster', f.poster_key) from public.project_files f
        where f.id = l.reel_id and f.published and f.deleted_at is null and f.web_key is not null),
      'contacts', private.share_contacts(l.account_id, l.contact_ids),
      'brand', (case when l.show_brand then private.share_brand(l.account_id) end));
  elsif p_kind = 'c' then
    select * into c from public.collections where slug = p_slug;
    if not found then return jsonb_build_object('state', 'missing'); end if;
    if not private.share_live(c.status, c.disabled_at, c.expires_on) then
      return jsonb_build_object('state', 'unavailable');
    end if;
    return jsonb_build_object('state', 'live',
      'collection', jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'note', c.note),
      'listings', coalesce((select jsonb_agg(jsonb_build_object('slug', l2.slug, 'title', l2.title,
          'purpose', l2.purpose, 'price', l2.price, 'currency', l2.currency, 'location', l2.location,
          'beds', l2.beds, 'baths', l2.baths, 'size_sqft', l2.size_sqft,
          'photo', private.share_photos(l2.photo_ids[1:1]) -> 0) order by u.ord)
        from unnest(c.listing_ids) with ordinality u(id, ord) join public.listings l2 on l2.id = u.id
        where private.share_live(l2.status, l2.disabled_at, l2.expires_on)
          and jsonb_array_length(private.share_photos(l2.photo_ids[1:1])) > 0), '[]'::jsonb),
      'contacts', private.share_contacts(c.account_id, c.contact_ids),
      'brand', private.share_brand(c.account_id));
  end if;
  raise exception 'l or c' using errcode = '22023';
end $$;

drop table if exists public.share_aliases;
