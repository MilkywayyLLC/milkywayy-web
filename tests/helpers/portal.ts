import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Portal tests run against the portal's Supabase project (the dev project while Phase 9 is built),
 * through the secret-gated e2e_* helpers that exist only there (supabase/dev/portal_e2e.sql).
 * Test users are e2e-portal-<run>-<name>@example.com and are deleted afterwards.
 */
export const hasPortal = !!(
  env.NEXT_PUBLIC_PORTAL_SUPABASE_URL &&
  env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY &&
  env.E2E_PORTAL_SECRET
);

export const PASSWORD = "Portal-e2e-pass-2026";

export const portalClient = (): SupabaseClient =>
  createClient(env.NEXT_PUBLIC_PORTAL_SUPABASE_URL, env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** A unique prefix per test file run, e.g. e2e-portal-m1x2k9abc. */
export const newRun = () =>
  `e2e-portal-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const secret = () => env.E2E_PORTAL_SECRET;

async function must<T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function createUser(run: string, name: string, confirmed = true) {
  const email = `${run}-${name}@example.com`;
  await must(
    portalClient().rpc("e2e_create_user", {
      p_secret: secret(),
      p_email: email,
      p_password: PASSWORD,
      p_confirmed: confirmed,
    }),
  );
  return email;
}

export const confirmEmail = (email: string) =>
  must(portalClient().rpc("e2e_confirm_email", { p_secret: secret(), p_email: email }));

/** A website booking (lead + one property line) made with this email. Returns its ref. */
export const addBooking = (email: string, type = "property") =>
  must<string>(
    portalClient().rpc("e2e_add_booking", { p_secret: secret(), p_email: email, p_type: type }),
  );

export const cleanup = (run: string) =>
  must(portalClient().rpc("e2e_cleanup", { p_secret: secret(), p_prefix: run }));

/** Supabase signed in as a test user. */
export async function signedIn(email: string) {
  const db = portalClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return db;
}

/** Supabase test number (Authentication → Phone → Test Phone Numbers): code 123456, never sent. */
export const TEST_PHONE = "+971500000001";
export const TEST_CODE = "123456";

export const addPhoneBooking = (phone = TEST_PHONE) =>
  must<string>(portalClient().rpc("e2e_add_phone_booking", { p_secret: secret(), p_phone: phone }));

export const cleanupPhone = (phone = TEST_PHONE) =>
  must(portalClient().rpc("e2e_cleanup_phone", { p_secret: secret(), p_phone: phone }));

/** Sign in through the real login page with email + password; lands wherever the portal sends them. */
export async function signInUI(page: import("@playwright/test").Page, email: string) {
  await page.goto("/portal/login?method=password");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // In, or the page says why not (e.g. Supabase's sign-in rate limit after many runs in a row).
  const refused = page.locator("p[role=alert]");
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/portal/login")),
    refused.waitFor().then(async () => {
      throw new Error(`Sign-in refused: ${await refused.textContent()}`);
    }),
  ]);
}

/** Admin gate for the portal_admin_* functions (dev project), as the server calls them. */
export const adminRpc = (
  fn: string,
  args: Record<string, unknown>,
  secret = env.PORTAL_ADMIN_SECRET,
) => portalClient().rpc(fn, { p_secret: secret, p_actor: "e2e-admin@example.com", ...args });
export const hasPortalAdmin = hasPortal && !!env.PORTAL_ADMIN_SECRET;

/** Phone sign-in is behind a switch (lib/portal/flags.ts); its UI tests run only when it's on. */
export const phoneSignInOn = env.NEXT_PUBLIC_PORTAL_PHONE_SIGNIN === "on";

/** Sets a known email sign-in code for a test user (dev-only helper; no email is read). */
export const setEmailCode = (email: string, code: string) =>
  must(portalClient().rpc("e2e_email_code", { p_secret: secret(), p_email: email, p_code: code }));

/** Puts a Supabase test number on a test booking (dev-only helper). */
export const setLeadPhone = (ref: string, phone: string) =>
  must(
    portalClient().rpc("e2e_set_lead_phone", { p_secret: secret(), p_ref: ref, p_phone: phone }),
  );

/** A test client with an account and one claimed website booking (a "requested" project). */
export async function clientWithProject(run: string, name: string, account = "E2E Projects") {
  const email = await createUser(run, name);
  const ref = await addBooking(email);
  const db = await signedIn(email);
  const acc = await must<string>(
    db.rpc("create_my_account", { p_type: "company", p_name: account, p_industry: "agency" }),
  );
  await must(db.rpc("claim_my_bookings", { p_account: acc }));
  const [p] = await must<{ id: string }[]>(db.from("projects").select("id").eq("ref", ref));
  return { email, ref, db, account: acc, id: p.id };
}

export const setProfilePhone = (email: string, phone: string) =>
  must(
    portalClient().rpc("e2e_set_profile_phone", {
      p_secret: secret(),
      p_email: email,
      p_phone: phone,
    }),
  );

/** A test client with an account (Owner). Optionally a Member too. */
export async function clientAccount(run: string, name: string, account = "E2E Studio") {
  const email = await createUser(run, name);
  const db = await signedIn(email);
  const id = await must<string>(
    db.rpc("create_my_account", {
      p_type: "company",
      p_name: account,
      p_industry: "agency",
      p_full_name: `${name.toUpperCase()} Tester`,
    }),
  );
  return { email, db, account: id };
}

/** A batch or avatar brief made by a signed-in client, as the New form does. */
export const newProject = (
  db: SupabaseClient,
  account: string,
  type: "edit" | "avatar",
  title: string,
  extra: Record<string, unknown> = {},
) =>
  must<{ id: string; ref: string; recipients: { email: string }[] }>(
    db.rpc("create_project", {
      p_account: account,
      p_type: type,
      p_title: title,
      p_kind: type === "edit" ? "short_form" : "60s",
      p_script_by: type === "avatar" ? "milkywayy" : null,
      ...extra,
    }),
  );

export const backdateDelivery = (project: string, months: number) =>
  must(
    portalClient().rpc("e2e_backdate_delivery", {
      p_secret: secret(),
      p_project: project,
      p_months: months,
    }),
  );

/** A delivered editing project for a client, with line items (as the admin adds them). */
export async function deliveredItems(
  account: string,
  title: string,
  items: { kind: string; qty: number; price?: number }[],
) {
  const p = await must<{ id: string; ref: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: account,
      p_type: "edit",
      p_title: title,
      p_kind: "short_form",
    }),
  );
  for (const i of items)
    await must(
      adminRpc("portal_admin_add_line_item", {
        p_project: p.id,
        p_kind: i.kind,
        p_description: null,
        p_qty: i.qty,
        p_unit_price: i.price ?? null,
      }),
    );
  await must(adminRpc("portal_admin_set_status", { p_id: p.id, p_status: "delivered" }));
  return p;
}

/**
 * A delivered property shoot for a client (Phase 13): photos "uploaded" to R2 keys (the files
 * needn't exist for the database), with previews, published as Delivery 1.
 */
export async function deliveredShoot(
  account: string,
  title: string,
  photos = 3,
  extra: Record<string, unknown> = {},
) {
  const p = await must<{ id: string; ref: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: account,
      p_type: "shoot",
      p_title: title,
      p_area: "Downtown Dubai",
      p_building: "Burj Vista 1",
      p_unit: "5101",
      p_services: ["photo"],
      ...extra,
    }),
  );
  const ids: string[] = [];
  for (let i = 1; i <= photos; i++) {
    const key = `projects/${p.ref}/d1/IMG_${i}.jpg`;
    const id = await must<string>(
      adminRpc("portal_admin_add_file", {
        p_id: p.id,
        p_delivery_no: 1,
        p_delivery_label: "Delivery 1",
        p_kind: "photos",
        p_source: "r2",
        p_url: null,
        p_r2_key: key,
        p_label: `IMG_${i}.jpg`,
        p_bytes: 1000,
        p_content_type: "image/jpeg",
      }),
    );
    await must(
      adminRpc("portal_admin_set_thumb", { p_file: id, p_thumb_key: `${key}.thumb.webp` }),
    );
    ids.push(id);
  }
  await must(adminRpc("portal_admin_publish_delivery", { p_id: p.id, p_delivery_no: 1 }));
  return { ...p, photos: ids };
}

/** A phone browser's user agent: share-page counting ignores headless browsers and bots. */
export const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** Put a test project's delivery (and its line items' month) on an exact date (dev-only). */
export const setDeliveredAt = (project: string, at: string) =>
  must(
    portalClient().rpc("e2e_set_delivered_at", {
      p_secret: secret(),
      p_project: project,
      p_at: at,
    }),
  );
