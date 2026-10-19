-- Content update. Owner approved; applied to the website project on 3 Oct 2026.
-- AI avatar plans (site-refine, 3 Oct 2026): plan names as titles, billing as tags, clearer note.
-- Same as editing Admin → Other prices → AI avatars by hand. Keeps launchLine as it is.
update public.pricing_other
set value = value
  || jsonb_build_object(
    'extraAvatarNote', 'Setup is a one-time fee. Monthly plans include it. Each extra avatar has its own setup fee.',
    'tiers', jsonb_build_array(
      jsonb_build_object('name', 'Avatar setup', 'cadence', 'One-time',
        'bullets', jsonb_build_array('Custom face and look', 'Voice selection', '3 test videos', 'Yours to keep')),
      jsonb_build_object('name', 'Monthly videos', 'cadence', 'Monthly',
        'bullets', jsonb_build_array('Includes your avatar setup', 'Monthly video bundle', 'Captions and branding', 'You send scripts or topics')),
      jsonb_build_object('name', 'Videos + strategy', 'cadence', 'Monthly',
        'bullets', jsonb_build_array('Everything in Monthly videos', 'Content strategy', 'We write every script', 'Monthly performance review'))
    )
  ),
  updated_at = now()
where key = 'ai_avatars';
