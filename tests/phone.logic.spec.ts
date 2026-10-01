import { expect, test } from "@playwright/test";
import { toE164 } from "@/lib/leads/phone";

/** Phones are stored in E.164 (CLIENT_PORTAL_GUIDE §12); no country code means UAE. */
test("phone numbers become E.164", () => {
  const cases: [string, string | null][] = [
    ["+971 50 123 4567", "+971501234567"],
    ["+971-50-123-4567", "+971501234567"],
    ["00971 50 123 4567", "+971501234567"],
    ["050 123 4567", "+971501234567"],
    ["50 123 4567", "+971501234567"],
    ["04 123 4567", "+97141234567"],
    ["+44 7700 900123", "+447700900123"],
    ["447700900123", "+447700900123"],
    ["+1 (415) 555-0100", "+14155550100"],
    ["abc", null],
    ["+971 50", null],
    ["+0 123 456 789", null],
    ["", null],
  ];
  for (const [input, want] of cases) expect(toE164(input), input).toBe(want);
});
