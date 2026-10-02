import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addBooking,
  cleanup,
  confirmEmail,
  createUser,
  hasPortal,
  newRun,
  portalClient,
  signedIn,
} from "./helpers/portal";

/**
 * Portal database rules (CLIENT_PORTAL_GUIDE §3, §9), checked through the API exactly as a browser
 * would reach it: a client never sees or changes another account's data, members get less than
 * owners, and earlier bookings attach only to a verified email.
 *
 * World: Acme (company, owner A, member M by invite), Bolt (individual, owner B), and U (email not
 * verified yet).
 */
test.skip(
  !hasPortal,
  "Portal Supabase env (NEXT_PUBLIC_PORTAL_SUPABASE_*, E2E_PORTAL_SECRET) not set",
);
test.describe.configure({ mode: "serial" });

const RUN = newRun();
const TABLES = [
  "accounts",
  "account_members",
  "profiles",
  "contacts",
  "account_invites",
  "lead_claims",
];
let A: SupabaseClient, B: SupabaseClient, M: SupabaseClient;
let emails: Record<"a" | "b" | "m" | "u", string>;
let acme: string, bolt: string;
const refs: Record<string, string> = {};

test.beforeAll(async () => {
  emails = {
    a: await createUser(RUN, "a"),
    b: await createUser(RUN, "b"),
    m: await createUser(RUN, "m"),
    u: await createUser(RUN, "u", false),
  };
  refs.a = await addBooking(emails.a);
  refs.aContact = await addBooking(emails.a, "contact");
  refs.b = await addBooking(emails.b);
  refs.u = await addBooking(emails.u);

  A = await signedIn(emails.a);
  B = await signedIn(emails.b);
  acme = (
    await A.rpc("create_my_account", {
      p_type: "company",
      p_name: "Acme Realty",
      p_full_name: "Alex Acme",
      p_industry: "real-estate-brokerage",
      p_services: ["shoots"],
    })
  ).data;
  bolt = (
    await B.rpc("create_my_account", {
      p_type: "individual",
      p_name: "Bea Bolt",
      p_services: ["post"],
    })
  ).data;
  expect(acme).toBeTruthy();
  expect(bolt).toBeTruthy();
  await A.rpc("claim_my_bookings", { p_account: acme });
  await B.rpc("claim_my_bookings");
});

test.afterAll(async () => {
  await cleanup(RUN);
});

test("signed-out visitors can't read or call anything", async () => {
  const anon = portalClient();
  for (const t of TABLES) {
    const { data, error } = await anon.from(t).select("*").limit(1);
    expect(error, t).not.toBeNull();
    expect(data, t).toBeNull();
  }
  for (const fn of [
    "create_my_account",
    "claim_my_bookings",
    "accept_my_invites",
    "account_bookings",
  ]) {
    const { error } = await anon.rpc(
      fn,
      fn === "create_my_account" ? { p_type: "individual", p_name: "X" } : {},
    );
    expect(error, fn).not.toBeNull();
  }
  // The test helpers refuse without the secret.
  const { error } = await anon.rpc("e2e_add_booking", { p_secret: "wrong", p_email: emails.a });
  expect(error?.message).toMatch(/not allowed/);
});

test("bookings attach by verified email: only property bookings, only your own", async () => {
  const { data } = await A.rpc("account_bookings", { p_account: acme });
  expect(data.map((r: { ref: string }) => r.ref)).toEqual([refs.a]); // not the contact lead, not B's
  expect(data[0].properties[0]).toMatchObject({ building: "Marina Gate 1", subtotal: 1050 });
  const bolts = (await B.rpc("account_bookings", { p_account: bolt })).data;
  expect(bolts.map((r: { ref: string }) => r.ref)).toEqual([refs.b]);
  // Claiming again changes nothing; a booking made later attaches on the next claim.
  expect((await A.rpc("claim_my_bookings")).data.claimed).toEqual([]);
  const later = await addBooking(emails.a);
  expect((await A.rpc("claim_my_bookings")).data.claimed).toEqual([later]);
});

test("another client sees none of Acme's rows", async () => {
  expect((await B.from("accounts").select("id")).data).toEqual([{ id: bolt }]);
  for (const t of ["account_members", "contacts", "account_invites", "lead_claims"]) {
    const { data } = await B.from(t).select("*").eq("account_id", acme);
    expect(data, t).toEqual([]);
  }
  const { data: profiles } = await B.from("profiles").select("email");
  expect(profiles).toEqual([{ email: emails.b }]);
  expect((await B.rpc("account_bookings", { p_account: acme })).error?.message).toMatch(
    /not a member/,
  );
  expect((await B.rpc("claim_my_bookings", { p_account: acme })).error?.message).toMatch(
    /not a member/,
  );
});

test("another client can't change Acme or join it", async () => {
  const upd = await B.from("accounts").update({ name: "Hijacked" }).eq("id", acme).select();
  expect(upd.data ?? []).toEqual([]);
  expect((await A.from("accounts").select("name").eq("id", acme).single()).data?.name).toBe(
    "Acme Realty",
  );
  expect((await B.from("contacts").insert({ account_id: acme, name: "Spy" })).error).not.toBeNull();
  expect(
    (await B.from("account_invites").insert({ account_id: acme, email: emails.b })).error,
  ).not.toBeNull();
  const del = await B.from("account_members").delete().eq("account_id", acme).select();
  expect(del.data ?? []).toEqual([]);
  // Nobody writes memberships, accounts or claims directly: only through the checked functions.
  const me = (await B.auth.getUser()).data.user!.id;
  for (const [t, row] of [
    ["account_members", { account_id: acme, user_id: me, role: "owner" }],
    ["accounts", { type: "company", name: "Fake" }],
    [
      "lead_claims",
      { lead_id: "00000000-0000-0000-0000-000000000000", account_id: bolt, via: "email" },
    ],
  ] as const) {
    expect((await B.from(t).insert(row)).error, t).not.toBeNull();
  }
});

test("owners can't change billing fields or give up ownership, and get one account", async () => {
  expect(
    (await A.from("accounts").update({ currency: "USD" }).eq("id", acme)).error,
  ).not.toBeNull();
  const self = (await A.auth.getUser()).data.user!.id;
  const demote = await A.from("account_members")
    .update({ role: "member" })
    .eq("user_id", self)
    .select();
  expect(demote.data ?? []).toEqual([]);
  const leave = await A.from("account_members").delete().eq("user_id", self).select();
  expect(leave.data ?? []).toEqual([]);
  expect(
    (await A.rpc("create_my_account", { p_type: "individual", p_name: "Second" })).error?.message,
  ).toMatch(/already have an account/);
});

test("invited members join by verified email and see less than owners", async () => {
  expect(
    (await A.from("account_invites").insert({ account_id: acme, email: emails.m, name: "Mo" }))
      .error,
  ).toBeNull();
  M = await signedIn(emails.m);
  expect((await M.rpc("accept_my_invites")).data).toBe(1);
  expect((await M.from("accounts").select("id")).data).toEqual([{ id: acme }]);
  const mid = (await M.auth.getUser()).data.user!.id;
  // Only their own membership row, no invites, no account changes.
  expect((await M.from("account_members").select("user_id")).data).toEqual([{ user_id: mid }]);
  expect((await M.from("account_invites").select("*")).data).toEqual([]);
  expect(
    (await M.from("accounts").update({ name: "Mo's" }).eq("id", acme).select()).data ?? [],
  ).toEqual([]);
  expect(
    (await M.from("account_members").update({ role: "admin" }).eq("user_id", mid).select()).data ??
      [],
  ).toEqual([]);
  // "Members see only their own projects" by default: A's bookings stay hidden…
  expect((await M.rpc("account_bookings", { p_account: acme })).data).toEqual([]);
  // …until the owner shows them everything, and even then members get no prices.
  await A.from("accounts").update({ member_visibility: "all" }).eq("id", acme);
  const seen = (await M.rpc("account_bookings", { p_account: acme })).data;
  expect(seen.length).toBeGreaterThan(0);
  expect(seen[0].properties[0].subtotal).toBeUndefined();
  // The owner sees the team.
  expect(
    (await A.from("account_members").select("user_id").eq("account_id", acme)).data,
  ).toHaveLength(2);
});

test("contacts: members add their own, admins edit all, one default per account", async () => {
  const mine = await A.from("contacts")
    .insert({ account_id: acme, name: "Alex", is_default: true })
    .select("id")
    .single();
  expect(mine.error).toBeNull();
  const theirs = await M.from("contacts")
    .insert({ account_id: acme, name: "Mo", whatsapp: "+971501234567" })
    .select("id")
    .single();
  expect(theirs.error).toBeNull();
  // A member can't edit the owner's contact; the owner can edit the member's.
  expect(
    (await M.from("contacts").update({ name: "X" }).eq("id", mine.data!.id).select()).data ?? [],
  ).toEqual([]);
  expect(
    (await A.from("contacts").update({ role: "Agent" }).eq("id", theirs.data!.id).select()).data,
  ).toHaveLength(1);
  // Making Mo the default unsets Alex.
  await M.from("contacts").update({ is_default: true }).eq("id", theirs.data!.id);
  const defaults = (
    await A.from("contacts").select("name").eq("account_id", acme).eq("is_default", true)
  ).data;
  expect(defaults).toEqual([{ name: "Mo" }]);
  // Bad data is refused by the database, not just the form.
  expect(
    (await A.from("contacts").insert({ account_id: acme, name: "Bad", whatsapp: "0501234567" }))
      .error,
  ).not.toBeNull();
});

test("admins manage the team but can't touch the owner", async () => {
  const mid = (await M.auth.getUser()).data.user!.id;
  const aid = (await A.auth.getUser()).data.user!.id;
  expect(
    (await A.from("account_members").update({ role: "admin" }).eq("user_id", mid).select()).data,
  ).toHaveLength(1);
  expect(
    (await M.from("account_members").select("user_id").eq("account_id", acme)).data,
  ).toHaveLength(2);
  expect(
    (await M.from("account_members").update({ role: "member" }).eq("user_id", aid).select()).data ??
      [],
  ).toEqual([]);
  expect((await M.from("account_members").delete().eq("user_id", aid).select()).data ?? []).toEqual(
    [],
  );
  expect(
    (await M.from("account_members").update({ role: "owner" }).eq("user_id", mid)).error,
  ).not.toBeNull();
  await A.from("account_members").update({ role: "member" }).eq("user_id", mid);
});

test("an unverified email can't sign in or claim; once verified it claims its bookings", async () => {
  const blocked = await portalClient().auth.signInWithPassword({
    email: emails.u,
    password: "Portal-e2e-pass-2026",
  });
  expect(blocked.error?.code).toBe("email_not_confirmed");
  await confirmEmail(emails.u);
  const U = await signedIn(emails.u);
  expect((await U.rpc("claim_my_bookings")).data).toMatchObject({ claimed: [], pending: 1 });
  const id = (await U.rpc("create_my_account", { p_type: "individual", p_name: "Uma" })).data;
  expect((await U.rpc("claim_my_bookings", { p_account: id })).data.claimed).toEqual([refs.u]);
  // Nobody else's bookings came with it.
  expect(
    (await U.rpc("account_bookings", { p_account: id })).data.map((r: { ref: string }) => r.ref),
  ).toEqual([refs.u]);
});
