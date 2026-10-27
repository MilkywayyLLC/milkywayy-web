import Link from "next/link";
import { notFound } from "next/navigation";
import { ThankYou } from "@/components/portal/BookFrame";
import { ConfirmingPayment } from "@/components/portal/ConfirmingPayment";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { money } from "@/lib/portal/billing";
import { finishPayment } from "@/lib/portal/pay-actions";
import { pagePath } from "@/lib/portal/payment-server";
import { whenLabel } from "@/lib/portal/when";

export const metadata = { title: "Payment received" };

/**
 * Back from Stripe (phase 1, 27 Oct 2026): the session is checked with Stripe on the server. The webhook
 * records the payment (and sends the booking request), so until it lands the page says "Confirming
 * payment…" and checks again. A paid booking waits as "Pending confirmation".
 */
export default async function PayDone({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const [{ id }, { session_id }] = await Promise.all([params, searchParams]);
  const r = await finishPayment(id, session_id ?? "");
  if (r.state === "missing" || !r.inv) notFound();
  const inv = r.inv;
  const p = inv.project;
  const back = p ? pagePath("", p.type, p.ref) : "/portal/billing";
  if (r.state === "open")
    return (
      <div className="pt-pay">
        <div className="pt-card" role="status">
          <b>The payment wasn’t completed</b>
          <span className="pt-meta">Nothing was charged. You can try again.</span>
          <Link
            href={`/portal/pay/${inv.id}`}
            className="btn btn-p btn-s"
            style={{ justifySelf: "start" }}
          >
            Back to checkout
          </Link>
        </div>
      </div>
    );
  const shoot = p?.type === "shoot";
  if (r.state === "confirming")
    return (
      <div className="pt-pay pt-pay-done" data-testid="pay-confirming">
        <ConfirmingPayment invoiceId={inv.id} sessionId={session_id ?? ""} />
        <div className="pt-card" role="status" aria-live="polite">
          <b>Confirming payment…</b>
          <span className="pt-meta">
            Stripe has your payment. We’re recording it now; this usually takes a few seconds. You
            can leave this page: nothing will be charged twice.
          </span>
        </div>
      </div>
    );
  return (
    <div className="pt-pay pt-pay-done" data-testid="pay-done">
      {r.state === "processing" && <LiveRefresh />}
      <ThankYou
        idLabel={p ? "Booking ID" : "Invoice"}
        id={p ? p.ref : inv.number}
        heading={
          r.state === "processing"
            ? "Your payment is going through"
            : shoot
              ? "Payment received · pending confirmation"
              : "Payment received"
        }
        text={
          shoot
            ? `${money(inv.currency, Number(inv.amount))} paid for invoice ${inv.number}. Your preferred time${p?.shoot_date ? `, ${whenLabel(p.shoot_date, p.start_time)},` : ""} is subject to availability. We’ll review and email you once it’s confirmed. If we can’t make it, we’ll propose another time, and if it doesn’t suit you you get a full refund.`
            : `${money(inv.currency, Number(inv.amount))} paid for invoice ${inv.number}. A receipt is on its way by email.`
        }
      >
        <Link href={back} className="btn btn-p btn-s">
          {p ? "Track booking" : "Back to Billing"}
        </Link>
        <Link href="/portal/billing" className="btn btn-g btn-s">
          Billing
        </Link>
      </ThankYou>
    </div>
  );
}
