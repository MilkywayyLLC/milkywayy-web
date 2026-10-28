import { portalAdminAs, portalAdminReady } from "@/lib/portal/admin";
import { recordCheckoutPaid } from "@/lib/portal/payment-server";
import { verifyWebhook, type CheckoutSession } from "@/lib/stripe";

/**
 * Stripe → our records (billing add-on; phase 1, 27 Oct 2026). Only a correctly signed event counts.
 *   checkout.session.completed / async_payment_succeeded  payment: the invoice is Paid (the database
 *     checks session, amount and currency)
 *   refund.created / updated / failed  our refund row
 * A paid booking no longer confirms itself: it waits as "Pending confirmation" and Milkywayy is asked
 * to confirm it (or propose another time).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await req.text();
  const event = verifyWebhook(
    payload,
    req.headers.get("stripe-signature"),
    process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (!event) return Response.json({ error: "bad signature" }, { status: 400 });
  if (event.type.startsWith("refund.")) return refundEvent(event.data.object);
  if (!portalAdminReady()) return Response.json({ received: true, skipped: "no admin" });
  const origin = new URL(req.url).origin;
  const rpc = portalAdminAs("stripe");
  const o = event.data.object;
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = o as unknown as CheckoutSession;
        if (s.payment_status !== "paid") return Response.json({ received: true, pending: true });
        const out = await recordCheckoutPaid(rpc, s, origin);
        return Response.json({ received: true, paid: out ? !out.already : false });
      }
      default:
        return Response.json({ received: true, ignored: event.type });
    }
  } catch (e) {
    // A mismatch won't fix itself on a retry: acknowledge, and leave it for a person.
    console.error("[stripe] event not recorded:", event.type, e instanceof Error ? e.message : e);
    return Response.json({ received: true, error: "not recorded" });
  }
}

async function refundEvent(o: Record<string, unknown>) {
  const r = o as {
    id: string;
    status?: string;
    failure_reason?: string | null;
    metadata?: { refund_id?: string };
  };
  if (!portalAdminReady()) return Response.json({ received: true, skipped: "no admin" });
  const ours = r.metadata?.refund_id;
  try {
    const out = await portalAdminAs("stripe")<{ found: boolean }>("portal_admin_refund_by_stripe", {
      p_stripe_id: r.id,
      p_refund: ours && /^[0-9a-f-]{36}$/.test(ours) ? ours : null,
      p_status: r.status ?? "pending",
      p_error: r.failure_reason ?? null,
    });
    return Response.json({ received: true, refund: out.found ? r.status : "unknown" });
  } catch (e) {
    console.error("[stripe] refund event:", r.id, e instanceof Error ? e.message : e);
    return Response.json({ received: true, error: "not recorded" });
  }
}
