// After a successful portal sign-in by phone: tells Twilio Verify the custom code was used
// (Twilio asks for this feedback on custom-code verifications). Called by our server only,
// with PORTAL_HOOK_SECRET in the x-portal-hook-secret header. Secrets as in send-sms.

const env = (k: string) => Deno.env.get(k) ?? "";

function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!same(req.headers.get("x-portal-hook-secret") ?? "", env("PORTAL_HOOK_SECRET")))
    return new Response("Not allowed", { status: 401 });
  const { phone } = await req.json().catch(() => ({ phone: "" }));
  if (!/^\+[1-9]\d{7,14}$/.test(phone ?? "")) return new Response("Bad phone", { status: 400 });

  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/portal_otp_used`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: env("PORTAL_HOOK_SECRET"), p_phone: phone }),
  });
  const sid = r.ok ? await r.json() : null;
  if (!sid)
    return new Response(JSON.stringify({ approved: false }), {
      headers: { "Content-Type": "application/json" },
    });

  const auth = btoa(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`);
  const t = await fetch(
    `https://verify.twilio.com/v2/Services/${env("TWILIO_VERIFY_SERVICE_SID")}/Verifications/${sid}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "approved" }),
    },
  );
  if (!t.ok) console.error("[otp-feedback] Twilio", t.status, await t.text());
  return new Response(JSON.stringify({ approved: t.ok }), {
    headers: { "Content-Type": "application/json" },
  });
});
