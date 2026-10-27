import { chargeSavedCard, stripeReady } from "@/lib/stripe";
import { portalAdminAs } from "./admin";
import { dateLabel, money } from "./billing";
import { firstName } from "./messages";
import { alertMilkywayyBilling, notifyPeople, type Recipient } from "./notify";
import { afterPaid } from "./payment-server";

/**
 * Automatic payments (phase 1, 27 Oct 2026): a company that opted in has its month-end invoices
 * charged to the saved card when they fall due, off-session. Runs from the daily housekeeping cron.
 * Up to 3 tries a day apart; each failure tells the company and Milkywayy.
 */
type Due = {
  id: string;
  account: string;
  number: string;
  amount: number;
  currency: string;
  customer_id: string;
  pm_id: string;
  attempts: number;
};

export async function runAutopay(origin: string) {
  if (!stripeReady()) return { charged: 0, failed: 0, skipped: "stripe off" };
  const rpc = portalAdminAs("autopay");
  const due = await rpc<Due[]>("portal_admin_autopay_due", {});
  let charged = 0;
  let failed = 0;
  for (const d of due ?? []) {
    try {
      const pi = await chargeSavedCard({
        customer: d.customer_id,
        pm: d.pm_id,
        invoiceId: d.id,
        number: d.number,
        amount: d.amount,
        currency: d.currency,
        attempt: d.attempts + 1,
      });
      await rpc("portal_admin_autopay_result", { p_invoice: d.id, p_pi: pi.id, p_error: null });
      if (pi.status === "succeeded") {
        // Recorded now; the webhook's copy of the same payment is a no-op.
        const out = await rpc<Parameters<typeof afterPaid>[1]>("portal_admin_stripe_pi_paid", {
          p_invoice: d.id,
          p_pi: pi.id,
          p_amount_minor: pi.amount,
          p_currency: pi.currency,
        });
        await afterPaid(rpc, out, origin);
        charged++;
      } else if (pi.status !== "processing") {
        failed++;
        await autopayFailed(
          rpc,
          d.id,
          pi.id,
          "The card needs the cardholder to confirm it",
          origin,
        );
      }
    } catch (e) {
      failed++;
      const m = e instanceof Error ? e.message.replace(/^Stripe \d+: /, "") : String(e);
      console.error("[autopay]", d.number, m);
      await autopayFailed(rpc, d.id, null, m, origin).catch(() => null);
    }
  }
  return { charged, failed };
}

/**
 * An automatic (saved-card) payment failed: recorded on the invoice, the company's billing people are
 * told to pay it another way, and Milkywayy gets a billing alert. Shared with the daily run.
 */
export async function autopayFailed(
  rpc: ReturnType<typeof portalAdminAs>,
  invoice: string,
  pi: string | null,
  error: string,
  origin: string,
) {
  const r = await rpc<{
    account: string;
    number: string;
    amount: number;
    currency: string;
    due_on: string;
    attempts: number;
    recipients: Recipient[];
  }>("portal_admin_autopay_result", { p_invoice: invoice, p_pi: pi, p_error: error });
  const amount = money(r.currency, r.amount);
  await notifyPeople({
    template: "autopay_failed",
    recipients: r.recipients,
    subject: `Automatic payment failed: ${r.number}`,
    lines: (name) => [
      `Hi ${firstName(name)},`,
      `We tried to charge your saved card for invoice ${r.number} (${amount}, due ${dateLabel(r.due_on)}) and it didn’t go through: ${error}.`,
      r.attempts < 3
        ? "We’ll try again tomorrow. You can also pay it now, or update your card, in Billing."
        : "We won’t try again. Please pay it in Billing, or update your card.",
    ],
    button: "Open Billing",
    link: `${origin}/portal/billing`,
    actor: "stripe",
  }).catch(() => 0);
  await alertMilkywayyBilling(
    r.account,
    "autopay_failed",
    `Automatic payment failed: ${r.number} (${amount})`,
    [`Saved-card payment for ${r.number} failed (try ${r.attempts} of 3): ${error}.`],
    `${origin}/admin/billing/invoices`,
  ).catch(() => null);
}
