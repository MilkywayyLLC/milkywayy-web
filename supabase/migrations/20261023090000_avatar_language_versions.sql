-- AI avatars → Multilingual (site-refine, 12 Oct 2026): an avatar example can carry the same
-- video in other languages, [{ "language": "Arabic", "clip": "r2:…" | "<link>" }].
alter table public.avatars
  add column if not exists versions jsonb not null default '[]'::jsonb;
