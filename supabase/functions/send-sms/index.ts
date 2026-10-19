// Supabase Auth "Send SMS" hook (dev project now, production later): sends each sign-in code
// through Twilio Verify in English, on WhatsApp or SMS as the person chose.
//
// Supabase creates the code and checks it; this only delivers it. Twilio Verify would otherwise
// pick the language from the country code (+971 → Arabic), so every request sets Locale=en and
// passes Supabase's code as Verify's CustomCode ("Enable Custom Verification Code" must be on in
// the Verify service). The WhatsApp/SMS choice comes from portal_otp_channel(), which our server
// sets just before asking for a code.
//
// Secrets (Supabase → Edge Functions → Secrets): SEND_SMS_HOOK_SECRET (from the hook settings),
// PORTAL_HOOK_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.
// Deployed with JWT checks off: the hook's own signature (Standard Webhooks) is checked instead.

const env = (k: string) => Deno.env.get(k) ?? "";
const enc = new TextEncoder();

function fail(status: number, message: string) {
  console.error("[send-sms]", message);
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Standard Webhooks: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)), "v1,<sig>". */
async function signedBySupabase(req: Request, body: string) {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigs = req.headers.get("webhook-signature");
  const secret = env("SEND_SMS_HOOK_SECRET").replace(/^v1,whsec_/, "");
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`)),
  );
  const want = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => {
    const got = s.split(",")[1] ?? "";
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    return diff === 0;
  });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: env("PORTAL_HOOK_SECRET"), ...args }),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await req.text();
  if (!(await signedBySupabase(req, body))) return fail(401, "Not signed by Supabase Auth");

  let payload: { user?: { phone?: string }; sms?: { otp?: string; phone?: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return fail(400, "Bad payload");
  }
  const digits = (payload.sms?.phone || payload.user?.phone || "").replace(/\D/g, "");
  const otp = payload.sms?.otp ?? "";
  if (!digits || !/^\d{4,10}$/.test(otp)) return fail(400, "Missing phone or code");
  const phone = `+${digits}`;

  let channel = "whatsapp";
  try {
    channel = (await rpc("portal_otp_channel", { p_phone: phone })) === "sms" ? "sms" : "whatsapp";
  } catch (e) {
    console.error("[send-sms] channel lookup failed, using WhatsApp:", String(e));
  }

  const auth = btoa(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`);
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${env("TWILIO_VERIFY_SERVICE_SID")}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Channel: channel, CustomCode: otp, Locale: "en" }),
    },
  );
  const out = await r.json().catch(() => ({}));
  if (!r.ok)
    return fail(502, `Twilio Verify ${r.status}: ${out.code ?? ""} ${out.message ?? ""}`.trim());

  try {
    await rpc("portal_otp_sent", { p_phone: phone, p_sid: out.sid });
  } catch (e) {
    console.error("[send-sms] couldn't record the verification:", String(e)); // the code was still sent
  }
  return new Response("{}", { headers: { "Content-Type": "application/json" } });
});
