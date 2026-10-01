import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * When the database fails during a refresh, the site keeps serving the last version that loaded
 * successfully: never the seed files, never an error page. The failure is logged.
 *
 * A second server runs on its own copy of the build with its database reads going through a
 * proxy. The proxy passes real data through with markers added (so the database's version is
 * distinguishable from the seed), or fails every request on demand.
 */
test.skip(!!process.env.BASE_URL, "needs a local build");

const PORT = 3201;
const DIST = ".next-fallback";
const SUPABASE = (() => {
  const env = readFileSync(".env.local", "utf8");
  return /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(env)?.[1].trim() ?? "";
})();

type Mode = { fail: boolean; version: string };
const mode: Mode = { fail: false, version: "v1" };

/** Markers: a Home FAQ (faqs), the footer line (site settings) and the 1 Bed photo price (pricing). */
const PRICE = { v1: 512, v2: 524 } as Record<string, number>;
function mark(body: string, v: string) {
  return body
    .replaceAll('"Where do you work?"', `"Where do you work? (${v})"`)
    .replace(/("footerLine":\s*"A Dubai content studio)\./g, `$1 (${v}).`)
    .replace(
      /("size_label":\s*"1 Bed",\s*"service":\s*"photo",\s*"price":\s*)500/g,
      `$1${PRICE[v]}`,
    );
}

function startProxy() {
  const server = http.createServer(async (req, res) => {
    if (mode.fail) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"message":"injected failure (fallback test)"}');
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === "string" && !["host", "accept-encoding", "connection"].includes(k))
        headers.set(k, v);
    const upstream = await fetch(SUPABASE + req.url, { method: req.method, headers });
    const body = mark(await upstream.text(), mode.version);
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      ...(upstream.headers.get("content-range")
        ? { "content-range": upstream.headers.get("content-range")! }
        : {}),
    });
    res.end(body);
  });
  return new Promise<http.Server>((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function until(check: () => Promise<boolean>, what: string, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("a database failure keeps the last good version (never seed, never an error) and is logged", async () => {
  test.setTimeout(180_000);
  expect(SUPABASE, "NEXT_PUBLIC_SUPABASE_URL in .env.local").toMatch(/^https:/);
  expect(existsSync(".next/BUILD_ID"), "run a build first (npm test does)").toBe(true);

  const proxy = await startProxy();
  const secret = randomBytes(16).toString("hex");
  rmSync(DIST, { recursive: true, force: true });
  cpSync(".next", DIST, { recursive: true });

  let log = "";
  const server: ChildProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      env: {
        ...process.env,
        NEXT_DIST_DIR: DIST,
        SUPABASE_SERVER_URL: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
        REVALIDATE_SECRET: secret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout!.on("data", (d) => (log += d));
  server.stderr!.on("data", (d) => (log += d));

  const base = `http://localhost:${PORT}`;
  const get = async (path: string) => {
    const res = await fetch(base + path, { cache: "no-store" });
    return { status: res.status, html: await res.text() };
  };
  const revalidate = () =>
    fetch(`${base}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": secret } });
  let last = "";
  const shows = async (v: string) => {
    const home = await get("/");
    const shoots = await get("/property-shoots");
    const seen = {
      faq: home.html.includes(`Where do you work? (${v})`),
      footer: home.html.includes(`A Dubai content studio (${v}).`),
      price: shoots.html.includes(`AED ${PRICE[v]}`),
    };
    last = `${v}: ${JSON.stringify(seen)} statuses ${home.status}/${shoots.status}`;
    return seen.faq && seen.footer && seen.price;
  };

  try {
    await until(async () => (await get("/")).status === 200, "the server", 60_000);

    // 1. The database's version (v1) goes live.
    expect((await revalidate()).status).toBe(200);
    await until(() => shows("v1"), "v1 from the database");

    // 2. The database fails; a refresh is requested; every load still shows v1.
    mode.fail = true;
    log = "";
    expect((await revalidate()).status).toBe(200);
    for (let i = 0; i < 8; i++) {
      for (const path of [
        "/",
        "/property-shoots",
        "/production",
        "/post-production",
        "/ai-avatars",
      ]) {
        const page = await get(path);
        expect(page.status, path).toBe(200);
      }
      expect(await shows("v1"), `load ${i + 1} during the outage`).toBe(true);
      await new Promise((r) => setTimeout(r, 400));
    }
    // The background retry fails and is logged (Vercel runtime logs: search "[data]")…
    await until(
      async () => log.includes("database read failed; still serving the last version that loaded"),
      "the failure in the server log",
    );
    // …and the pages it re-rendered during the outage still hold v1.
    await new Promise((r) => setTimeout(r, 2000));
    const after = await fetch(`${base}/`, { cache: "no-store" });
    expect(after.headers.get("x-nextjs-cache")).toBe("HIT");
    expect(await shows("v1"), "after the failed refresh").toBe(true);

    // 3. The database recovers; the next refresh brings the new version (v2).
    mode.fail = false;
    mode.version = "v2";
    expect((await revalidate()).status).toBe(200);
    await until(() => shows("v2"), "v2 after recovery");
  } catch (err) {
    console.log(last, "\n--- server log ---\n", log.slice(-3000));
    throw err;
  } finally {
    server.kill("SIGTERM");
    proxy.close();
    rmSync(DIST, { recursive: true, force: true });
  }
});
