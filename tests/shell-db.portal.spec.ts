import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  cleanup,
  createUser,
  hasPortalAdmin,
  newRun,
  portalClient,
  signedIn,
} from "./helpers/portal";

/**
 * Database rules for steps 4 and 6: notification preferences and billing details stay with
 * their owner, clients can't create Owner invites, and the admin's client functions refuse
 * anyone without the server's key (and never leak admin notes into the client view).
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let A: SupabaseClient, B: SupabaseClient, M: SupabaseClient;
let acme: string;
const emails: Record<string, string> = {};

test.beforeAll(async () => {
  for (const n of ["a", "b", "m"]) emails[n] = await createUser(RUN, n);
  A = await signedIn(emails.a);
  B = await signedIn(emails.b);
  acme = (
    await A.rpc("create_my_account", {
      p_type: "company",
      p_name: "Acme Shell",
      p_industry: "agency",
      p_full_name: "Alex",
    })
  ).data;
  await B.rpc("create_my_account", { p_type: "individual", p_name: "Bea" });
  await A.from("account_invites").insert({ account_id: acme, email: emails.m, name: "Mo Member" });
  M = await signedIn(emails.m);
  await M.rpc("accept_my_invites");
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("notification settings are yours alone", async () => {
  const prefs = { delivered: { whatsapp: false, email: true } };
  const aId = (await A.auth.getUser()).data.user!.id;
  expect(
    (await A.from("profiles").update({ notification_prefs: prefs }).eq("user_id", aId).select())
      .data,
  ).toHaveLength(1);
  // Another client can neither read nor change them.
  expect((await B.from("profiles").select("notification_prefs").eq("user_id", aId)).data).toEqual(
    [],
  );
  expect(
    (await B.from("profiles").update({ notification_prefs: {} }).eq("user_id", aId).select())
      .data ?? [],
  ).toEqual([]);
  // Garbage is refused by the database.
  expect(
    (
      await A.from("profiles")
        .update({ notification_prefs: [1, 2] })
        .eq("user_id", aId)
    ).error,
  ).not.toBeNull();
});

test("an invited member gets their invite name, and can't touch billing details", async () => {
  const mId = (await M.auth.getUser()).data.user!.id;
  expect(
    (await M.from("profiles").select("full_name").eq("user_id", mId).single()).data?.full_name,
  ).toBe("Mo Member");
  expect(
    (await A.from("accounts").update({ billing_address: "Bay Square 7" }).eq("id", acme).select())
      .data,
  ).toHaveLength(1);
  expect(
    (await M.from("accounts").update({ billing_address: "Mine now" }).eq("id", acme).select())
      .data ?? [],
  ).toEqual([]);
  expect((await B.from("accounts").select("billing_address").eq("id", acme)).data).toEqual([]);
});

test("clients can't hand out Owner invites", async () => {
  const r = await A.from("account_invites").insert({
    account_id: acme,
    email: `${RUN}-boss@example.com`,
    role: "owner",
  });
  expect(r.error).not.toBeNull();
});

test("the admin functions refuse without the server's key, whoever asks", async () => {
  expect((await adminRpc("portal_admin_clients", {}, "wrong")).error?.message).toMatch(
    /not allowed/,
  );
  expect((await adminRpc("portal_admin_clients", {}, "")).error?.message).toMatch(/not allowed/);
  // A signed-in client calling with a made-up key gets nothing either.
  const r = await A.rpc("portal_admin_client", { p_secret: "guess", p_actor: "me", p_id: acme });
  expect(r.error?.message).toMatch(/not allowed/);
  // And the private tables aren't reachable over the API at all.
  expect((await portalClient().from("client_notes").select("*")).error).not.toBeNull();
});

test("admin: create a client, the invitee becomes Owner, notes stay admin-only, view-as is logged", async () => {
  const owner = `${RUN}-newowner@example.com`;
  const created = await adminRpc("portal_admin_create_client", {
    p_type: "company",
    p_name: "E2E Admin Made",
    p_industry: "developer",
    p_industry_other: null,
    p_currency: "USD",
    p_services: ["post"],
    p_contact_name: "Nadia New",
    p_contact_email: owner,
    p_contact_phone: null,
  });
  expect(created.error).toBeNull();
  const id = created.data as string;
  expect(
    (await adminRpc("portal_admin_update_client", { p_id: id, p_notes: "Pays late. Be nice." }))
      .error,
  ).toBeNull();

  await createUser(RUN, "newowner");
  const N = await signedIn(owner);
  expect((await N.rpc("accept_my_invites")).data).toBe(1);
  const mine = (await N.from("account_members").select("role").eq("account_id", id)).data;
  expect(mine).toEqual([{ role: "owner" }]);
  expect((await N.from("accounts").select("currency").eq("id", id).single()).data?.currency).toBe(
    "USD",
  );

  // A second Owner invite for an account that has one makes an Admin.
  const second = `${RUN}-second@example.com`;
  await adminRpc("portal_admin_invite", {
    p_id: id,
    p_name: "Sam",
    p_email: second,
    p_phone: null,
    p_role: "owner",
  });
  await createUser(RUN, "second");
  const S = await signedIn(second);
  await S.rpc("accept_my_invites");
  const sId = (await S.auth.getUser()).data.user!.id;
  expect(
    (await S.from("account_members").select("role").eq("account_id", id).eq("user_id", sId)).data,
  ).toEqual([{ role: "admin" }]);

  const view = (await adminRpc("portal_admin_client", { p_id: id, p_view_as: true })).data;
  expect(view.notes).toBeNull();
  expect(view.log).toBeNull();
  const full = (await adminRpc("portal_admin_client", { p_id: id, p_view_as: false })).data;
  expect(full.notes).toBe("Pays late. Be nice.");
  expect(full.members).toHaveLength(2);
  expect(full.log.map((l: { action: string }) => l.action)).toEqual(
    expect.arrayContaining(["create", "update", "invite", "view_as", "view"]),
  );
  // The list finds it by name, member email and service; filters exclude it.
  const find = async (args: Record<string, unknown>) =>
    ((await adminRpc("portal_admin_clients", args)).data as { id: string }[]).some(
      (r) => r.id === id,
    );
  expect(await find({ p_q: "admin made" })).toBe(true);
  expect(await find({ p_q: second })).toBe(true);
  expect(await find({ p_service: "post" })).toBe(true);
  expect(await find({ p_service: "avatars" })).toBe(false);
  expect(await find({ p_type: "individual" })).toBe(false);
});
