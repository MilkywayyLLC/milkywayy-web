-- Turnaround times (owner, 17 Oct 2026): photos within 24 hours, often same day; short-form reels
-- up to 48 hours; walkthroughs 48-72 hours. Only rows still on the original seeded text change,
-- so anything the owner has edited in the admin is left alone. Applied to the dev project only.
update public.service_turnaround set text = 'within 24 hours, often same day', updated_at = now()
  where key = 'property_shoot' and text = 'Photos in 24 hours, videos in 48–72 hours';
update public.service_turnaround set text = 'up to 48 hours', updated_at = now()
  where key = 'reels' and text = '48–72 hours after the shoot';
update public.service_turnaround set text = '48–72 hours', updated_at = now()
  where key = 'long_form' and text = '3–5 working days after the shoot';
