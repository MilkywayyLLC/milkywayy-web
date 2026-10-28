import { expect, test } from "@playwright/test";
import {
  billLine,
  carryNoticeLine,
  monthMode,
  planTitle,
  upfrontLater,
  type PlanMoney,
} from "@/lib/portal/plan";

/** The plan card's words (28 Oct 2026): the numbers come from the database; these only phrase them. */
const base: PlanMoney = {
  name: "Growth",
  currency: "AED",
  price: 10000,
  month: "2026-10-01",
  month_end: "2026-10-31",
  billing: "usage",
  month_mode: "usage",
  base_allowance: 10000,
  allowance: 10000,
  extras_total: 0,
  amount: 2700,
  next_invoice_on: "2026-10-31",
  next_invoice_amount: 2700,
};

test("month end: up to the allowance, billed on what's used so far", () => {
  expect(monthMode(base)).toBe("usage");
  expect(planTitle(base)).toMatch(/^Growth · up to AED\s?10,000 \/ month$/);
  expect(billLine(base)).toMatch(/billed AED\s?2,700 on 31 Oct \(so far\)$/);
  expect(upfrontLater(base)).toBeNull();
  expect(carryNoticeLine(base)).toBeNull();
});

test("upfront: paid for the month, next invoice on the 1st with extras", () => {
  const v: PlanMoney = {
    ...base,
    billing: "upfront",
    month_mode: "upfront",
    extras_total: 500,
    next_invoice_on: "2026-11-01",
    next_invoice_amount: 10500,
    carry_notice: { allowance: 1200, half_days: 2, month: "2026-11-01", until: "2026-11-30" },
  };
  expect(planTitle(v)).toMatch(/AED\s?10,000 paid for October$/);
  expect(billLine(v)).toMatch(
    /^Next invoice 1 Nov: AED\s?10,500 \(November’s package \+ AED\s?500 extras so far\)$/,
  );
  expect(carryNoticeLine(v)).toMatch(/unused — carries over to November \(expires 30 Nov\)$/);
});

test("switched mid-month to upfront: this month on usage, upfront from the 1st", () => {
  const v: PlanMoney = {
    ...base,
    billing: "upfront",
    month_mode: "usage",
    upfront_from: "2026-11-01",
  };
  expect(monthMode(v)).toBe("usage");
  expect(upfrontLater(v)).toBe("Upfront billing starts 1 Nov");
});
