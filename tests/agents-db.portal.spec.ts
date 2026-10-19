import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  deliveredShoot,
  hasPortalAdmin,
  newRun,
  signedIn,
} from "./helpers/portal";

/**
 * Agency teams (owner, 17 Oct 2026), checked through the API as each person: an Agent sees a
 * shoot or listing only if they're its Agent, it's shared with them, or they made it; sharing is
 * Owner/Admin only; agents never read prices and edit only their own contact card.
 *
 * World: Owner O, agents Sara and Omar (invited with the Agent preset), shoots A and B, a
 * company contact.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const AGENT = {
  preset: "agent",
  shoots: true,
  editing: false,
  avatars: false,
  listings: true,
  billing: false,
  all_projects: false,
  team: false,
};
const ok = async <T = unknown>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
let o: Awaited<ReturnType<typeof clientAccount>>;
let A: Awaited<ReturnType<typeof deliveredShoot>>, B: Awaited<ReturnType<typeof deliveredShoot>>;
let sara: SupabaseClient, omar: SupabaseClient;
let saraId = "",
  omarId = "",
  saraCard = "",
  company = "",
  listing = "";

const input = (extra: Record<string, unknown> = {}) => ({
  title: "Marina 2 bed",
  purpose: "rent",
  price: "180000",
  location: "Dubai Marina",
  property_type: "Apartment",
  beds: "2",
  baths: "2",
  size_sqft: "1200",
  furnishing: "",
  description: "",
  highlights: [],
  permit_no: "",
  permit_qr_key: "",
  contact_ids: [company],
  photo_ids: [A.photos[0]],
  reel_id: "",
  video_url: "",
  tour_url: "",
  show_brand: true,
  expires_on: "",
  ...extra,
});
const sees = async (db: SupabaseClient, table: "projects" | "listings", id: string) =>
  (await ok<{ id: string }[]>(db.from(table).select("id").eq("id", id))).length === 1;

async function inviteAgent(name: string) {
  const email = await createUser(RUN, name.toLowerCase());
  await ok(
    o.db.from("account_invites").insert({ account_id: o.account, email, name, access: AGENT }),
  );
  const db = await signedIn(email);
  await ok(db.rpc("accept_my_invites"));
  return { db, id: (await db.auth.getUser()).data.user!.id, email };
}

test.beforeAll(async () => {
  o = await clientAccount(RUN, "owner", "Skyline Agency");
  A = await deliveredShoot(o.account, "Marina 2 bed");
  B = await deliveredShoot(o.account, "JLT studio");
  const [c] = await ok<{ id: string }[]>(
    o.db
      .from("contacts")
      .insert({ account_id: o.account, name: "Skyline Office", whatsapp: "+971501110000" })
      .select("id"),
  );
  company = c.id;
  const s = await inviteAgent("Sara");
  const m = await inviteAgent("Omar");
  sara = s.db;
  saraId = s.id;
  omar = m.db;
  omarId = m.id;
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("inviting with the Agent preset creates their contact; accepting links it to the login", async () => {
  const cards = await ok<{ id: string; name: string; member_id: string | null }[]>(
    o.db.from("contacts").select("id, name, member_id").eq("account_id", o.account),
  );
  const card = cards.find((x) => x.member_id === saraId);
  expect(card?.name).toBe("Sara");
  expect(cards.some((x) => x.member_id === omarId)).toBe(true);
  saraCard = card!.id;
});

test("an agent sees only shoots they're the Agent of or that are shared with them", async () => {
  expect(await sees(sara, "projects", A.id)).toBe(false);
  await ok(o.db.rpc("set_project_agent", { p_project: A.id, p_contact: saraCard }));
  expect(await sees(sara, "projects", A.id)).toBe(true);
  expect(await sees(sara, "projects", B.id)).toBe(false);
  expect(await sees(omar, "projects", A.id)).toBe(false);

  await ok(o.db.rpc("set_share_with", { p_kind: "p", p_id: B.id, p_users: [omarId] }));
  expect(await sees(omar, "projects", B.id)).toBe(true);
  expect(await sees(sara, "projects", B.id)).toBe(false);
  // The owner still sees everything.
  expect(await sees(o.db, "projects", A.id)).toBe(true);
  expect(await sees(o.db, "projects", B.id)).toBe(true);
});

test("only the Owner/Admins share; an agent can't share or re-point a shoot", async () => {
  await expect(
    ok(sara.rpc("set_share_with", { p_kind: "p", p_id: A.id, p_users: [omarId] })),
  ).rejects.toThrow(/not allowed/);
  await expect(
    ok(omar.rpc("set_project_agent", { p_project: B.id, p_contact: company })),
  ).rejects.toThrow(/not allowed/);
  // Share with teammates of this account only.
  await expect(
    ok(o.db.rpc("set_share_with", { p_kind: "p", p_id: A.id, p_users: [crypto.randomUUID()] })),
  ).rejects.toThrow(/teammates only/);
});

test("agents never read prices or billing", async () => {
  await ok(
    adminRpc("portal_admin_add_line_item", {
      p_project: A.id,
      p_kind: "shoot",
      p_description: null,
      p_qty: 1,
      p_unit_price: 900,
    }),
  );
  expect(await ok<unknown[]>(sara.from("line_items").select("id"))).toEqual([]);
  expect(await ok<unknown[]>(sara.from("invoices").select("id"))).toEqual([]);
  expect(await ok<unknown[]>(sara.from("account_plans").select("account_id"))).toEqual([]);
});

test("listings: the Agent sees and edits theirs, can't pause or delete; shared agents only view", async () => {
  const r = await ok<{ id: string }>(
    o.db.rpc("save_listing", {
      p_id: null,
      p_project: A.id,
      p: input({ agent_contact_id: saraCard }),
    }),
  );
  listing = r.id;
  expect(await sees(sara, "listings", listing)).toBe(true);
  expect(await sees(omar, "listings", listing)).toBe(false);

  await ok(
    sara.rpc("save_listing", {
      p_id: listing,
      p_project: null,
      p: input({ title: "Marina 2 bed, sea view", agent_contact_id: saraCard }),
    }),
  );
  await expect(
    ok(sara.rpc("set_share_status", { p_kind: "l", p_id: listing, p_status: "paused" })),
  ).rejects.toThrow(/not allowed/);
  await expect(ok(sara.rpc("delete_share", { p_kind: "l", p_id: listing }))).rejects.toThrow(
    /not allowed/,
  );

  await ok(o.db.rpc("set_share_with", { p_kind: "l", p_id: listing, p_users: [omarId] }));
  expect(await sees(omar, "listings", listing)).toBe(true);
  await expect(
    ok(omar.rpc("save_listing", { p_id: listing, p_project: null, p: input() })),
  ).rejects.toThrow(/not allowed/);
});

test("a listing an agent builds defaults to their own card as Agent", async () => {
  const r = await ok<{ id: string }>(
    sara.rpc("save_listing", {
      p_id: null,
      p_project: A.id,
      p: input({ title: "Marina 2 bed, for Sara", contact_ids: [saraCard] }),
    }),
  );
  const [row] = await ok<{ agent_contact_id: string; created_by: string }[]>(
    sara.from("listings").select("agent_contact_id, created_by").eq("id", r.id),
  );
  expect(row.agent_contact_id).toBe(saraCard);
  expect(await sees(omar, "listings", r.id)).toBe(false);
});

test("an agent manages their own contact card, not company contacts", async () => {
  await ok(sara.from("contacts").update({ role: "Senior agent" }).eq("id", saraCard));
  await ok(sara.from("contacts").update({ name: "Hacked" }).eq("id", company));
  const rows = await ok<{ id: string; name: string; role: string | null }[]>(
    o.db.from("contacts").select("id, name, role").in("id", [saraCard, company]),
  );
  expect(rows.find((x) => x.id === saraCard)?.role).toBe("Senior agent");
  expect(rows.find((x) => x.id === company)?.name).toBe("Skyline Office");
  // And can't link a login to a card.
  await expect(
    ok(sara.from("contacts").update({ member_id: saraId }).eq("id", company)),
  ).rejects.toThrow();
});
