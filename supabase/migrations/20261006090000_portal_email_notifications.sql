-- Client portal: notifications are email only (owner, 3 Oct 2026).
-- Each person chooses which events they get emails for (profiles.notification_prefs, now
-- {event: {email: bool}}); the Owner and Admins can add extra recipients per category, e.g.
-- billing emails to accounts@their-company. Portal table only; nothing on the website changes.

alter table public.accounts add column notify_cc jsonb not null default '{}'
  check (
    jsonb_typeof(notify_cc) = 'object'
    and length(notify_cc::text) <= 2000
    and (notify_cc - 'projects' - 'billing') = '{}'::jsonb
  );
grant update (notify_cc) on public.accounts to authenticated;
