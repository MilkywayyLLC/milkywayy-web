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

/** Client notifications (CLIENT_PORTAL_GUIDE §8): [key, label, WhatsApp default, email default, owner/admin only]. */
export const NOTIFY_EVENTS = [
  ["booking_confirmed", "Booking confirmed (date and slot)", true, true, false],
  ["shoot_done", "Shoot done, editing started", false, false, false],
  ["delivered", "Files ready to download", true, true, false],
  ["batch_received", "Editing batch received", true, true, false],
  ["script_ready", "Script ready for your approval", true, true, false],
  ["revision_delivered", "Revision delivered", true, true, false],
  ["new_message", "New message on a project", true, true, false],
  ["invoice_issued", "Invoice issued", true, true, true],
] as const;
export type NotifyPrefs = Record<string, { whatsapp: boolean; email: boolean }>;
export const prefOf = (prefs: NotifyPrefs | null | undefined, key: string) => {
  const d = NOTIFY_EVENTS.find((e) => e[0] === key)!;
  return { whatsapp: prefs?.[key]?.whatsapp ?? d[2], email: prefs?.[key]?.email ?? d[3] };
};
