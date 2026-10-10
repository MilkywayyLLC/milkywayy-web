import { expect, test, type Page } from "@playwright/test";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  hasPortalAdmin,
  newRun,
  signedIn,
  signInUI,
} from "./helpers/portal";

/**
 * The client side of retainers (owner, 10 Oct 2026): the budget card and activity, Book a shoot
 * (one service at a time, the property builder, the estimate), deliverables with per-item
 * revisions, and inquiries with a link reply. Members see no money.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const must = async <T>(p: Res) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const month = today.slice(0, 8) + "01";

let owner = "";
let member = "";
let account = "";
let shoot = "";
let shootRef = "";

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", "Retainer Realty");
  owner = c.email;
  account = c.account;
  member = await createUser(RUN, "member");
  await must(
    c.db.from("account_invites").insert({ account_id: account, email: member, name: "Mo" }),
  );
  await must((await signedIn(member)).rpc("accept_my_invites"));
  await must(
    adminRpc("portal_admin_set_budget", { p_account: account, p_amount: 2000, p_from: month }),
  );
  for (const [key, amount] of [
    ["reel", 400],
    ["long_form", 1200],
    ["reel_shoot", 400],
    ["half_day", 1000],
  ] as const)
    await must(
      adminRpc("portal_admin_set_client_rate", {
        p_account: account,
        p_key: key,
        p_amount: amount,
        p_from: month,
      }),
    );
});
test.afterAll(async () => {
  await cleanup(RUN);
});

/** Booking is a modal (owner, 10 Oct 2026): type, then when and where, then the summary. */
async function book(page: Page, kind: RegExp) {
  const m = page.getByTestId("booking-modal");
  await m.getByRole("group", { name: "Type of shoot" }).getByRole("button", { name: kind }).click();
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByLabel("Date").fill(today);
  await m.getByRole("button", { name: "Morning" }).click();
  await m.getByLabel("Location", { exact: true }).fill("Marina Gate 1, Dubai Marina");
  await m.getByLabel("Access notes (optional)").fill("Concierge has the key");
  await m.getByRole("button", { name: "Continue" }).click();
  return m;
}

test("Book a shoot: a modal; nothing sent until it's filled in; the estimate from the client's rates", async ({
  page,
}) => {
  await signInUI(page, owner);
  await page.goto("/portal/shoots");
  await page.getByRole("button", { name: "Book a shoot" }).click();
  const m = page.getByTestId("booking-modal");
  // Continue with nothing chosen: the banner and the field's own message, nothing sent.
  await m.getByRole("button", { name: "Continue" }).click();
  await expect(m.getByText("Please fix the highlighted fields")).toBeVisible();
  await expect(m.getByText("Choose the type of shoot.")).toBeVisible();
  await book(page, /Agent \/ social reels/);
  // 4 reels shot and edited at 400, plus a half day at 1,000; a package client sees it counted.
  await expect(m.getByTestId("estimate")).toContainText(
    "Counts toward your monthly package (estimated ~AED 2,600)",
  );
  await m.getByRole("button", { name: "Confirm booking" }).click();
  await expect(m.getByText("Booking request sent")).toBeVisible();
  await m.getByRole("link", { name: "View in Shoots" }).click();
  await expect(page).toHaveURL(/\/portal\/shoots\/MW-\d+$/);
  shootRef = decodeURIComponent(page.url().split("/shoots/")[1].split("?")[0]);
  const db = await signedIn(owner);
  const [p] = await must<
    { id: string; status: string; meta: { booking: { services: { day?: string }[] } } }[]
  >(db.from("projects").select("id, status, meta").eq("ref", shootRef));
  shoot = p.id;
  expect(p.status).toBe("requested");
  expect(p.meta.booking.services).toHaveLength(1);
  expect(p.meta.booking.services[0].day).toBe("half");
});

test("a Member books without seeing an estimate", async ({ page }) => {
  await signInUI(page, member);
  await page.goto("/portal/shoots?new=booking");
  const m = await book(page, /Long-form walkthrough/);
  await expect(m.getByText("Summary")).toBeVisible();
  await expect(m.getByTestId("estimate")).toHaveCount(0);
});

test("Billing: the budget card and activity; past 100% the bar is full and the wording stays neutral", async ({
  page,
}) => {
  // What was shot: 5 reels (2,000) + 1 long-form (1,200) = 3,200 against a 2,000 package.
  await must(
    adminRpc("portal_admin_log_shoot", {
      p_project: shoot,
      p_lines: [
        { key: "reel", description: "Social media reel", qty: 5, basis: "client_rate" },
        { key: "long_form", description: "YouTube long-form video", qty: 1, basis: "client_rate" },
      ],
      p_deliverables: [
        { label: "Reel 1", kind: "reel" },
        { label: "360 tour", kind: "tour" },
      ],
    }),
  );
  await signInUI(page, owner);
  await page.goto("/portal/billing");
  await expect(page.locator(".pt-plan")).toHaveText("Monthly package");
  const card = page.getByTestId("budget");
  await expect(card.getByTestId("budget-total")).toHaveText("AED 3,200");
  await expect(card).toContainText("This month: AED 3,200");
  await expect(card.getByTestId("budget-amount")).toHaveText("Monthly package: AED 2,000");
  const bar = card.getByTestId("budget-bar");
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  const [outer, inner] = await bar.evaluate((b) => [
    b.getBoundingClientRect().width,
    b.querySelector("i")!.getBoundingClientRect().width,
  ]);
  expect(Math.abs(inner - outer)).toBeLessThan(1);
  expect((await card.textContent())!).not.toMatch(/over|exceed|limit/i);
  // Neutral colour: the same fill as below 100% (no warning red).
  expect(await bar.locator("i").evaluate((i) => getComputedStyle(i).backgroundColor)).not.toBe(
    "rgb(180, 35, 24)",
  );
  const act = page.getByTestId("activity");
  const row = act.locator("details").first();
  await expect(row.locator("summary")).toContainText("Marina Gate 1");
  await expect(row.locator("summary")).toContainText("5 reels, 1 long-form");
  await expect(row.locator("summary")).toContainText("AED 3,200");
  await row.locator("summary").click();
  await expect(row.locator(".pt-lines li")).toHaveCount(2);
  await expect(row.locator(".pt-lines")).toContainText("Social media reel · 5 × AED 400");
});

test("Members never see money: no Billing tab, no amounts on shoots", async ({ page }) => {
  await signInUI(page, member);
  await page.goto("/portal/billing");
  await expect(page.getByText("Billing is for the account’s owner and admins")).toBeVisible();
  await page.goto("/portal/shoots");
  await expect(page.locator("main")).not.toContainText("AED");
  await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
});

test("deliverables: live statuses, a revision on one item, rounds counted per item", async ({
  page,
}) => {
  const ds = await must<{ deliverables: { id: string; label: string }[] }>(
    adminRpc("portal_admin_deliverables", { p_project: shoot }),
  );
  const reel = ds.deliverables.find((d) => d.label === "Reel 1")!;
  const tour = ds.deliverables.find((d) => d.label === "360 tour")!;
  await must(
    adminRpc("portal_admin_save_deliverables", {
      p_project: shoot,
      p_list: [
        { id: reel.id, label: "Reel 1", kind: "reel" },
        {
          id: tour.id,
          label: "360 tour",
          kind: "tour",
          link_url: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
        },
      ],
    }),
  );
  await must(adminRpc("portal_admin_set_deliverable", { p_id: reel.id, p_status: "delivered" }));
  // The Owner booked it (Members see their own shoots unless the account shares them all).
  await signInUI(page, owner);
  await page.goto(`/portal/shoots/${encodeURIComponent(shootRef)}`);
  const list = page.getByTestId("deliverables");
  const r1 = list.getByRole("listitem", { name: "Reel 1" });
  await expect(r1).toContainText("Delivered");
  await expect(r1).toContainText("2 revision rounds left");
  await r1.getByRole("button", { name: "Ask for a revision" }).click();
  await r1.getByLabel(/What should change/).fill("0:12 swap the music");
  await r1.getByRole("button", { name: "Send revision request" }).click();
  await expect(r1).toContainText("In revision");
  await expect(r1).toContainText("1 revision round left");
  // The tour opens in the tour window.
  await list
    .getByRole("listitem", { name: "360 tour" })
    .getByRole("button", { name: "Open 360 tour" })
    .click();
  await expect(page.getByRole("dialog").locator("iframe")).toHaveAttribute(
    "src",
    /my\.matterport\.com\/show\/\?m=SxQL3iGyoDo/,
  );
});

test("inquiries: tag a shoot, our reply with a private link shows as “Open link ↗”", async ({
  page,
}) => {
  await signInUI(page, owner);
  await page.goto("/portal/inquiries");
  await page.getByRole("link", { name: "New inquiry" }).click();
  const form = page.getByRole("form", { name: "New inquiry" });
  await form.getByLabel("Subject").fill("Raw footage, please");
  await form
    .getByLabel("Related shoot (optional)")
    .selectOption({ label: `${shootRef} · Shoot · Marina Gate 1` });
  await form.getByLabel("Message").fill("Could we get the raw clips?");
  await form.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/portal\/inquiries\/[0-9a-f-]{36}\?sent=1$/);
  await expect(page.getByText(shootRef)).toBeVisible();
  const id = page.url().split("/inquiries/")[1].split("?")[0];
  await must(
    adminRpc("portal_admin_reply_inquiry", {
      p_id: id,
      p_body: "Here you go.",
      p_link_url: "https://drive.google.com/drive/folders/raw",
      p_link_label: "Raw footage",
    }),
  );
  await page.goto("/portal/inquiries");
  await expect(page.getByTestId("inquiries").getByLabel("New reply")).toBeVisible();
  await page.getByRole("link", { name: /Raw footage, please/ }).click();
  const link = page.getByRole("link", { name: "Open link: Raw footage" });
  await expect(link).toHaveText("Open link ↗");
  await expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/raw");
  await page.getByRole("textbox", { name: "Reply" }).fill("Thanks!");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByTestId("thread").getByTestId("message")).toHaveCount(3);
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
});
