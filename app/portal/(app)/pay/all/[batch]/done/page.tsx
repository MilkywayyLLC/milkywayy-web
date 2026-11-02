import Link from "next/link";
import { notFound } from "next/navigation";
import { ThankYou } from "@/components/portal/BookFrame";
import { ConfirmingPayment } from "@/components/portal/ConfirmingPayment";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { money } from "@/lib/portal/billing";
import { finishBatch } from "@/lib/portal/pay-actions";

export const metadata = { title: "Payment received" };

/** Back from Stripe after "Pay all": the same "Confirming payment…" wait as a single invoice. */
export default async function PayAllDone({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const [{ batch }, { session_id }] = await Promise.all([params, searchParams]);
  const r = await finishBatch(batch, session_id ?? "");
  if (r.state === "missing" || !r.batch) notFound();
  const b = r.batch;
  if (r.state === "open")
    return (
      <div className="pt-pay">
        <div className="pt-card" role="status">
          <b>The payment wasn’t completed</b>
          <span className="pt-meta">Nothing was charged. You can try again.</span>
          <Link href={`/portal/pay/all/${b.id}`} className="btn btn-p btn-s" style={{ justifySelf: "start" }}>
            Back to checkout
          </Link>
        </div>
      </div>
    );
  if (r.state === "confirming")
    return (
      <div className="pt-pay pt-pay-done" data-testid="pay-confirming">
        <ConfirmingPayment batchId={b.id} sessionId={session_id ?? ""} />
        <div className="pt-card" role="status" aria-live="polite">
          <b>Confirming payment…</b>
          <span className="pt-meta">
            Stripe has your payment. We’re recording it now; this usually takes a few seconds. You can
            leave this page: nothing will be charged twice.
          </span>
        </div>
      </div>
    );
  return (
    <div className="pt-pay pt-pay-done" data-testid="pay-done">
      {r.state === "processing" && <LiveRefresh />}
      <ThankYou
        idLabel="Invoices"
        id={b.invoices.map((i) => i.number).join(", ")}
        heading={r.state === "processing" ? "Your payment is going through" : "Payment received"}
        text={`${money(b.currency, Number(b.amount))} paid for ${b.invoices.length} invoices. Receipts are on their way by email.`}
      >
        <Link href="/portal/billing" className="btn btn-p btn-s">
          Back to Billing
        </Link>
      </ThankYou>
    </div>
  );
}
