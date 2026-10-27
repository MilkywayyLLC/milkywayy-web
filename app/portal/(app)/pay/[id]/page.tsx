import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutGuard, PaySummaryBar } from "@/components/portal/CheckoutChrome";
import { PayChoice } from "@/components/portal/PayChoice";
import { money } from "@/lib/portal/billing";
import { payView } from "@/lib/portal/pay-actions";
import { pagePath } from "@/lib/portal/payment-server";
import { shortTitle } from "@/lib/portal/projects";
import { whenLabel } from "@/lib/portal/when";
import { stripeReady } from "@/lib/stripe";

export const metadata = { title: "Checkout" };

const STAGE: Record<string, string> = {
  full: "Paid in full (100%)",
  deposit: "Deposit (50%)",
  balance: "Balance (50%)",
  fee: "Change fee",
};
/** The phone summary bar's short word ("INV-1010 · Deposit AED 225"). */
const SHORT: Record<string, string> = {
  full: "Total",
  deposit: "Deposit",
  balance: "Balance",
  fee: "Fee",
};

/**
 * Checkout on our own site (phase 1, 27 Oct 2026): what's being paid, the availability note, and
 * Stripe Embedded Checkout. A teammate without billing access first chooses to pay with their own card
 * or send it to the company. Bank transfer stays a secondary option where the client allows it.
 */
export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await payView(id);
  if (!inv) notFound();
  const p = inv.project;
  const back = p ? pagePath("", p.type, p.ref) : "/portal/billing";
  if (!inv.unpaid)
    return (
      <div className="pt-pay">
        <div className="pt-card" role="status">
          <b>Invoice {inv.number} is paid</b>
          <Link href={back} className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
            {p ? "Back to the booking" : "Back to Billing"}
          </Link>
        </div>
      </div>
    );
  const shoot = p?.type === "shoot";
  // The summary: a side card on desktop, the bottom bar's sheet on phones (owner, 27 Oct 2026).
  const summary = (
    <>
      <span className="pt-eb">{inv.account}</span>
      {p && <h2 className="pt-h2">{shortTitle(p.title)}</h2>}
      <ul className="pt-summary">
        {p && (
          <li>
            <span>Booking</span>
            <span className="pt-mono">{p.ref}</span>
          </li>
        )}
        {shoot && p?.shoot_date && (
          <li>
            <span>Preferred date and time</span>
            <span>{whenLabel(p.shoot_date, p.start_time)}</span>
          </li>
        )}
        {p && inv.stage === "deposit" && (
          <li>
            <span>Booking total</span>
            <span>{money(inv.currency, Number(p.estimate))}</span>
          </li>
        )}
        <li>
          <span>Invoice</span>
          <span className="pt-mono">{inv.number}</span>
        </li>
        <li>
          <span>{STAGE[inv.stage ?? ""] ?? "Amount"}</span>
          <b>{money(inv.currency, Number(inv.amount))}</b>
        </li>
      </ul>
      {shoot && (
        <p className="pt-note" data-testid="availability-note">
          Your preferred date and time are subject to availability. We’ll review and email you once
          confirmed.
        </p>
      )}
    </>
  );
  return (
    <div className="pt-pay">
      <div className="pt-head">
        <div>
          <Link href={back} className="pt-back">
            ← {p ? p.ref : "Billing"}
          </Link>
          <h1 className="pt-h1">Checkout</h1>
        </div>
      </div>
      <CheckoutGuard
        back={back}
        draftProject={p && p.status === "awaiting_payment" ? p.id : null}
      />
      <div className="pt-pay-grid">
        <aside className="pt-card pt-pay-sum" aria-label="Summary">
          {summary}
        </aside>
        <section className="pt-card pt-pay-form" aria-label="Payment">
          {stripeReady() ? (
            <PayChoice
              invoiceId={inv.id}
              projectId={p?.id ?? null}
              teammate={!inv.billing}
              bank={inv.bank_transfer && inv.billing}
              back={back}
              number={inv.number}
            />
          ) : (
            <p className="pt-meta">
              Card payments aren’t switched on yet. Pay by bank transfer from{" "}
              <Link href={back}>{p ? "the booking page" : "Billing"}</Link>.
            </p>
          )}
        </section>
      </div>
      <PaySummaryBar
        label={`${inv.number} · ${SHORT[inv.stage ?? ""] ?? "Due"} ${money(inv.currency, Number(inv.amount))}`}
      >
        {summary}
      </PaySummaryBar>
    </div>
  );
}
