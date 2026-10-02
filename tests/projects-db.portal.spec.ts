import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addBooking,
  adminRpc,
  cleanup,
  createUser,
  hasPortalAdmin,
  newRun,
  signedIn,
} from "./helpers/portal";
import { env } from "./helpers/env";

/**
 * Database rules for projects (Phase 10): a booking becomes a project the client sees once claimed;
 * prices stay with Owners/Admins; unpublished files stay hidden; one revision at a time within the
 * included rounds; approving completes and starts the retention clock; strangers see nothing.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let A: SupabaseClient, B: SupabaseClient, M: SupabaseClient;
let id = "";
let ref = "";
const must = async <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

test.beforeAll(async () => {
  const a = await createUser(RUN, "a");
  const b = await createUser(RUN, "b");
  const m = await createUser(RUN, "m");
  ref = await addBooking(a);
  A = await signedIn(a);
  B = await signedIn(b);
  const acme = await must<string>(
    A.rpc("create_my_account", {
      p_type: "company",
      p_name: "Acme Projects",
      p_industry: "agency",
    }),
  );
  await must(A.rpc("claim_my_bookings", { p_account: acme }));
  await must(A.from("account_invites").insert({ account_id: acme, email: m, name: "Mo" }));
  M = await signedIn(m);
  await must(M.rpc("accept_my_invites"));
  await must(B.rpc("create_my_account", { p_type: "individual", p_name: "Bea" }));
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a claimed booking is a project its Owner sees, with the price; nobody else does", async () => {
  const rows = await must<{ id: string; ref: string; status: string }[]>(
    A.from("projects").select("id, ref, status").eq("ref", ref),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("requested");
  id = rows[0].id;
  expect(
    await must<unknown[]>(A.from("line_items").select("unit_price").eq("project_id", id)),
  ).toHaveLength(1);
  // A Member (company set to "own projects") and a stranger see neither the project nor the price.
  expect(await must<unknown[]>(M.from("projects").select("id").eq("id", id))).toEqual([]);
  expect(await must<unknown[]>(M.from("line_items").select("id").eq("project_id", id))).toEqual([]);
  expect(await must<unknown[]>(B.from("projects").select("id").eq("id", id))).toEqual([]);
  // Clients can't write projects directly.
  await A.from("projects").update({ status: "completed" }).eq("id", id);
  expect(
    (await must<{ status: string }[]>(A.from("projects").select("status").eq("id", id)))[0].status,
  ).toBe("requested");
});

test("strangers can't message, revise or approve someone else's project", async () => {
  expect(
    (await B.rpc("post_project_message", { p_project: id, p_body: "hi" })).error?.message,
  ).toMatch(/not your project/);
  expect((await B.rpc("approve_project", { p_project: id })).error?.message).toMatch(
    /not your project/,
  );
  expect((await M.rpc("request_revision", { p_project: id, p_note: "x" })).error?.message).toMatch(
    /not your project/,
  );
});

test("the admin confirms: the client is listed to email; files stay hidden until published", async () => {
  const out = await must<{ event: string; recipients: { email: string }[] }>(
    adminRpc("portal_admin_set_status", {
      p_id: id,
      p_status: "confirmed",
      p_date: "2026-11-02",
      p_slot: "Morning",
    }),
  );
  expect(out.event).toBe("booking_confirmed");
  expect(out.recipients.map((r) => r.email)).toEqual([`${RUN}-a@example.com`]);
  // A wrong key gets nothing.
  expect(
    (await adminRpc("portal_admin_set_status", { p_id: id, p_status: "shot" }, "wrong")).error,
  ).toBeTruthy();

  await must(
    adminRpc("portal_admin_add_file", {
      p_id: id,
      p_delivery_no: 1,
      p_delivery_label: "Delivery 1",
      p_kind: "photos",
      p_source: "link",
      p_url: "https://example.com/photos",
      p_r2_key: null,
      p_label: "Edited photos",
      p_bytes: null,
      p_content_type: null,
    }),
  );
  expect(await must<unknown[]>(A.from("project_files").select("id").eq("project_id", id))).toEqual(
    [],
  );
  const pub = await must<{ event: string; label: string }>(
    adminRpc("portal_admin_publish_delivery", { p_id: id, p_delivery_no: 1 }),
  );
  expect(pub.event).toBe("delivered");
  expect(
    await must<unknown[]>(A.from("project_files").select("id").eq("project_id", id)),
  ).toHaveLength(1);
  expect(await must<unknown[]>(B.from("project_files").select("id").eq("project_id", id))).toEqual(
    [],
  );
});

test("one revision at a time, within the included rounds; approving completes", async () => {
  expect((await A.rpc("request_revision", { p_project: id, p_note: " " })).error?.message).toMatch(
    /say what/,
  );
  await must(A.rpc("request_revision", { p_project: id, p_note: "Brighter living room" }));
  expect(
    (await A.rpc("request_revision", { p_project: id, p_note: "again" })).error?.message,
  ).toMatch(/already under way/);
  expect((await A.rpc("approve_project", { p_project: id })).error?.message).toMatch(
    /nothing to approve/,
  );

  await must(
    adminRpc("portal_admin_add_file", {
      p_id: id,
      p_delivery_no: 2,
      p_delivery_label: "Revision 1",
      p_kind: "photos",
      p_source: "link",
      p_url: "https://example.com/photos-v2",
      p_r2_key: null,
      p_label: "Edited photos v2",
      p_bytes: null,
      p_content_type: null,
    }),
  );
  const rev = await must<{ event: string }>(
    adminRpc("portal_admin_publish_delivery", { p_id: id, p_delivery_no: 2 }),
  );
  expect(rev.event).toBe("revision_delivered");

  await must(A.rpc("request_revision", { p_project: id, p_note: "Crop the balcony" }));
  await must(adminRpc("portal_admin_revision", { p_id: id, p_state: "delivered" }));
  expect(
    (await A.rpc("request_revision", { p_project: id, p_note: "One more" })).error?.message,
  ).toMatch(/no revision rounds left/);

  await must(A.rpc("approve_project", { p_project: id }));
  const p = (
    await must<{ status: string; completed_at: string }[]>(
      A.from("projects").select("status, completed_at").eq("id", id),
    )
  )[0];
  expect(p.status).toBe("completed");
  expect(p.completed_at).toBeTruthy();
  const kinds = (
    await must<{ kind: string }[]>(A.from("project_events").select("kind").eq("project_id", id))
  ).map((e) => e.kind);
  expect(kinds).toEqual(
    expect.arrayContaining(["revision_requested", "revision_delivered", "approved"]),
  );
});

test("messages: the client writes, the admin replies, both in one thread", async () => {
  await must(A.rpc("post_project_message", { p_project: id, p_body: "Thanks!" }));
  await must(adminRpc("portal_admin_message", { p_id: id, p_body: "Our pleasure." }));
  const msgs = await must<{ body: string; is_admin: boolean }[]>(
    A.from("project_messages").select("body, is_admin").eq("project_id", id).order("at"),
  );
  expect(msgs.slice(-2)).toEqual([
    { body: "Thanks!", is_admin: false },
    { body: "Our pleasure.", is_admin: true },
  ]);
  // The notification log is never readable by clients.
  expect((await A.from("notification_log").select("id")).data ?? []).toEqual([]);
});

test("housekeeping runs only for Vercel's cron", async ({ request }) => {
  expect((await request.get("/api/portal/housekeeping")).status()).toBe(401);
  expect(
    (
      await request.get("/api/portal/housekeeping", { headers: { authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
  test.skip(!env.CRON_SECRET, "CRON_SECRET not in .env.local");
  const r = await request.get("/api/portal/housekeeping", {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(r.status()).toBe(200);
  expect(Object.keys(await r.json())).toEqual(
    expect.arrayContaining(["auto_completed", "files_deleted", "warned"]),
  );
});
