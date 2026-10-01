import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { capiEvent } from "@/lib/tracking/capi";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test("Conversions API event: MW ref as event id, personal data only hashed", () => {
  const e = capiEvent(
    {
      event: "Lead",
      eventId: "MW-1234",
      url: "https://milkywayy.com/contact",
      email: "  Hello@Example.COM ",
      phone: "+971 50 123 4567",
      ip: "203.0.113.9",
      userAgent: "UA",
      fbp: "fb.1.1.1",
      custom: { lead_type: "contact" },
    },
    1_700_000_000_000,
  );
  expect(e).toEqual({
    event_name: "Lead",
    event_time: 1_700_000_000,
    event_id: "MW-1234",
    action_source: "website",
    event_source_url: "https://milkywayy.com/contact",
    user_data: {
      em: [sha("hello@example.com")],
      ph: [sha("971501234567")],
      client_ip_address: "203.0.113.9",
      client_user_agent: "UA",
      fbp: "fb.1.1.1",
    },
    custom_data: { lead_type: "contact" },
  });
  expect(JSON.stringify(e)).not.toMatch(/hello@|501234567/);
});
