import { expect, test } from "@playwright/test";
import { DEFAULT_COUNTRY, toE164, TOP_COUNTRIES } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";

/**
 * Phones are stored in E.164 (CLIENT_PORTAL_GUIDE §12), read with the country picked in the
 * phone field. Overseas numbers are never read as UAE numbers (owner, 2 Oct 2026).
 */
const c = (iso: string) => COUNTRIES.find((x) => x.iso === iso)!;

test("numbers are read with the chosen country", () => {
  const cases: [string, string, string | null][] = [
    // UAE (default)
    ["AE", "050 123 4567", "+971501234567"],
    ["AE", "50 123 4567", "+971501234567"],
    ["AE", "04 123 4567", "+97141234567"],
    ["AE", "971 50 123 4567", "+971501234567"],
    // Top choices
    ["SA", "050 123 4567", "+966501234567"],
    ["GB", "07700 900123", "+447700900123"],
    ["GB", "7700 900123", "+447700900123"],
    ["US", "(415) 555-0100", "+14155550100"],
    ["US", "1 415 555 0100", "+14155550100"],
    ["CA", "604 555 0100", "+16045550100"],
    ["AU", "0412 345 678", "+61412345678"],
    ["IN", "98765 43210", "+919876543210"],
    ["IN", "91234 56789", "+919123456789"], // starts with 91 but is a national number
    // Trunk prefixes
    ["IT", "06 1234 5678", "+390612345678"], // Italy keeps its 0
    ["RU", "8 912 345 6789", "+79123456789"],
    // Written internationally: the picker is ignored
    ["AE", "+44 7700 900123", "+447700900123"],
    ["AE", "0044 7700 900123", "+447700900123"],
    ["GB", "+971 50 123 4567", "+971501234567"],
    // Not numbers
    ["AE", "abc", null],
    ["AE", "12", null],
    ["AE", "", null],
  ];
  for (const [iso, input, want] of cases)
    expect(toE164(input, c(iso)), `${iso} ${input}`).toBe(want);
});

test("an overseas number is never turned into a UAE number", () => {
  for (const [iso, input] of [
    ["GB", "07700 900123"],
    ["US", "415 555 0100"],
    ["IN", "98765 43210"],
    ["SA", "50 123 4567"],
    ["AU", "412 345 678"],
  ])
    expect(toE164(input, c(iso)), `${iso} ${input}`).not.toMatch(/^\+971/);
});

test("country list: UAE default, the seven top choices, every code valid and unique", () => {
  expect(DEFAULT_COUNTRY).toMatchObject({ iso: "AE", dial: "971" });
  expect(TOP_COUNTRIES.map((t) => t.iso)).toEqual(["AE", "SA", "GB", "US", "CA", "AU", "IN"]);
  for (const t of TOP_COUNTRIES) expect(c(t.iso)).toMatchObject({ dial: t.dial });
  expect(COUNTRIES.length).toBeGreaterThan(230);
  expect(new Set(COUNTRIES.map((x) => x.iso)).size).toBe(COUNTRIES.length);
  for (const x of COUNTRIES) {
    expect(x.iso).toMatch(/^[A-Z]{2}$/);
    expect(x.dial, x.name).toMatch(/^[1-9]\d{0,3}$/);
  }
});
