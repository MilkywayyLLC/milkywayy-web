-- Site-refine (Oct 2026), same signatures as before, a few more keys:
-- * book_shoot / update_booking: the map picker's reverse-geocoded building and community are
--   kept alongside the address and pin.
-- * share_page: the listing's listed / updated dates for the public page's information table.

create or replace function public.book_shoot(p_account uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ref text; s jsonb; v_addr text; v_title text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' when 'flexible' then 'Flexible' end;
begin
  if v_uid is null or private.account_role(p_account) is null then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  if not private.sees_area(p_account, 'shoot') then
    raise exception 'your access doesn''t include shoots' using errcode = '42501';
  end if;
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if length(coalesce(p_location ->> 'unit', '')) > 200 or length(coalesce(p_location ->> 'access', '')) > 1000 then
    raise exception 'location details too long' using errcode = '22023';
  end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property') then
      raise exception 'unknown service' using errcode = '22023';
    end if;
    if s ->> 'service' <> 'property' and coalesce((s ->> 'qty')::int, 0) not between 1 and 100 then
      raise exception 'quantity between 1 and 100' using errcode = '22023';
    end if;
    if s ? 'day' and s ->> 'day' not in ('half', 'full') then
      raise exception 'choose half day or full day' using errcode = '22023';
    end if;
    if s ->> 'service' = 'property' and jsonb_typeof(s -> 'property') <> 'object' then
      raise exception 'choose the property details' using errcode = '22023';
    end if;
    if length(coalesce(s ->> 'notes', '')) > 1000 then raise exception 'notes too long' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(s -> 'links', '[]'::jsonb)) l
        where l !~ '^https://\S+$' or length(l) > 2000) or jsonb_array_length(coalesce(s -> 'links', '[]'::jsonb)) > 5 then
      raise exception 'reference links must be https:// links (5 at most)' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from public.projects where account_id = p_account and created_at > now() - interval '1 day'
      and created_by is not null) >= 30 then
    raise exception 'too many new projects today' using errcode = '22023';
  end if;
  v_title := 'Shoot · ' || left(split_part(v_addr, ',', 1), 120);
  v_ref := 'MW-' || nextval('public.lead_ref_seq');
  insert into public.projects (account_id, type, ref, title, status, shoot_date, slot, meta, created_by, requested_by)
  values (p_account, 'shoot', v_ref, v_title, 'requested', p_date, v_slot,
    jsonb_build_object('source', 'portal', 'booking', jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''),
        'building', nullif(left(btrim(coalesce(p_location ->> 'building', '')), 200), ''),
        'community', nullif(left(btrim(coalesce(p_location ->> 'community', '')), 200), ''))),
      'services', p_services, 'slot', p_slot,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    v_uid, v_uid)
  returning id into v_id;
  insert into public.project_events (project_id, kind, to_status, actor_name)
    values (v_id, 'created', 'requested', private.my_name());
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

create or replace function public.update_booking(p_project uuid, p_date date, p_slot text, p_location jsonb,
  p_services jsonb, p_note text default null, p_estimate numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.projects%rowtype; s jsonb; v_addr text; v_note text;
  v_slot text := case p_slot when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
    when 'full_day' then 'Full day' end;
begin
  p := private.changeable_shoot(p_project);
  if p_date is null or p_date < (now() at time zone 'Asia/Dubai')::date then
    raise exception 'choose a date from today' using errcode = '22023';
  end if;
  if v_slot is null then raise exception 'choose a time slot' using errcode = '22023'; end if;
  v_addr := btrim(coalesce(p_location ->> 'address', ''));
  if length(v_addr) not between 3 and 300 then raise exception 'add the location' using errcode = '22023'; end if;
  if (p_location ? 'lat' and (p_location ->> 'lat')::numeric not between 22 and 27)
    or (p_location ? 'lng' and (p_location ->> 'lng')::numeric not between 51 and 57) then
    raise exception 'the pin must be in the UAE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 6 then
    raise exception 'add at least one service' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_services) loop
    if s ->> 'service' not in ('reels', 'long_form', 'property')
       or (s ->> 'service' <> 'property' and coalesce((s ->> 'qty')::int, 0) not between 1 and 100)
       or (s ? 'day' and s ->> 'day' not in ('half', 'full')) then
      raise exception 'check the services' using errcode = '22023';
    end if;
  end loop;
  v_note := case when p.status = 'confirmed' then 'Change requested' else 'Details edited' end;
  update public.projects set
    shoot_date = p_date, slot = v_slot, status = 'requested',
    title = 'Shoot · ' || left(split_part(v_addr, ',', 1), 120),
    meta = jsonb_set(meta, '{booking}', coalesce(meta -> 'booking', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'location', jsonb_strip_nulls(jsonb_build_object('address', v_addr,
        'lat', p_location -> 'lat', 'lng', p_location -> 'lng', 'place_id', p_location ->> 'place_id',
        'unit', nullif(btrim(coalesce(p_location ->> 'unit', '')), ''),
        'access', nullif(btrim(coalesce(p_location ->> 'access', '')), ''),
        'building', nullif(left(btrim(coalesce(p_location ->> 'building', '')), 200), ''),
        'community', nullif(left(btrim(coalesce(p_location ->> 'community', '')), 200), ''))),
      'services', p_services, 'slot', p_slot,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'estimate', p_estimate))),
    updated_at = now()
  where id = p.id;
  insert into public.project_events (project_id, kind, from_status, to_status, note, actor_name)
    values (p.id, 'status', p.status, 'requested', v_note, private.my_name());
  return jsonb_build_object('id', p.id, 'ref', p.ref, 'was', p.status, 'note', v_note);
end $$;

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
        'permit_qr', l.permit_qr_key, 'video_url', l.video_url, 'tour_url', l.tour_url,
        'listed_at', l.created_at, 'updated_at', l.updated_at),
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
