import { expect, test } from "@playwright/test";
import { adminRpc, cleanup, clientAccount, hasPortalAdmin, newRun } from "./helpers/portal";

/**
 * Month-end drafts never leave a line behind (owner, 2 Nov 2026): the month picker, closed months on
 * the daily run, late lines joining the open draft or moving past an issued month, test accounts.
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
const y = Number(today.slice(0, 4));
const m = Number(today.slice(5, 7));
const month = today.slice(0, 8) + "01";
const firstOf = (add: number) => new Date(Date.UTC(y, m - 1 + add, 1)).toISOString().slice(0, 10);
const nextMonth = firstOf(1);
const nextMonth2nd = nextMonth.slice(0, 8) + "02";

type Row = {
  id: string;
  account_id: string;
  period_start: string;
  amount: number;
  status: string;
  publish_on: string;
};
let live = "";
let tester = "";

const logLine = async (account: string, price: number) => {
  const pj = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: account,
      p_type: "edit",
      p_title: `Late ${price}`,
      p_kind: "short_form",
    }),
  );
  await must(
    adminRpc("portal_admin_add_line_item", {
      p_project: pj.id,
      p_kind: "reel",
      p_description: null,
      p_qty: 1,
      p_unit_price: price,
    }),
  );
  await must(adminRpc("portal_admin_set_status", { p_id: pj.id, p_status: "delivered" }));
};
const drafts = async (account: string) =>
  (await must<Row[]>(adminRpc("portal_admin_invoice_queue", { p_status: "open" }))).filter(
    (r) => r.account_id === account,
  );

test.beforeAll(async () => {
  live = (await clientAccount(RUN, "live", "Late Lines Live")).account;
  tester = (await clientAccount(RUN, "tester", "Late Lines Test")).account;
  for (const account of [live, tester])
    await must(
      adminRpc("portal_admin_set_billing_switches", {
        p_account: account,
        p_show_budget: false,
        p_payg_invoicing: "month_end",
      }),
    );
  await must(adminRpc("portal_admin_set_test_account", { p_account: tester, p_on: true }));
  await logLine(live, 900);
  await logLine(tester, 500);
});
test.afterAll(() => cleanup(RUN));

test("an open month isn't drafted early without a pick, and a future pick is refused", async () => {
  await must(adminRpc("portal_admin_generate_drafts", { p_today: today.slice(0, 8) + "24" }));
  expect(await drafts(live)).toEqual([]);
  const { error } = await adminRpc("portal_admin_generate_drafts", { p_month: nextMonth });
  expect(error?.message).toMatch(/pick this month or an earlier one/);
});

test("the daily run drafts a closed month's unbilled line, once, and skips test accounts", async () => {
  await must(adminRpc("portal_admin_generate_drafts", { p_today: nextMonth2nd }));
  await must(adminRpc("portal_admin_generate_drafts", { p_today: nextMonth2nd }));
  const mine = await drafts(live);
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ period_start: month, status: "draft" });
  expect(Number(mine[0].amount)).toBe(900);
  expect(await drafts(tester)).toEqual([]);
});

test("a late line joins the open draft, keeping its other lines", async () => {
  await logLine(live, 300);
  await must(adminRpc("portal_admin_generate_drafts", { p_month: month }));
  const mine = await drafts(live);
  expect(mine).toHaveLength(1);
  expect(Number(mine[0].amount)).toBe(1200);
  const d = await must<{ lines: { amount: number }[] }>(
    adminRpc("portal_admin_invoice", { p_id: mine[0].id }),
  );
  expect(d.lines.map((l) => Number(l.amount))).toEqual([900, 300]);
});

test("a late line after the month is issued moves to the next open month", async () => {
  const [first] = await drafts(live);
  await must(adminRpc("portal_admin_approve_invoice", { p_id: first.id, p_publish_now: true }));
  await logLine(live, 150);
  await must(adminRpc("portal_admin_generate_drafts", { p_today: nextMonth2nd }));
  const mine = await drafts(live);
  expect(mine).toHaveLength(1);
  expect(mine[0].period_start).toBe(nextMonth);
  expect(Number(mine[0].amount)).toBe(150);
});
