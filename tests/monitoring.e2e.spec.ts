import { expect, test } from "@playwright/test";

/** Monitoring endpoints (Phase 8): health check, cron and alert routes refuse strangers. */
test("health check reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, database: "ok" });
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("weekly leads cron and the test alert need the cron secret", async ({ request }) => {
  expect((await request.get("/api/cron/weekly-leads")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/weekly-leads", { headers: { authorization: "Bearer nope" } })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/health?test-alert=1")).status()).toBe(401);
});

test("browser error reports are accepted quietly and ignore other sites' scripts", async ({
  request,
}) => {
  const ok = await request.post("/api/client-error", {
    data: { message: "x", source: "https://evil.example/a.js", page: "/" },
  });
  expect(ok.status()).toBe(204);
  expect((await request.post("/api/client-error", { data: "nonsense" })).status()).toBe(204);
});
