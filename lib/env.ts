/** Public env, read once. Missing values fall back to safe defaults so the site still renders. */
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  siteEnv: process.env.NEXT_PUBLIC_SITE_ENV ?? "development",
  // "/client-login" until the new client portal exists (CLIENT_PORTAL_GUIDE.md §11).
  clientLoginUrl: process.env.NEXT_PUBLIC_CLIENT_LOGIN_URL || "/client-login",
  calLink: process.env.NEXT_PUBLIC_CAL_LINK ?? "",
} as const;

/** Anything that isn't production is locked: robots disallow all, every page noindex. */
export const isIndexable = env.siteEnv === "production";
