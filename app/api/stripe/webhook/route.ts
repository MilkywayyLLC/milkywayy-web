import { portalAdminAs, portalAdminReady } from "@/lib/portal/admin";
import { dateLabel, money } from "@/lib/portal/billing";
import { notifyBilling, type Recipient } from "@/lib/portal/notify";
import { verifyWebhook } from "@/lib/stripe";

/**
 * Stripe → "this invoice is paid" (billing add-on). Only a correctly signed event counts, and the
 * database marks the invoice Paid only if the session, amount and currency match what we asked
 * for. Then the client gets "Payment received" (if they want billing emails).
 */
export const dynamic = "force-dynamic";

type Paid = {
  already: boolean;
  account: string;
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
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  )
    return Response.json({ received: true, ignored: event.type });
  const s = event.data.object as {
    id: string;
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    client_reference_id?: string | null;
    metadata?: { invoice_id?: string };
  };
  if (s.payment_status !== "paid") return Response.json({ received: true, pending: true });
  const invoice = s.client_reference_id ?? s.metadata?.invoice_id;
  if (!invoice || !portalAdminReady())
    return Response.json({ received: true, skipped: "no invoice" });
  const rpc = portalAdminAs("stripe");
  try {
    const out = await rpc<Paid>("portal_admin_stripe_paid", {
      p_invoice: invoice,
      p_session: s.id,
      p_amount_minor: s.amount_total ?? -1,
      p_currency: s.currency ?? "",
    });
    if (!out.already && out.recipients.length) {
      const link = `${new URL(req.url).origin}/portal/billing`;
      await notifyBilling(
        out.account,
        "payment_received",
        {
          number: out.number!,
          amount: money(out.currency!, out.amount!),
          due: dateLabel(out.due_on),
        },
        out.recipients,
        link,
        "stripe",
      );
    }
    return Response.json({ received: true, paid: !out.already });
  } catch (e) {
    // A mismatch won't fix itself on a retry: acknowledge, and leave it for a person.
    console.error("[stripe] couldn't mark paid:", invoice, e instanceof Error ? e.message : e);
    return Response.json({ received: true, error: "not marked paid" });
  }
}
