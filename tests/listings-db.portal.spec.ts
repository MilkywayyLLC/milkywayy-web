import { expect, test } from "@playwright/test";
import { env } from "./helpers/env";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  deliveredShoot,
  hasPortalAdmin,
  newRun,
  portalClient,
  signedIn,
} from "./helpers/portal";

/** Share pages in the database (Phase 13): who can make and change them, and when they're live. */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let c: Awaited<ReturnType<typeof clientAccount>>;
let shoot: Awaited<ReturnType<typeof deliveredShoot>>;
let contact = "";
let member = "";
let slug = "";
let listing = "";
const ok = async <T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const page = (kind: "l" | "c", s: string) =>
  ok<{ state: string; photos?: { id: string }[]; contacts?: { name: string }[]; slug?: string }>(
    portalClient().rpc("share_page", {
      p_secret: env.PORTAL_ADMIN_SECRET,
      p_kind: kind,
      p_slug: s,
    }),
  );
const input = (extra: Record<string, unknown> = {}) => ({
  title: "Sky-high 3 bed penthouse",
  purpose: "sale",
  price: "6950000",
  location: "Burj Vista 1, Downtown Dubai",
  property_type: "Apartment",
  beds: "3",
  baths: "4",
  size_sqft: "2410",
  furnishing: "furnished",
  description: "Full-floor penthouse.",
  highlights: ["Burj Khalifa view"],
  permit_no: "7120345678",
  permit_qr_key: "",
  contact_ids: [contact],
  photo_ids: [shoot.photos[2], shoot.photos[0]],
  reel_id: "",
  video_url: "",
  tour_url: "",
  show_brand: true,
  expires_on: "",
  ...extra,
});

test.beforeAll(async () => {
  c = await clientAccount(RUN, "owner", "Harbourline Homes");
  shoot = await deliveredShoot(c.account, "3 Bed apartment, Burj Vista 1");
  const [row] = await ok<{ id: string }[]>(
    c.db
      .from("contacts")
      .insert({ account_id: c.account, name: "Rania Haddad", whatsapp: "+971501234567" })
      .select("id"),
  );
  contact = row.id;
  member = await createUser(RUN, "member");
  await ok(
    c.db.from("account_invites").insert({ account_id: c.account, email: member, name: "Mia" }),
  );
  await ok((await signedIn(member)).rpc("accept_my_invites"));
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("the owner makes a share page; it's live with the chosen photos, in order, and the contact", async () => {
  const r = await ok<{ id: string; slug: string }>(
    c.db.rpc("save_listing", { p_id: null, p_project: shoot.id, p: input() }),
  );
  listing = r.id;
  slug = r.slug;
  expect(slug).toMatch(/^sky-high-3-bed-penthouse-[0-9a-f]{4}$/);
  const d = await page("l", slug);
  expect(d.state).toBe("live");
  expect(d.photos!.map((p) => p.id)).toEqual([shoot.photos[2], shoot.photos[0]]);
  expect(d.contacts!.map((x) => x.name)).toEqual(["Rania Haddad"]);
  // Saved to the property for next time.
  const [p] = await ok<{ listing_defaults: { title: string } }[]>(
    c.db.from("projects").select("listing_defaults").eq("id", shoot.id),
  );
  expect(p.listing_defaults.title).toBe("Sky-high 3 bed penthouse");
});

test("refused: photos from elsewhere, no contact, a shoot that isn't delivered", async () => {
  const other = await deliveredShoot(c.account, "Another shoot", 1);
  await expect(
    ok(
      c.db.rpc("save_listing", {
        p_id: null,
        p_project: shoot.id,
        p: input({ photo_ids: other.photos }),
      }),
    ),
  ).rejects.toThrow(/isn't from this shoot/);
  await expect(
    ok(
      c.db.rpc("save_listing", { p_id: null, p_project: shoot.id, p: input({ contact_ids: [] }) }),
    ),
  ).rejects.toThrow(/one or two of your contacts/);
  const fresh = await ok<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: c.account,
      p_type: "shoot",
      p_title: "Not shot yet",
      p_area: "JVC",
      p_building: "Bloom Towers",
    }),
  );
  await expect(
    ok(c.db.rpc("save_listing", { p_id: null, p_project: fresh.id, p: input({ photo_ids: [] }) })),
  ).rejects.toThrow(/delivered shoots/);
});

test("a Member makes their own; can't change the owner's; never reads line items", async () => {
  const m = await signedIn(member);
  const mid = (await m.auth.getUser()).data.user!.id;
  // Members see shoots they're on, or every shoot with "See all company projects" (per member).
  const access = (all: boolean) =>
    ok(
      c.db
        .from("account_members")
        .update({
          access: {
            preset: "custom",
            shoots: true,
            editing: true,
            avatars: true,
            listings: true,
            all_projects: all,
          },
        })
        .eq("account_id", c.account)
        .eq("user_id", mid),
    );
  await access(true);
  const mine = await ok<{ id: string }>(
    m.rpc("save_listing", {
      p_id: null,
      p_project: shoot.id,
      p: input({ title: "Mia's version" }),
    }),
  );
  await expect(
    ok(m.rpc("save_listing", { p_id: listing, p_project: null, p: input({ title: "Hijack" }) })),
  ).rejects.toThrow(/not allowed/);
  await expect(
    ok(m.rpc("set_share_status", { p_kind: "l", p_id: listing, p_status: "paused" })),
  ).rejects.toThrow(/not allowed/);
  await ok(m.rpc("set_share_status", { p_kind: "l", p_id: mine.id, p_status: "paused" }));
  expect(await ok<unknown[]>(m.from("line_items").select("id"))).toHaveLength(0);
  // With "See all company projects" off, the Member sees only theirs.
  await access(false);
  const seen = await ok<{ id: string }[]>(m.from("listings").select("id"));
  expect(seen.map((x) => x.id)).toEqual([mine.id]);
});

test("paused, expired and turned-off pages aren't served; unknown slugs are missing", async () => {
  await ok(c.db.rpc("set_share_status", { p_kind: "l", p_id: listing, p_status: "paused" }));
  expect((await page("l", slug)).state).toBe("unavailable");
  await ok(c.db.rpc("set_share_status", { p_kind: "l", p_id: listing, p_status: "live" }));
  expect((await page("l", slug)).state).toBe("live");

  await ok(
    c.db.rpc("save_listing", {
      p_id: listing,
      p_project: null,
      p: input({ expires_on: "2026-01-01" }),
    }),
  );
  expect((await page("l", slug)).state).toBe("unavailable");
  await ok(c.db.rpc("save_listing", { p_id: listing, p_project: null, p: input() }));

  await ok(
    adminRpc("portal_admin_disable_share", {
      p_kind: "l",
      p_id: listing,
      p_reason: "Takedown request",
    }),
  );
  expect((await page("l", slug)).state).toBe("unavailable");
  const [row] = await ok<{ disabled_reason: string }[]>(
    c.db.from("listings").select("disabled_reason").eq("id", listing),
  );
  expect(row.disabled_reason).toBe("Takedown request");
  // The owner can't switch it back on themselves.
  await ok(c.db.rpc("set_share_status", { p_kind: "l", p_id: listing, p_status: "live" }));
  expect((await page("l", slug)).state).toBe("unavailable");
  await ok(adminRpc("portal_admin_disable_share", { p_kind: "l", p_id: listing, p_reason: null }));
  expect((await page("l", slug)).state).toBe("live");

  expect((await page("l", `nope-${RUN.slice(-6)}`)).state).toBe("missing");
});

test("collections: only live listings show; stats count; the public functions need the secret", async () => {
  const col = await ok<{ id: string; slug: string }>(
    c.db.rpc("save_collection", {
      p_id: null,
      p_account: c.account,
      p: {
        title: "Homes picked for you",
        note: "",
        listing_ids: [listing],
        contact_ids: [contact],
        expires_on: "",
      },
    }),
  );
  const d = await ok<{ state: string; listings: { slug: string }[] }>(
    portalClient().rpc("share_page", {
      p_secret: env.PORTAL_ADMIN_SECRET,
      p_kind: "c",
      p_slug: col.slug,
    }),
  );
  expect(d.listings.map((x) => x.slug)).toEqual([slug]);

  for (const e of ["view", "view", "wa", "call"])
    await ok(
      portalClient().rpc("share_track", {
        p_secret: env.PORTAL_ADMIN_SECRET,
        p_kind: "l",
        p_slug: slug,
        p_event: e,
      }),
    );
  const stats = await ok<{ views: number; wa_taps: number; call_taps: number }[]>(
    c.db.from("share_stats").select("views, wa_taps, call_taps").eq("listing_id", listing),
  );
  expect(stats).toEqual([{ views: 2, wa_taps: 1, call_taps: 1 }]);

  const { error } = await portalClient().rpc("share_page", {
    p_secret: "wrong",
    p_kind: "l",
    p_slug: slug,
  });
  expect(error?.message).toMatch(/not allowed/);
  const { error: e2 } = await portalClient().from("listings").select("id");
  expect(e2).not.toBeNull();

  // Deleting the only listing in a collection removes the collection too.
  await ok(c.db.rpc("delete_share", { p_kind: "l", p_id: listing }));
  expect(await ok<unknown[]>(c.db.from("collections").select("id").eq("id", col.id))).toHaveLength(
    0,
  );
});
