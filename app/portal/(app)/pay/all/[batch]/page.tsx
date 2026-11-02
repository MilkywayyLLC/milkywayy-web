import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutGuard } from "@/components/portal/CheckoutChrome";
import { PayPanel } from "@/components/portal/PayPanel";
import { dateLabel, invoicePeriod, money } from "@/lib/portal/billing";
import { batchView } from "@/lib/portal/pay-actions";
import { stripeReady } from "@/lib/stripe";

export const metadata = { title: "Pay all" };

/** "Pay all due" (2 Nov 2026): the chosen invoices as one payment, by card or one bank transfer. */
export default async function PayAll({ params }: { params: Promise<{ batch: string }> }) {
  const { batch } = await params;
  const b = await batchView(batch);
  if (!b) notFound();
  if (!b.unpaid)
    return (
      <div className="pt-pay">
        <div className="pt-card" role="status">
          <b>These invoices are paid</b>
          <Link href="/portal/billing" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
            Back to Billing
          </Link>
        </div>
      </div>
    );
  const open = b.invoices.filter((i) => i.status !== "paid");
  const submitted = open.every((i) => i.payment_state === "submitted");
  return (
    <div className="pt-pay">
      <div className="pt-head">
        <div>
          <Link href="/portal/billing" className="pt-back">
            ← Billing
          </Link>
          <h1 className="pt-h1">Pay all</h1>
        </div>
      </div>
      <CheckoutGuard back="/portal/billing" draftProject={null} />
      <div className="pt-pay-grid">
        <aside className="pt-card pt-pay-sum" aria-label="Summary">
          <span className="pt-eb">{b.account}</span>
          <h2 className="pt-h2">
            {open.length} invoice{open.length === 1 ? "" : "s"}
          </h2>
          <ul className="pt-summary">
            {open.map((i) => (
              <li key={i.id}>
                <span>
                  <span className="pt-mono">{i.number}</span>
                  {i.refs.length > 0 && ` · ${i.refs.join(", ")}`}
                  <span className="pt-meta"> · {invoicePeriod(i)} · Due {dateLabel(i.due_on, { year: undefined })}</span>
                </span>
                <span className="pt-mono">{money(b.currency, Number(i.amount))}</span>
              </li>
            ))}
            <li>
              <b>Total</b>
              <b>{money(b.currency, Number(b.amount))}</b>
            </li>
          </ul>
        </aside>
        <section className="pt-card pt-pay-form" aria-label="Payment">
          <PayPanel
            ids={open.map((i) => i.id)}
            numbers={open.map((i) => i.number)}
            amount={money(b.currency, Number(b.amount))}
            options={b.payment_options}
            cardReady={stripeReady()}
            bank={b.bank}
            target={{ kind: "batch", id: b.id }}
            state={submitted ? "submitted" : null}
          />
        </section>
      </div>
    </div>
  );
}
