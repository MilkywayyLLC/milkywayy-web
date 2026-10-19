/**
 * Messages people send to the notifications number (+971 50 830 5678), which only sends updates
 * and sign-in codes. Everyone gets one short reply a day pointing to the chat number, and every
 * message is forwarded to the owner by email so nothing is missed (owner, 3 Oct 2026).
 */
export type Inbound = Record<string, string>;

export const replyText = (chatNumber: string) =>
  `Hi, this number only sends Milkywayy updates and sign-in codes. To chat with us, message us here: https://wa.me/${chatNumber}`;

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TwiML answer: the reply, or nothing. */
export const twiml = (reply?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${reply ? `<Message>${xml(reply)}</Message>` : ""}</Response>`;

/** "whatsapp:+971501234567" → "+971501234567" */
export const fromNumber = (m: Inbound) => (m.From ?? "").replace(/^whatsapp:/, "");

const pretty = (n: string) =>
  n.startsWith("+971") && n.length === 13
    ? `+971 ${n.slice(4, 6)} ${n.slice(6, 9)} ${n.slice(9)}`
    : n;

/** The forwarded email: who, what (text, buttons, media, location), and a tap-to-reply link. */
export function forwardEmail(m: Inbound, replied: boolean, chatNumber: string) {
  const from = fromNumber(m);
  const who = m.ProfileName ? `${m.ProfileName} (${pretty(from)})` : pretty(from);
  const media = Array.from({ length: Number(m.NumMedia ?? 0) || 0 }, (_, i) =>
    m[`MediaUrl${i}`] ? `${m[`MediaContentType${i}`] ?? "file"}: ${m[`MediaUrl${i}`]}` : "",
  ).filter(Boolean);
  const location =
    m.Latitude && m.Longitude ? `https://maps.google.com/?q=${m.Latitude},${m.Longitude}` : "";
  const lines = [
    `${who} sent a WhatsApp message to the notifications number (+971 50 830 5678):`,
    "",
    m.Body?.trim() || (media.length || location ? "" : "(no text)"),
    m.ButtonText ? `Tapped button: ${m.ButtonText}` : "",
    media.length
      ? `Attachments (open while signed in to Twilio if they ask for a login):\n${media.join("\n")}`
      : "",
    location ? `Location: ${location}` : "",
    "",
    `Reply from your phone (chat number +${chatNumber}): https://wa.me/${from.replace(/^\+/, "")}`,
    replied
      ? "They got the automatic reply pointing them to the chat number."
      : "No automatic reply this time (they already had one in the last 24 hours).",
    m.MessageSid ? `Twilio message: ${m.MessageSid}` : "",
  ];
  return {
    subject: `WhatsApp to the updates number from ${who}`,
    text: lines.filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "").join("\n"),
  };
}
