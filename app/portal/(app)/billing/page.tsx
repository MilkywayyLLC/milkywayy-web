import { cx } from "@/lib/cx";
import { InvoiceDownload } from "@/components/portal/InvoiceDownload";
import { PaidByTransfer, PayNow } from "@/components/portal/InvoicePay";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { Badge } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  chatLink,
  dateLabel,
  inclusionsText,
  money,
  monthLabel,
  shownStatus,
  STATUS_LABEL,
  type Invoice,
  type MyBilling,
} from "@/lib/portal/billing";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Billing" };

/**
 * Billing (§5.5; owner decisions 3–4 Oct 2026). Owner and Admins only: Members never see a price
 * (the database refuses them too).
 * - A package: usage per inclusion, what's left, overage, other work, the month's estimate,
 *   renewal, "Month 3 of 6" on a 6-month contract.
 * - Pay as you go: this month so far (an estimate) and last month's total; a package suggestion
 *   when one would save them enough.
 * - Invoices with the PDF; "Pay now" (card) or bank transfer with "I've paid".
 */
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const { paid } = await searchParams;
  const { db, current } = await requireAccount("/portal/billing");
  if (!isManager(current))
    return (
      <div className="pt-card">
        <b>Billing is for the account’s owner and admins</b>
        <span className="pt-meta">Ask them if you need an invoice.</span>
      </div>
    );
  const a = current.account;
  const [{ data: billing, error }, { data: invoiceRows }] = await Promise.all([
    db.rpc("my_billing", { p_account: a.id }),
    db.from("invoices").select("*").eq("account_id", a.id).order("issued_on", { ascending: false }),
  ]);
  if (error) console.error("[portal] my_billing:", error.message);
  const b = billing as MyBilling | null;
  const cur = b?.currency ?? a.currency;
  const invoices = (invoiceRows ?? []) as Invoice[];
  const month = new Date().toLocaleDateString("en-GB", { month: "long", timeZone: "Asia/Dubai" });
  const unpaid = invoices.some((i) => i.status !== "paid");

  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">Owner and admins only · {a.currency}</span>
          <h1 className="pt-h1">Billing</h1>
        </div>
      </div>
      {paid && (
        <p className="pt-card" role="status" style={{ margin: 0 }}>
          Thank you. Your card payment for {paid} is going through; it shows as Paid here in a
          moment, and we’ll email you.
        </p>
      )}

      <div className="pt-grid2">
        {b?.plan ? (
          <section className="pt-card" aria-labelledby="plan-h" data-testid="plan">
            <div className="pt-row">
              <span className="pt-eb">
                Your plan ·{" "}
                {b.plan.term_months === 6
                  ? b.plan.month_no <= 6
                    ? `Month ${b.plan.month_no} of 6`
                    : "6-month contract"
                  : "monthly"}
              </span>
              <span className="pt-meta">Renews {dateLabel(b.plan.renews_on)}</span>
            </div>
            <h2 id="plan-h" className="pt-h2">
              {b.plan.name}
            </h2>
            <span className="pt-meta">
              {money(b.plan.currency, b.plan.price)} a month
              {b.plan.term_months === 6 && b.plan.ends_on
                ? ` · 6-month contract until ${dateLabel(b.plan.ends_on)}`
                : ""}
            </span>
            <div className="pt-meters">
              {b.plan.usage.map((u) => {
                const used = Number(u.used);
                const qty = Number(u.qty);
                const pct = Math.min(100, (used / Math.max(1, qty)) * 100);
                return (
                  <div key={u.key} className="pt-usage">
                    <div className="pt-row">
                      <span>{u.label}</span>
                      <span className="pt-mono">
                        {used} of {qty}
                      </span>
                    </div>
                    <span
                      className={cx("pt-meter-bar", used > qty && "over")}
                      role="meter"
                      aria-label={`${u.label}: ${used} of ${qty}`}
                      aria-valuemin={0}
                      aria-valuemax={qty}
                      aria-valuenow={used}
                    >
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="pt-meta">
                      {Number(u.over) > 0
                        ? `${Number(u.over)} over · ${money(b.plan!.currency, Number(u.overage))}${u.rate != null ? ` at ${money(b.plan!.currency, Number(u.rate))} each` : ""}`
                        : `${Number(u.remaining)} left this month`}
                    </span>
                  </div>
                );
              })}
            </div>
            {b.plan.extras.length > 0 && (
              <>
                <span className="pt-eb">Other work this month</span>
                <ul className="pt-lines">
                  {b.plan.extras.map((i, n) => (
                    <li key={n}>
                      <span>
                        {i.description}
                        <span className="pt-meta">
                          {" "}
                          · {i.ref} · {Number(i.qty)} × {money(b.plan!.currency, i.unit_price)}
                        </span>
                      </span>
                      <span className="pt-mono">
                        {money(b.plan!.currency, Number(i.qty) * Number(i.unit_price))}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="pt-total" data-testid="estimate">
              <span>
                This month, estimated
                <span className="pt-meta" style={{ display: "block" }}>
                  {money(b.plan.currency, b.plan.price)} plan
                  {Number(b.plan.overage_total) > 0
                    ? ` + ${money(b.plan.currency, Number(b.plan.overage_total))} overage`
                    : ""}
                  {Number(b.plan.extras_total) > 0
                    ? ` + ${money(b.plan.currency, Number(b.plan.extras_total))} other work`
                    : ""}
                  {" · final invoice after month end"}
                </span>
              </span>
              <b className="pt-mono">{money(b.plan.currency, Number(b.plan.estimate))}</b>
            </div>
          </section>
        ) : (
          <section className="pt-card" aria-labelledby="payg-h" data-testid="payg">
            <span className="pt-eb">Pay as you go · {month} so far</span>
            <h2 id="payg-h" className="pt-h2" style={{ fontSize: 34 }}>
              {money(cur, b?.payg.total ?? 0)}
            </h2>
            <span className="pt-meta">Estimate · final invoice after month end</span>
            {b && b.payg.items.length > 0 ? (
              <ul className="pt-lines">
                {b.payg.items.map((i, n) => (
                  <li key={n}>
                    <span>
                      {i.description}
                      <span className="pt-meta">
                        {" "}
                        · {i.ref} · {Number(i.qty)} × {money(cur, i.unit_price)}
                      </span>
                    </span>
                    <span className="pt-mono">
                      {money(cur, Number(i.qty) * Number(i.unit_price))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="pt-meta">Nothing delivered yet this month.</span>
            )}
            {b?.payg.last_month && (
              <div className="pt-total" data-testid="last-month">
                <span>
                  {monthLabel(b.payg.last_month.month)}
                  <span className="pt-meta" style={{ display: "block" }}>
                    {b.payg.last_month.final ? "Final total" : "Total so far (not final yet)"}
                  </span>
                </span>
                <b className="pt-mono">{money(cur, Number(b.payg.last_month.total))}</b>
              </div>
            )}
          </section>
        )}

        {b?.suggestion ? (
          <section className="pt-card pt-suggest" aria-labelledby="sug-h" data-testid="suggestion">
            <span className="pt-eb">A package would save you money</span>
            <h2 id="sug-h" className="pt-h2">
              {b.suggestion.package}: {money(b.suggestion.currency, b.suggestion.price)} a month
            </h2>
            <span>Includes {inclusionsText(b.suggestion.inclusions)} every month.</span>
            <span className="pt-meta">
              Over your last 3 months you averaged{" "}
              {money(b.suggestion.currency, b.suggestion.average)} a month. With{" "}
              {b.suggestion.package}, the same work would be about{" "}
              {money(b.suggestion.currency, b.suggestion.cost)}
              {Number(b.suggestion.overage) + Number(b.suggestion.uncovered) > 0
                ? " (including extras at your rates)"
                : ""}
              .
            </span>
            <dl className="pt-offer">
              <div>
                <dt>Monthly</dt>
                <dd>
                  {money(b.suggestion.currency, b.suggestion.price)}
                  <small>save ~{money(b.suggestion.currency, b.suggestion.saving)} a month</small>
                </dd>
              </div>
              <div>
                <dt>6 months ({Number(b.suggestion.discount_pct)}% off)</dt>
                <dd>
                  {money(b.suggestion.currency, b.suggestion.price_6)}
                  <small>save ~{money(b.suggestion.currency, b.suggestion.saving_6)} a month</small>
                </dd>
              </div>
            </dl>
            <a
              className="btn btn-p btn-s"
              style={{ justifySelf: "start" }}
              href={chatLink(
                `Hi Milkywayy, I'd like to talk about the ${b.suggestion.package} package for ${a.name}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Talk to us →
            </a>
          </section>
        ) : (
          <section className="pt-card" aria-labelledby="q-h">
            <span className="pt-eb">Questions</span>
            <h2 id="q-h" className="pt-h2">
              Something on an invoice?
            </h2>
            <span className="pt-meta">Send us a message and a real person replies.</span>
            <a
              className="btn btn-g btn-s"
              style={{ justifySelf: "start" }}
              href={chatLink(`Hi, I have a question about billing for ${a.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp us
            </a>
          </section>
        )}
      </div>

      <section className="pt-card" aria-labelledby="inv-h">
        <h2 id="inv-h" className="pt-h2">
          Invoices
        </h2>
        {invoices.length ? (
          <div className="pt-list" data-testid="invoices">
            {invoices.map((i) => {
              const st = shownStatus(i);
              const open = st !== "paid";
              const submitted = open && i.payment_state === "submitted";
              return (
                <div key={i.id} className="pt-inv" role="group" aria-label={`Invoice ${i.number}`}>
                  <div>
                    <b>{i.number}</b>
                    <div className="pt-meta">
                      {dateLabel(i.issued_on)} · due {dateLabel(i.due_on)}
                      {i.paid_via === "stripe" ? " · paid by card" : ""}
                      {i.paid_via === "bank" ? " · paid by bank transfer" : ""}
                    </div>
                    {open && i.payment_state === "rejected" && (
                      <div className="pt-meta pt-warn-text">
                        We couldn’t confirm your transfer: {i.reject_reason}. Upload the proof
                        again.
                      </div>
                    )}
                  </div>
                  <span className="pt-mono">{money(i.currency, i.amount)}</span>
                  <Badge
                    tone={
                      st === "paid"
                        ? "ok"
                        : submitted
                          ? undefined
                          : st === "overdue"
                            ? "warn"
                            : "gold"
                    }
                  >
                    {submitted ? "Payment submitted" : STATUS_LABEL[st]}
                  </Badge>
                  <span className="pt-inv-actions">
                    {open && !submitted && b?.pay_online && <PayNow id={i.id} number={i.number} />}
                    {open && !submitted && b && !b.pay_online && (
                      <PaidByTransfer id={i.id} number={i.number} />
                    )}
                    {i.pdf_key && <InvoiceDownload id={i.id} number={i.number} />}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            No invoices yet. They appear here, with a PDF, as soon as we issue them.
          </p>
        )}
        {unpaid && b && !b.pay_online && (
          <div className="pt-card pt-bank" data-testid="bank">
            <span className="pt-eb">Pay by bank transfer</span>
            {b.bank ? (
              <dl>
                {b.bank.account_name && (
                  <div>
                    <dt>Account name</dt>
                    <dd>{b.bank.account_name}</dd>
                  </div>
                )}
                {b.bank.bank && (
                  <div>
                    <dt>Bank</dt>
                    <dd>{b.bank.bank}</dd>
                  </div>
                )}
                <div>
                  <dt>IBAN</dt>
                  <dd className="pt-mono">{b.bank.iban}</dd>
                </div>
                {b.bank.swift && (
                  <div>
                    <dt>SWIFT</dt>
                    <dd className="pt-mono">{b.bank.swift}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <span className="pt-meta">WhatsApp us for our bank details.</span>
            )}
            <span className="pt-meta">
              Put the invoice number in the reference, then tap “I’ve paid” and upload the receipt.
            </span>
          </div>
        )}
      </section>

      {b && b.statements.length > 0 && (
        <section className="pt-card" aria-labelledby="st-h" data-testid="statements">
          <h2 id="st-h" className="pt-h2">
            Monthly statements
          </h2>
          <ul className="pt-lines">
            {b.statements.map((s) => (
              <li key={s.month}>
                <span>
                  {monthLabel(s.month)}
                  {Number(s.vat) > 0 && (
                    <span className="pt-meta"> · incl. VAT {money(s.currency, Number(s.vat))}</span>
                  )}
                </span>
                <span className="pt-mono">{money(s.currency, Number(s.total))}</span>
              </li>
            ))}
          </ul>
          <span className="pt-meta">
            Each month’s statement is final on the 1st; the invoice follows it.
          </span>
        </section>
      )}
    </>
  );
}
