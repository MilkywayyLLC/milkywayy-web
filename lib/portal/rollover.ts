import { money } from "./billing";

/**
 * Package rollover (phase 1, 27 Oct 2026): the carried credit a value package month has, as the
 * database works it out (private.package_carry). A lot is one month's unused allowance and shoot
 * days; `expires` is the last month it can be used (first of that month).
 */
export type CarryLot = { from: string; allowance: number; half_days: number; expires: string };
export type RolloverRule = {
  enabled: boolean;
  months: number;
  allowance: boolean;
  days: boolean;
  source?: "client" | "package" | "default";
};
export type Carry = {
  in: CarryLot[];
  allowance: number;
  half_days: number;
  used: { from: string; allowance: number; half_days: number }[];
  used_allowance: number;
  used_half_days: number;
  expired: CarryLot[];
  out: CarryLot | null;
  rule: RolloverRule;
};

const monthName = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { month: "long" });

/** The last day a lot can be used: "30 Nov". */
export const expiresOn = (expires: string) => {
  const d = new Date(`${expires.slice(0, 10)}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 0);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** "0.5 days", "1 day", "2 days" from half-days. */
export const daysLabel = (halfDays: number) => {
  const n = Number(halfDays) / 2;
  return `${n} ${n === 1 ? "day" : "days"}`;
};

/** "AED 1,200 and 0.5 days", "AED 1,200", "0.5 days". */
export function creditLabel(currency: string, allowance: number, halfDays: number) {
  const parts = [
    Number(allowance) > 0 ? money(currency, Number(allowance)) : "",
    Number(halfDays) > 0 ? daysLabel(halfDays) : "",
  ].filter(Boolean);
  return parts.join(" and ");
}

/** "+ AED 1,200 and 0.5 days carried from October · expire 30 Nov", one per lot. */
export const carriedLines = (currency: string, c: Carry | null | undefined) =>
  (c?.in ?? [])
    .filter((l) => Number(l.allowance) > 0 || Number(l.half_days) > 0)
    .map(
      (l) =>
        `+ ${creditLabel(currency, l.allowance, l.half_days)} carried from ${monthName(l.from)} · expire ${expiresOn(l.expires)}`,
    );

/** Statement / admin lines: carried in, used from it, expired, carrying on. */
export function carrySummary(currency: string, c: Carry | null | undefined) {
  if (!c) return [];
  const rows: { key: string; label: string; value: string }[] = [];
  if (Number(c.allowance) > 0 || Number(c.half_days) > 0)
    rows.push({
      key: "in",
      label: "Carried in",
      value: creditLabel(currency, c.allowance, c.half_days),
    });
  if (Number(c.used_allowance) > 0 || Number(c.used_half_days) > 0)
    rows.push({
      key: "used",
      label: "Used from carried",
      value: creditLabel(currency, c.used_allowance, c.used_half_days),
    });
  for (const e of c.expired ?? [])
    rows.push({
      key: `exp-${e.from}`,
      label: `Expired (from ${monthName(e.from)})`,
      value: creditLabel(currency, e.allowance, e.half_days),
    });
  if (c.out)
    rows.push({
      key: "out",
      label: `Carries on · until ${expiresOn(c.out.expires)}`,
      value: creditLabel(currency, c.out.allowance, c.out.half_days),
    });
  return rows;
}

/** "On · 1 month · allowance and shoot days", "Off". */
export const ruleLabel = (r: RolloverRule) =>
  !r.enabled || r.months === 0
    ? "Off"
    : `${r.months} month${r.months === 1 ? "" : "s"} · ${
        r.allowance && r.days
          ? "allowance and shoot days"
          : r.allowance
            ? "allowance"
            : "shoot days"
      }`;
