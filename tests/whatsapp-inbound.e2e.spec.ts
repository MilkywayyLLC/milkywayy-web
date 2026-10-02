import { expect, test } from "@playwright/test";

/** The webhook only answers Twilio: anything unsigned gets no reply (403, or 503 with no token set). */
test("the WhatsApp webhook refuses requests that aren't signed by Twilio", async ({ request }) => {
  const res = await request.post("/api/whatsapp/inbound", {
    form: { From: "whatsapp:+971501234567", To: "whatsapp:+971508305678", Body: "hello" },
    headers: { "X-Twilio-Signature": "not-a-real-signature" },
  });
  expect([403, 503]).toContain(res.status());
  expect(await res.text()).not.toContain("<Message>");
  expect((await request.get("/api/whatsapp/inbound")).status()).toBe(405);
});
