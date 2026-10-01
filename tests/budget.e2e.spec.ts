import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";

/**
 * JavaScript budget per page (guide §12, owner 30 Sep 2026): total gzipped JS < 175 KB, of which
 * our own code < 35 KB (the Next.js + React framework is ~131 KB). Counts every script the page
 * loads up to network idle; tracking tags load later and aren't ours.
 */
const PAGES = [
  "/",
  "/production",
  "/property-shoots",
  "/post-production",
  "/ai-avatars",
  "/contact",
  "/work",
  "/about",
];
const FRAMEWORK_KB = 131;

test("every page stays within the JS budget", async ({ page }) => {
  test.setTimeout(120_000);
  const report: string[] = [];
  for (const path of PAGES) {
    const scripts = new Map<string, Buffer>();
    const onResponse = async (r: import("@playwright/test").Response) => {
      if (
        r.request().resourceType() === "script" &&
        new URL(r.url()).origin === new URL(page.url() || r.url()).origin
      )
        scripts.set(r.url(), await r.body().catch(() => Buffer.alloc(0)));
    };
    page.on("response", onResponse);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    page.off("response", onResponse);
    const kb =
      [...scripts.values()].reduce((n, b) => n + gzipSync(b, { level: 9 }).length, 0) / 1024;
    report.push(`${path}: ${kb.toFixed(1)} KB total, ~${(kb - FRAMEWORK_KB).toFixed(1)} KB own`);
    expect(kb, `${path} total`).toBeLessThan(175);
    expect(kb - FRAMEWORK_KB, `${path} own code`).toBeLessThan(35);
  }
  console.log(report.join("\n"));
});
