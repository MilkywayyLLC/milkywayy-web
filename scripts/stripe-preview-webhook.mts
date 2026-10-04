/**
 * Stripe TEST-mode webhook for a preview deployment (billing add-on). Never production.
 *
 *   node --env-file=.env.local scripts/stripe-preview-webhook.mts https://milkywayy-xxxx.vercel.app
 *
 * Previews sit behind Vercel Deployment Protection, so the endpoint URL carries Vercel's
 * "Protection Bypass for Automation" value (?x-vercel-protection-bypass=…), read from
 * VERCEL_AUTOMATION_BYPASS_SECRET. There is one preview endpoint (metadata milkywayy=preview):
 * the first run creates it and stores its signing secret in Vercel's Preview environment as
 * STRIPE_WEBHOOK_SECRET (piped to the Vercel CLI, never printed); later runs only point it at the
 * new preview, so the secret stays the same. Prints the endpoint id, events and URL (bypass hidden).
 */
import { spawnSync } from "node:child_process";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const origin = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^(sk|rk)_test_/.test(key))
  throw new Error("STRIPE_SECRET_KEY must be a TEST key (sk_test_…)");
if (!bypass) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is missing from .env.local");
if (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin))
  throw new Error("Pass the preview's https://…vercel.app address");

const EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
const url = `${origin}/api/stripe/webhook?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
const shown = `${origin}/api/stripe/webhook?x-vercel-protection-bypass=<hidden>`;

async function stripe(path: string, body?: URLSearchParams, method = body ? "POST" : "GET") {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const out = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${out.error?.message ?? "error"}`);
  return out;
}

type Endpoint = { id: string; url: string; livemode: boolean; metadata: Record<string, string> };
const list = (await stripe("/webhook_endpoints?limit=100")) as unknown as { data: Endpoint[] };
const existing = list.data.find((e) => e.metadata?.milkywayy === "preview" && !e.livemode);

const params = new URLSearchParams({ url });
EVENTS.forEach((e, i) => params.append(`enabled_events[${i}]`, e));

if (existing) {
  await stripe(`/webhook_endpoints/${existing.id}`, params);
  console.log(`Updated test endpoint ${existing.id} → ${shown}`);
  console.log("Signing secret unchanged (already in Vercel Preview as STRIPE_WEBHOOK_SECRET).");
} else {
  params.append("description", "Milkywayy portal previews (test mode)");
  params.append("metadata[milkywayy]", "preview");
  const created = (await stripe("/webhook_endpoints", params)) as unknown as Endpoint & {
    secret: string;
  };
  if (created.livemode) throw new Error("Created a live endpoint: stop");
  // Into Vercel's Preview environment, through stdin: the value is never printed or written.
  spawnSync("npx", ["vercel", "env", "rm", "STRIPE_WEBHOOK_SECRET", "preview", "--yes"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const add = spawnSync("npx", ["vercel", "env", "add", "STRIPE_WEBHOOK_SECRET", "preview"], {
    input: created.secret,
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (add.status !== 0)
    throw new Error(
      `Couldn't store the secret in Vercel: ${String(add.stderr)
        .replace(/whsec_\w+/g, "<hidden>")
        .slice(0, 300)}`,
    );
  console.log(`Created test endpoint ${created.id} → ${shown}`);
  console.log("Stored its signing secret in Vercel Preview as STRIPE_WEBHOOK_SECRET.");
}
console.log(`Events: ${EVENTS.join(", ")}`);
