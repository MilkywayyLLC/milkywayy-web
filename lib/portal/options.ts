/** Onboarding choices (CLIENT_PORTAL_GUIDE §3.1, §3.4). Keys match the accounts table checks. */
export const INDUSTRIES = [
  ["real-estate-brokerage", "Real estate brokerage"],
  ["developer", "Developer"],
  ["holiday-homes", "Holiday homes"],
  ["agency", "Agency"],
  ["brand", "Brand"],
  ["creator", "Creator"],
  ["other", "Other"],
] as const;

export const SERVICES = [
  ["shoots", "Property shoots", "Photos, video and 360 tours in Dubai"],
  ["production", "Production", "Brand and commercial content"],
  ["post", "Post-production", "Send us footage, we edit"],
  ["avatars", "AI avatars", "Videos with an AI presenter"],
] as const;

export const industryLabel = (key: string | null, other?: string | null) =>
  key === "other" ? (other ?? "Other") : (INDUSTRIES.find((i) => i[0] === key)?.[1] ?? "");
export const serviceLabel = (key: string) => SERVICES.find((s) => s[0] === key)?.[1] ?? key;

/**
 * Client notifications, by email only (owner, 3 Oct 2026; CLIENT_PORTAL_GUIDE §8):
 * [key, label, on by default, Owner/Admin only, category for extra recipients].
 */
export const NOTIFY_EVENTS = [
  ["booking_confirmed", "Booking confirmed (date and slot)", true, false, "projects"],
  ["shoot_done", "Shoot done, editing started", false, false, "projects"],
  ["delivered", "Files ready to download", true, false, "projects"],
  ["batch_received", "Editing batch received", true, false, "projects"],
  ["script_ready", "Script ready for your approval", true, false, "projects"],
  ["revision_delivered", "Revision delivered", true, false, "projects"],
  ["new_message", "New message on a project", true, false, "projects"],
  ["invoice_issued", "Invoice issued", true, true, "billing"],
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number][0];
export type NotifyPrefs = Record<string, { email?: boolean }>;
export const NOTIFY_CATEGORIES = [
  ["projects", "Projects", "Bookings, deliveries, revisions and messages"],
  ["billing", "Billing", "Invoices"],
] as const;
export type NotifyCc = Partial<Record<"projects" | "billing", string[]>>;
/** Whether this person wants emails for the event (their choice, else the default). */
export const wantsEmail = (prefs: NotifyPrefs | null | undefined, key: string) =>
  prefs?.[key]?.email ?? NOTIFY_EVENTS.find((e) => e[0] === key)?.[2] ?? true;
