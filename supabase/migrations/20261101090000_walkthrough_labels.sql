-- Dubai's long-form video is a "Walkthrough (up to 5 min)" (site-refine cleanup, AUDIT item 24):
-- post-production sells its own long-form (up to 10 min, USD), so the two read apart.
-- Labels only; keys, prices and anything logged are unchanged. Additive.
update public.rate_card set label = 'Walkthrough (up to 5 min)' where key = 'long_form_shoot';
update public.rate_card set label = 'Walkthrough, extra minute', includes = 'Shot & edited, beyond 5 minutes'
  where key = 'long_form_extra_min';
