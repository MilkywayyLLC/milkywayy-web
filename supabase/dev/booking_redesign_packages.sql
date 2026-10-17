-- DEV ONLY (milkywayy-portal-dev). Never run in production. Booking redesign, AUDIT item 3:
-- the dev and demo "Growth" packages (the template, Milkywayy Demo Realty, the owner's test
-- account) counted edit-only keys (reel, long_form). Shot & edited videos now count against
-- reel_shoot / long_form_shoot, so their inclusions and extra rates move to those keys.
-- No grandfathering: there are no live clients. Already-logged items keep their kind and price.
update public.packages k set
  inclusions = (select coalesce(jsonb_agg(case i ->> 'key'
      when 'reel' then i || jsonb_build_object('key', 'reel_shoot', 'label', 'Short-form video (up to 60s)')
      when 'long_form' then i || jsonb_build_object('key', 'long_form_shoot', 'label', 'Walkthrough (up to 5 min)')
      else i end), '[]'::jsonb) from jsonb_array_elements(k.inclusions) i),
  overage = (select coalesce(jsonb_agg(case o ->> 'key'
      when 'reel' then o || jsonb_build_object('key', 'reel_shoot', 'label', 'Short-form video (up to 60s)')
      when 'long_form' then o || jsonb_build_object('key', 'long_form_shoot', 'label', 'Walkthrough (up to 5 min)')
      else o end), '[]'::jsonb) from jsonb_array_elements(coalesce(k.overage, '[]'::jsonb)) o)
where k.name = 'Growth'
  and exists (select 1 from jsonb_array_elements(k.inclusions) i where i ->> 'key' in ('reel', 'long_form'));
