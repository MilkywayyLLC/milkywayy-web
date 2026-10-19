/**
 * Stripe LIVE webhook for milkywayy.com (billing add-on). Run ONCE, only after the domain switch
 * (LAUNCH.md, step "Stripe live"). Never on a preview.
 *
 *   node --env-file=.env.local scripts/stripe-live-webhook.mts --confirm
 *
 * Needs STRIPE_LIVE_SECRET_KEY (sk_live_… or a restricted rk_live_… with webhook-endpoint write)
 * in the environment for this one run; remove it from .env.local afterwards (production reads
 * STRIPE_SECRET_KEY from Vercel, which Akash sets). The script:
 *   1. refuses unless --confirm is passed, the key is live, and https://milkywayy.com/api/stripe/webhook
 *      answers like our site (400 "bad signature" to an unsigned POST), i.e. the domain is ours;
 *   2. creates the live endpoint (metadata milkywayy=production) for checkout.session.completed
 *      and checkout.session.async_payment_succeeded, or re-points the existing one;
 *   3. stores a new endpoint's signing secret in Vercel Production as STRIPE_WEBHOOK_SECRET
 *      (piped to the Vercel CLI, never printed), after which production needs a redeploy.
 */
import { spawnSync } from "node:child_process";

const URL_ = "https://milkywayy.com/api/stripe/webhook";
const EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
const key = process.env.STRIPE_LIVE_SECRET_KEY ?? "";

if (!process.argv.includes("--confirm")) {
  console.error("Run with --confirm, after the domain switch (LAUNCH.md).");
  process.exit(1);
}
if (!/^(sk|rk)_live_/.test(key)) {
  console.error("STRIPE_LIVE_SECRET_KEY must be a LIVE key (sk_live_… / rk_live_…).");
  process.exit(1);
}
const probe = await fetch(URL_, { method: "POST", body: "{}" }).catch(() => null);
const body = probe ? await probe.text() : "";
if (probe?.status !== 400 || !/bad signature/.test(body)) {
  console.error(
    `${URL_} isn't our site yet (got ${probe?.status ?? "no answer"}). Switch the domain first.`,
  );
  process.exit(1);
}

async function stripe(path: string, params?: URLSearchParams) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params,
  });
  const out = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${out.error?.message ?? "error"}`);
  return out;
}

type Endpoint = { id: string; url: string; livemode: boolean; metadata: Record<string, string> };
const list = (await stripe("/webhook_endpoints?limit=100")) as unknown as { data: Endpoint[] };
const existing = list.data.find((e) => e.livemode && e.metadata?.milkywayy === "production");
const params = new URLSearchParams({ url: URL_ });
EVENTS.forEach((e, i) => params.append(`enabled_events[${i}]`, e));

if (existing) {
  await stripe(`/webhook_endpoints/${existing.id}`, params);
  console.log(`Live endpoint ${existing.id} → ${URL_} (signing secret unchanged).`);
} else {
  params.append("description", "milkywayy.com (live)");
  params.append("metadata[milkywayy]", "production");
  const created = (await stripe("/webhook_endpoints", params)) as unknown as Endpoint & {
    secret: string;
  };
  if (!created.livemode) throw new Error("Not a live endpoint: stop");
  spawnSync("npx", ["vercel", "env", "rm", "STRIPE_WEBHOOK_SECRET", "production", "--yes"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const add = spawnSync("npx", ["vercel", "env", "add", "STRIPE_WEBHOOK_SECRET", "production"], {
    input: created.secret,
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (add.status !== 0)
    throw new Error(
      `Couldn't store the secret in Vercel: ${String(add.stderr)
        .replace(/whsec_\w+/g, "<hidden>")
        .slice(0, 300)}`,
    );
  console.log(`Created live endpoint ${created.id} → ${URL_}`);
  console.log(
    "Stored its signing secret in Vercel Production as STRIPE_WEBHOOK_SECRET. Redeploy production.",
  );
}
console.log(`Events: ${EVENTS.join(", ")}`);
