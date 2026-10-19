import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  hasPortalAdmin,
  newProject,
  newRun,
  signedIn,
} from "./helpers/portal";

/**
 * Database rules for Phase 11: clients start batches and avatar briefs, add raw files only to
 * projects they can see (uploads only under that project's folder), On hold needs a reason, and an
 * avatar video can't go into production or be delivered before the client approves the script.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
let A: SupabaseClient, M: SupabaseClient, B: SupabaseClient;
let account = "";
let batch: { id: string; ref: string };
let video: { id: string; ref: string };
const err = async (p: PromiseLike<{ error: { message: string } | null }>) =>
  (await p).error?.message ?? "";
const must = async <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

test.beforeAll(async () => {
  const a = await clientAccount(RUN, "a", "Acme Edits");
  A = a.db;
  account = a.account;
  const m = await createUser(RUN, "m");
  await must(A.from("account_invites").insert({ account_id: account, email: m, name: "Mo" }));
  M = await signedIn(m);
  await must(M.rpc("accept_my_invites"));
  B = (await clientAccount(RUN, "b", "Bea")).db;
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a Member starts a batch: Submitted, the Owner sees it, a stranger doesn't; both get the email", async () => {
  const out = await newProject(M, account, "edit", "October listings", {
    p_quantity: 12,
    p_notes: "Warm grade",
    p_references: ["https://example.com/style"],
  });
  batch = out;
  expect(out.ref).toMatch(/^MW-\d+$/);
  expect(out.recipients.map((r) => r.email).sort()).toEqual([
    `${RUN}-a@example.com`,
    `${RUN}-m@example.com`,
  ]);
  const [p] = await must<{ status: string; meta: { quantity: number } }[]>(
    A.from("projects").select("status, meta").eq("id", out.id),
  );
  expect(p.status).toBe("submitted");
  expect(p.meta.quantity).toBe(12);
  expect(await must<unknown[]>(B.from("projects").select("id").eq("id", out.id))).toEqual([]);
});

test("bad briefs are refused", async () => {
  expect(
    await err(
      B.rpc("create_project", {
        p_account: account,
        p_type: "edit",
        p_title: "x",
        p_kind: "short_form",
      }),
    ),
  ).toMatch(/not a member/);
  expect(
    await err(
      newProject(M, account, "edit", "x", { p_kind: "nope" }).then(
        () => ({ error: null }),
        (e) => ({ error: e }),
      ),
    ),
  ).toMatch(/choose what it is/);
  expect(
    await err(
      newProject(M, account, "edit", "x", { p_references: ["http://insecure.example"] }).then(
        () => ({ error: null }),
        (e) => ({ error: e }),
      ),
    ),
  ).toMatch(/https/);
  expect(
    await err(
      newProject(M, account, "edit", "x", { p_due: "2020-01-01" }).then(
        () => ({ error: null }),
        (e) => ({ error: e }),
      ),
    ),
  ).toMatch(/past/);
  expect(
    await err(
      M.rpc("create_project", { p_account: account, p_type: "shoot", p_title: "x", p_kind: "x" }),
    ),
  ).toMatch(/unknown project type/);
});

test("raw files: links and uploads under the project's own folder, by people who can see it", async () => {
  await must(
    M.rpc("add_project_file_in", {
      p_project: batch.id,
      p_source: "link",
      p_label: "Raw",
      p_url: "https://example.com/raw",
    }),
  );
  await must(
    M.rpc("add_project_file_in", {
      p_project: batch.id,
      p_source: "r2",
      p_label: "clip.mp4",
      p_r2_key: `projects/${batch.ref}/in/abc-clip.mp4`,
      p_bytes: 10,
    }),
  );
  expect(
    await err(
      M.rpc("add_project_file_in", {
        p_project: batch.id,
        p_source: "r2",
        p_label: "x",
        p_r2_key: `projects/MW-1/in/x`,
      }),
    ),
  ).toMatch(/not an upload for this project/);
  expect(
    await err(
      M.rpc("add_project_file_in", {
        p_project: batch.id,
        p_source: "r2",
        p_label: "x",
        p_r2_key: `projects/${batch.ref}/in/../d1/x`,
      }),
    ),
  ).toMatch(/not an upload for this project/);
  expect(
    await err(
      B.rpc("add_project_file_in", {
        p_project: batch.id,
        p_source: "link",
        p_label: "x",
        p_url: "https://example.com",
      }),
    ),
  ).toMatch(/not your project/);
  const ins = await must<{ kind: string }[]>(
    A.from("project_files").select("kind").eq("project_id", batch.id).eq("direction", "in"),
  );
  expect(ins.map((f) => f.kind)).toEqual(["raw", "raw"]);
});

test("On hold needs a reason the client sees; every step returns who to email", async () => {
  expect(
    await err(adminRpc("portal_admin_set_status", { p_id: batch.id, p_status: "on_hold" })),
  ).toMatch(/waiting for/);
  const out = await must<{ event: string; recipients: unknown[] }>(
    adminRpc("portal_admin_set_status", {
      p_id: batch.id,
      p_status: "on_hold",
      p_note: "The music licence",
    }),
  );
  expect(out.event).toBe("status_update");
  expect(out.recipients).toHaveLength(2);
  const [p] = await must<{ status: string; status_note: string }[]>(
    M.from("projects").select("status, status_note").eq("id", batch.id),
  );
  expect(p).toEqual({ status: "on_hold", status_note: "The music licence" });
  expect(
    (
      await must<{ event: string }>(
        adminRpc("portal_admin_set_status", { p_id: batch.id, p_status: "in_editing" }),
      )
    ).event,
  ).toBe("status_update");
  // Shoot-only statuses don't fit a batch.
  expect(
    await err(adminRpc("portal_admin_set_status", { p_id: batch.id, p_status: "confirmed" })),
  ).toMatch(/check constraint/);
});

test("avatar video: production waits for the approved script", async () => {
  video = await newProject(A, account, "avatar", "Launch video");
  expect(
    await err(adminRpc("portal_admin_set_status", { p_id: video.id, p_status: "in_production" })),
  ).toMatch(/approves the script first/);
  expect(
    await err(adminRpc("portal_admin_set_status", { p_id: video.id, p_status: "script_ready" })),
  ).toMatch(/post the script first/);

  const v1 = await must<{ event: string; version: number; recipients: unknown[] }>(
    adminRpc("portal_admin_post_script", {
      p_id: video.id,
      p_body: "Hi, I'm Adam…",
      p_length: "about 55 seconds",
    }),
  );
  expect(v1).toMatchObject({ event: "script_ready", version: 1 });
  const s1 = (
    await must<{ id: string }[]>(A.from("project_scripts").select("id").eq("project_id", video.id))
  )[0];
  expect(
    await must<unknown[]>(B.from("project_scripts").select("id").eq("project_id", video.id)),
  ).toEqual([]);
  expect(
    await err(A.rpc("decide_script", { p_script: s1.id, p_approve: false, p_comment: " " })),
  ).toMatch(/say what should change/);
  await must(
    A.rpc("decide_script", { p_script: s1.id, p_approve: false, p_comment: "Mention JVC first" }),
  );
  expect(await err(A.rpc("decide_script", { p_script: s1.id, p_approve: true }))).toMatch(
    /isn't waiting/,
  );

  await must(adminRpc("portal_admin_post_script", { p_id: video.id, p_body: "Hi, JVC…" }));
  const scripts = await must<{ id: string; version: number; status: string }[]>(
    A.from("project_scripts")
      .select("id, version, status")
      .eq("project_id", video.id)
      .order("version"),
  );
  expect(scripts.map((s) => s.status)).toEqual(["changes_requested", "pending"]);
  expect(await err(B.rpc("decide_script", { p_script: scripts[1].id, p_approve: true }))).toMatch(
    /not your project/,
  );
  await must(A.rpc("decide_script", { p_script: scripts[1].id, p_approve: true }));
  const [p] = await must<{ status: string }[]>(
    A.from("projects").select("status").eq("id", video.id),
  );
  expect(p.status).toBe("in_production");
  expect(await err(adminRpc("portal_admin_post_script", { p_id: video.id, p_body: "v3" }))).toMatch(
    /already approved/,
  );
});

test("delivered and approved: raw uploads get 30 days, then they're deleted", async () => {
  await must(
    adminRpc("portal_admin_add_file", {
      p_id: batch.id,
      p_delivery_no: 1,
      p_delivery_label: "Delivery 1",
      p_kind: "reel",
      p_source: "link",
      p_url: "https://example.com/reels",
      p_r2_key: null,
      p_label: "Reels",
      p_bytes: null,
      p_content_type: null,
    }),
  );
  expect(
    (
      await must<{ event: string }>(
        adminRpc("portal_admin_publish_delivery", { p_id: batch.id, p_delivery_no: 1 }),
      )
    ).event,
  ).toBe("delivered");
  await must(M.rpc("approve_project", { p_project: batch.id }));
  const raw = await must<{ source: string; expires_at: string | null }[]>(
    M.from("project_files")
      .select("source, expires_at")
      .eq("project_id", batch.id)
      .eq("direction", "in"),
  );
  const upload = raw.find((f) => f.source === "r2")!;
  const days = (new Date(upload.expires_at!).getTime() - Date.now()) / 864e5;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThan(31);
  expect(raw.find((f) => f.source === "link")!.expires_at).toBeNull();
  // Completed: no more files in.
  expect(
    await err(
      M.rpc("add_project_file_in", {
        p_project: batch.id,
        p_source: "link",
        p_label: "x",
        p_url: "https://example.com",
      }),
    ),
  ).toMatch(/completed/);
});
