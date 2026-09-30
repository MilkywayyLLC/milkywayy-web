/** Public env, read once. Missing values fall back to safe defaults so the site still renders. */
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  siteEnv: process.env.NEXT_PUBLIC_SITE_ENV ?? "development",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "971507263306",
  clientLoginUrl: process.env.NEXT_PUBLIC_CLIENT_LOGIN_URL ?? "https://milkywayy.com/dashboard",
  calLink: process.env.NEXT_PUBLIC_CAL_LINK ?? "",
} as const;

/** Anything that isn't production is locked: robots disallow all, every page noindex. */
export const isIndexable = env.siteEnv === "production";
