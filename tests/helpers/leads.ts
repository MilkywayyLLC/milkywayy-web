import type { Page } from "@playwright/test";
import { e2eKey } from "@/lib/leads/e2e";
import { env } from "./env";

/**
 * Every lead this page sends is flagged as a test (x-e2e-key, an HMAC of LEAD_SECRET): no
 * emails, no rate limit, and the cleanup deletes it. WhatsApp itself is never contacted.
 */
export async function markTestLeads(page: Page) {
  const key = env.LEAD_SECRET ? e2eKey(env.LEAD_SECRET) : "";
  const ctx = page.context(); // context-wide, so the WhatsApp pop-up is covered too
  await ctx.route("**/api/lead", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-e2e-key": key } }),
  );
  await ctx.route("https://wa.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>WhatsApp (stub)</title>" }),
  );
}
