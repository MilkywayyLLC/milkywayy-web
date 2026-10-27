import { portalAdminAs, portalAdminReady } from "@/lib/portal/admin";
import { autopayFailed } from "@/lib/portal/autopay";
import { type Recipient } from "@/lib/portal/notify";
import { afterPaid, recordCardSaved, recordCheckoutPaid } from "@/lib/portal/payment-server";
import {
  cardOf,
  getCheckout,
  getPaymentMethod,
  verifyWebhook,
  type CheckoutSession,
  type PaymentIntent,
} from "@/lib/stripe";

/**
 * Stripe → our records (billing add-on; phase 1, 27 Oct 2026). Only a correctly signed event counts.
 *   checkout.session.completed / async_payment_succeeded  payment: the invoice is Paid (the database
 *     checks session, amount and currency); setup: the company's saved card is stored
 *   payment_intent.succeeded / payment_failed  saved-card (automatic) payments
 *   setup_intent.succeeded  a saved card, if the Checkout event didn't already store it
 *   refund.created / updated / failed  our refund row
 * A paid booking no longer confirms itself: it waits as "Pending confirmation" and Milkywayy is asked
 * to confirm it (or propose another time).
 */
export const dynamic = "force-dynamic";

type Paid = {
  already: boolean;
  account: string;
  project_id?: string | null;
  number?: string;
  amount?: number;
  currency?: string;
  due_on?: string;
  recipients: Recipient[];
};

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
        if (s.mode === "setup") {
          // The event doesn't carry the card: look the session up with it expanded.
          const card = await recordCardSaved(rpc, await getCheckout(s.id));
          return Response.json({ received: true, card: !!card });
        }
        if (s.payment_status !== "paid") return Response.json({ received: true, pending: true });
        const out = await recordCheckoutPaid(rpc, s, origin);
        return Response.json({ received: true, paid: out ? !out.already : false });
      }
      case "payment_intent.succeeded": {
        const pi = o as unknown as PaymentIntent;
        // Checkout payments are recorded by their session; this is for saved-card payments.
        if (pi.metadata?.autopay !== "1" || !pi.metadata.invoice_id)
          return Response.json({ received: true, ignored: "not a saved-card payment" });
        const out = await rpc<Paid>("portal_admin_stripe_pi_paid", {
          p_invoice: pi.metadata.invoice_id,
          p_pi: pi.id,
          p_amount_minor: pi.amount,
          p_currency: pi.currency,
        });
        await afterPaid(rpc, out, origin);
        return Response.json({ received: true, paid: !out.already });
      }
      case "payment_intent.payment_failed": {
        const pi = o as unknown as PaymentIntent;
        if (pi.metadata?.autopay !== "1" || !pi.metadata.invoice_id)
          return Response.json({ received: true, ignored: "not a saved-card payment" });
        await autopayFailed(
          rpc,
          pi.metadata.invoice_id,
          pi.id,
          pi.last_payment_error?.message ?? "Card declined",
          origin,
        );
        return Response.json({ received: true, failed: true });
      }
      case "setup_intent.succeeded": {
        const si = o as {
          payment_method?: string | null;
          customer?: string | null;
          metadata?: { account_id?: string };
        };
        if (!si.metadata?.account_id || !si.payment_method)
          return Response.json({ received: true, ignored: "no account" });
        const card = cardOf(await getPaymentMethod(si.payment_method));
        if (card)
          await rpc("portal_admin_set_stripe_customer", {
            p_account: si.metadata.account_id,
            p: { customer_id: si.customer, ...card },
          });
        return Response.json({ received: true, card: !!card });
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
