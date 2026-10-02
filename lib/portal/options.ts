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
