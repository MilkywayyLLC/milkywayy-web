import { expect, test } from "@playwright/test";
import { forwardEmail, replyText, twiml } from "@/lib/twilio/inbound";
import { twilioSignature, validTwilioSignature } from "@/lib/twilio/signature";
import { TWILIO_NOTIFICATIONS_NUMBER } from "@/lib/whatsapp";

/** The notifications number's inbound webhook: auto-reply + email forwarding (owner, 3 Oct 2026). */

const VECTOR = {
  url: "https://example.com/myapp.php?foo=1&bar=2",
  params: {
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675310",
    Digits: "1234",
    From: "+14158675310",
    To: "+18005551212",
  },
};

test("signature matches Twilio's published example", () => {
  expect(twilioSignature(VECTOR.url, VECTOR.params, "12345")).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
});

test("signature check refuses tampering, other URLs and other tokens", () => {
  const sig = twilioSignature(VECTOR.url, VECTOR.params, "12345");
  expect(validTwilioSignature(sig, [VECTOR.url], VECTOR.params, "12345")).toBe(true);
  expect(
    validTwilioSignature(sig, ["https://evil.example/x", VECTOR.url], VECTOR.params, "12345"),
  ).toBe(true);
  expect(
    validTwilioSignature(sig, [VECTOR.url], { ...VECTOR.params, Digits: "9999" }, "12345"),
  ).toBe(false);
  expect(validTwilioSignature(sig, ["https://example.com/other"], VECTOR.params, "12345")).toBe(
    false,
  );
  expect(validTwilioSignature(sig, [VECTOR.url], VECTOR.params, "54321")).toBe(false);
  expect(validTwilioSignature(null, [VECTOR.url], VECTOR.params, "12345")).toBe(false);
  expect(validTwilioSignature(sig, [VECTOR.url], VECTOR.params, "")).toBe(false);
});

test("the auto-reply points to the chat number, never the notifications number", () => {
  const text = replyText("971507263306");
  expect(text).toContain("https://wa.me/971507263306");
  expect(text).not.toContain(TWILIO_NOTIFICATIONS_NUMBER);
  expect(twiml(text)).toBe(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`,
  );
  expect(twiml()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  expect(twiml('a < b & "c"')).toContain("<Message>a &lt; b &amp; &quot;c&quot;</Message>");
});

test("the forwarded email has the sender, the message, attachments and a tap-to-reply link", () => {
  const mail = forwardEmail(
    {
      From: "whatsapp:+971501234567",
      ProfileName: "Sara",
      Body: "Hi, where are my photos?",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/ME1",
      MediaContentType0: "image/jpeg",
      ButtonText: "Yes, confirm",
      MessageSid: "SM123",
    },
    true,
    "971507263306",
  );
  expect(mail.subject).toBe("WhatsApp to the updates number from Sara (+971 50 123 4567)");
  expect(mail.text).toContain("Hi, where are my photos?");
  expect(mail.text).toContain("Tapped button: Yes, confirm");
  expect(mail.text).toContain("image/jpeg: https://api.twilio.com/media/ME1");
  expect(mail.text).toContain("https://wa.me/971501234567");
  expect(mail.text).toContain("They got the automatic reply");

  const again = forwardEmail(
    { From: "whatsapp:+447700900123", Latitude: "25.2", Longitude: "55.3" },
    false,
    "971507263306",
  );
  expect(again.subject).toBe("WhatsApp to the updates number from +447700900123");
  expect(again.text).toContain("Location: https://maps.google.com/?q=25.2,55.3");
  expect(again.text).toContain("No automatic reply this time");
});
