import { cx } from "@/lib/cx";
import { InvoiceDownload } from "@/components/portal/InvoiceDownload";
import {
  BankBox,
  HowYouPay,
  PackageBookings,
  PayActions,
  upcomingText,
  ValuePackageCard,
  type BillingPayments,
} from "@/components/portal/PaymentParts";
import { TERMS_LABEL } from "@/lib/portal/payments";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { ActivityList, BudgetCard } from "@/components/portal/Budget";
import { Badge } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  chatLink,
  dateLabel,
  extraCount,
  inclusionsText,
  money,
  monthLabel,
  shownStatus,
  STATUS_LABEL,
  type Invoice,
  type InvoiceLine,
  type MyBilling,
  type StatementRow,
} from "@/lib/portal/billing";
import { seesMoney } from "@/lib/portal/shell";
import { stripeReady } from "@/lib/stripe";

export const metadata = { title: "Billing" };

/**
 * Billing (§5.5; owner decisions 3–4 Oct 2026). Owner and Admins only (the database refuses
 * Members). Money shows only on invoices:
 * - Invoices (unpaid first): number, month, amount, status, PDF, Pay now / I've paid; each opens
 *   to its breakdown from the frozen month-end statement.
 * - A package: usage per inclusion as counts, what's left, extras as a count, renewal, "Month n
 *   of 6". Extras are billed on the next invoice.
 * - A package suggestion when one would save them money (or an offer pinned for them).
 * - A budget package (owner, 10 Oct 2026): "This month" against the monthly package and the
 *   month's activity by shoot, when the client's "Show budget and activity" switch is on.
 * Only published invoices reach the client (drafts and approved ones are Milkywayy's).
 */
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const { paid } = await searchParams;
  const { db, current } = await requireAccount("/portal/billing");
  if (!seesMoney(current))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include billing</b>
        <span className="pt-meta">Ask the account owner if you need an invoice.</span>
      </div>
    );
  const a = current.account;
  const [
    { data: billing, error },
    { data: invoiceRows },
    { data: statementRows },
    { data: payments },
  ] = await Promise.all([
    db.rpc("my_billing", { p_account: a.id }),
    db.from("invoices").select("*").eq("account_id", a.id),
    db.from("statements").select("*").eq("account_id", a.id),
    db.rpc("my_billing_payments", { p_account: a.id }),
  ]);
  const bp = payments as BillingPayments | null;
  if (error) console.error("[portal] my_billing:", error.message);
  const b = billing as MyBilling | null;
  const cardPay = stripeReady();
  const statements = new Map(
    ((statementRows ?? []) as StatementRow[]).map((s) => [s.month.slice(0, 10), s]),
  );
  // Unpaid first (soonest due on top), then paid (newest first).
  const invoices = ((invoiceRows ?? []) as Invoice[]).sort((x, y) => {
    const px = x.status === "paid" ? 1 : 0;
    const py = y.status === "paid" ? 1 : 0;
    if (px !== py) return px - py;
    return px ? y.issued_on.localeCompare(x.issued_on) : x.due_on.localeCompare(y.due_on);
  });
  const unpaid = invoices.some((i) => i.status !== "paid");
  // A value package (allowance + half-days) has its own card; the old inclusions card otherwise.
  const plan = bp?.value ? null : b?.plan;
  const anyOver = !!plan?.usage.some((u) => Number(u.over) > 0);

  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <h1 className="pt-h1">Billing</h1>
          {bp && (
            <span className="pt-meta" data-testid="terms">
              {bp.value ? "Monthly package · one invoice at month end" : TERMS_LABEL[bp.terms]}
              {upcomingText(bp.upcoming) ? ` · ${upcomingText(bp.upcoming)}` : ""}
            </span>
          )}
        </div>
      </div>
      {paid && (
        <p className="pt-card" role="status" style={{ margin: 0 }}>
          Thank you. Your card payment for {paid} is going through; it shows as Paid here in a
          moment, and we’ll email you.
        </p>
      )}

      {/* Top (owner, 24 Oct 2026): the plan and its meters, then how this client pays. */}
      {bp?.value && <ValuePackageCard v={bp.value} />}
      {!bp?.value && bp?.upcoming && (
        <section className="pt-card pt-plancard" data-testid="plan-upcoming">
          <span className="pt-eb">Your plan</span>
          <h2 className="pt-h2">{upcomingText(bp.upcoming)}</h2>
          <span className="pt-meta">
            {money(bp.upcoming.currency, bp.upcoming.price)} a month from{" "}
            {dateLabel(bp.upcoming.starts_on)}. Until then you pay per shoot.
          </span>
        </section>
      )}
      {bp && (
        <HowYouPay
          bp={bp}
          card={cardPay}
          chat={chatLink(`Hi, I have a question about billing for ${a.name}.`)}
        />
      )}
      {bp?.value && <PackageBookings v={bp.value} />}

      {b?.budget && <BudgetCard b={b.budget} currency={b.currency} />}
      {b?.budget && <ActivityList rows={b.budget.activity} currency={b.currency} />}
      {!b?.budget && b?.activity && <ActivityList rows={b.activity} currency={b.currency} />}

      {(plan || (b?.mode !== "budget" && b?.suggestion)) && (
        <div className="pt-grid2">
          {plan && (
            <section className="pt-card" aria-labelledby="plan-h" data-testid="plan">
              <div className="pt-row">
                <span className="pt-eb">
                  Your plan ·{" "}
                  {plan.prorated
                    ? "first month, pro-rated"
                    : plan.term_months === 6
                      ? plan.month_no && plan.month_no <= 6
                        ? `Month ${plan.month_no} of 6`
                        : "6-month contract"
                      : "monthly"}
                </span>
                <span className="pt-meta">Renews {dateLabel(plan.renews_on)}</span>
              </div>
              <h2 id="plan-h" className="pt-h2">
                {plan.name}
              </h2>
              {plan.term_months === 6 && plan.ends_on && (
                <span className="pt-meta">6-month contract until {dateLabel(plan.ends_on)}</span>
              )}
              {plan.prorated && (
                <span className="pt-meta" data-testid="prorated">
                  Started {dateLabel(plan.started_on)}: this month’s inclusions are pro-rated. Full
                  months from {dateLabel(plan.renews_on)}.
                </span>
              )}
              <span className="pt-eb">This month</span>
              <div className="pt-meters">
                {plan.usage.map((u) => {
                  const used = Number(u.used);
                  const qty = Number(u.qty);
                  const pct = Math.min(100, (used / Math.max(1, qty)) * 100);
                  return (
                    <div key={u.key} className="pt-usage">
                      <div className="pt-row">
                        <span>{u.label}</span>
                        <span className="pt-mono">
                          {used} of {qty} used
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
                          ? extraCount(Number(u.over), u.label)
                          : `${Number(u.remaining)} left this month`}
                      </span>
                    </div>
                  );
                })}
              </div>
              {plan.extra_items && plan.extra_items.length > 0 && (
                <div className="stack" style={{ gap: 6 }} data-testid="extras">
                  <span className="pt-eb">Extras this month</span>
                  <ul className="pt-summary" aria-label="Extras this month">
                    {plan.extra_items.map((e, i) => (
                      <li key={i}>
                        <span>{e.description}</span>
                        <span className="pt-mono">
                          × {Number(e.qty)}
                          {e.ref ? ` · ${e.ref}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(anyOver || !!plan.extra_items?.length) && (
                <span className="pt-meta" data-testid="extras-note">
                  Extras are billed at your agreed prices on your month-end invoice.
                </span>
              )}
            </section>
          )}

          {b?.mode === "budget" ? null : b?.suggestion ? (
            <section
              className="pt-card pt-suggest"
              aria-labelledby="sug-h"
              data-testid="suggestion"
            >
              <span className="pt-eb">
                {b.suggestion.show_saving ? "Package suggestion" : "Your offer"}
              </span>
              <h2 id="sug-h" className="pt-h2">
                {b.suggestion.package}
              </h2>
              <span>Includes {inclusionsText(b.suggestion.inclusions)} every month.</span>
              {b.suggestion.show_saving && b.suggestion.saving != null ? (
                <>
                  <span>
                    Based on your usage, {b.suggestion.package} could save you about{" "}
                    {money(b.suggestion.currency, b.suggestion.saving)} a month.
                  </span>
                  {b.suggestion.saving_6 != null && (
                    <span className="pt-meta">
                      On a 6-month plan ({Number(b.suggestion.discount_pct)}% off): about{" "}
                      {money(b.suggestion.currency, b.suggestion.saving_6)} a month.
                    </span>
                  )}
                </>
              ) : (
                <span>
                  {money(b.suggestion.currency, b.suggestion.price)} a month, or{" "}
                  {money(b.suggestion.currency, b.suggestion.price_6)} a month on a 6-month plan (
                  {Number(b.suggestion.discount_pct)}% off).
                </span>
              )}
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
          ) : null}
        </div>
      )}

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
              const month = i.statement_month ?? i.issued_on.slice(0, 8) + "01";
              const statement = i.statement_month
                ? statements.get(i.statement_month.slice(0, 10))
                : undefined;
              return (
                <div
                  key={i.id}
                  className="pt-inv-wrap"
                  role="group"
                  aria-label={`Invoice ${i.number ?? ""}`}
                >
                  <div className="pt-inv">
                    <div>
                      <b>{i.number ?? "Invoice"}</b>
                      <div className="pt-meta">
                        {monthLabel(month)} · due {dateLabel(i.due_on)}
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
                      {open && !submitted && bp && (
                        <PayActions
                          inv={i}
                          card={cardPay}
                          payOnline={bp.pay_online}
                          wio={bp.wio_link}
                        />
                      )}
                      {i.pdf_source === "generated" ? (
                        <a
                          className="btn btn-g btn-s"
                          href={`/portal/billing/invoice/${i.id}`}
                          download={`${i.number}.pdf`}
                        >
                          PDF
                        </a>
                      ) : (
                        i.pdf_key && <InvoiceDownload id={i.id} number={i.number ?? ""} />
                      )}
                    </span>
                  </div>
                  {/* A ledger invoice for a frozen month shows that month's statement; drafts carry their own lines. */}
                  {statement ? (
                    <details className="pt-breakdown">
                      <summary>Breakdown</summary>
                      <Breakdown s={statement} />
                    </details>
                  ) : (
                    !!i.lines?.length && (
                      <details className="pt-breakdown">
                        <summary>Breakdown</summary>
                        <InvoiceLines inv={i} />
                      </details>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            No invoices yet. They appear here, with a PDF, as soon as we issue them.
          </p>
        )}
        {!!bp?.refunds.length && (
          <div className="stack" style={{ gap: 6 }} data-testid="refunds">
            <span className="pt-eb">Refunds</span>
            <ul className="pt-lines" aria-label="Refunds">
              {bp.refunds.map((r, n) => (
                <li key={n}>
                  <span>
                    {r.ref ?? "Refund"} · {dateLabel(r.created_at)} ·{" "}
                    {r.method === "stripe" ? "to your card" : "by bank transfer"}
                  </span>
                  <span className="pt-mono">
                    {money(r.currency, Number(r.amount))} ·{" "}
                    {r.status === "done"
                      ? "sent"
                      : r.status === "failed"
                        ? "being checked"
                        : "on its way"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {bp && (unpaid || bp.value || bp.terms === "month_end") && (
        <BankBox bank={bp.bank} wio={bp.wio_link} />
      )}
    </>
  );
}

/** An invoice's month, as frozen on the 1st: what was delivered and how it adds up. */
function Breakdown({ s }: { s: StatementRow }) {
  const c = s.currency;
  const rows: [string, number][] = [];
  if (s.package) {
    rows.push([
      `${s.package.name}${s.package.prorated ? " (pro-rated first month)" : ""}`,
      Number(s.package.price),
    ]);
    for (const u of s.overage)
      if (Number(u.overage) > 0)
        rows.push([extraCount(Number(u.over), u.label), Number(u.overage)]);
    if (Number(s.package.extras_total) > 0)
      rows.push(["Extras at your prices", Number(s.package.extras_total)]);
    if (Number(s.package.before_total) > 0)
      rows.push(["Before the package started", Number(s.package.before_total)]);
  } else {
    for (const l of s.lines)
      rows.push([
        `${l.description} · ${l.ref} · ${Number(l.qty)} × ${money(c, Number(l.unit_price))}`,
        Number(l.amount),
      ]);
  }
  return (
    <ul className="pt-lines" data-testid="breakdown">
      {rows.map(([label, amount], n) => (
        <li key={n}>
          <span>{label}</span>
          <span className="pt-mono">{money(c, amount)}</span>
        </li>
      ))}
      {Number(s.vat) > 0 && (
        <>
          <li>
            <span>Subtotal</span>
            <span className="pt-mono">{money(c, Number(s.subtotal))}</span>
          </li>
          <li>
            <span>VAT {Number(s.vat_rate)}%</span>
            <span className="pt-mono">{money(c, Number(s.vat))}</span>
          </li>
        </>
      )}
      <li className="pt-lines-total">
        <b>{monthLabel(s.month)} total</b>
        <b className="pt-mono">{money(c, Number(s.total))}</b>
      </li>
    </ul>
  );
}

/** An invoice made from a draft: its own lines, VAT and total. */
function InvoiceLines({ inv }: { inv: Invoice }) {
  const c = inv.currency;
  const lines = (inv.lines ?? []) as InvoiceLine[];
  return (
    <ul className="pt-lines" data-testid="breakdown">
      {lines.map((l, n) => (
        <li key={n}>
          <span>
            {l.description}
            {Number(l.qty) !== 1 && ` · ${Number(l.qty)} × ${money(c, Number(l.unit_price))}`}
          </span>
          <span className="pt-mono">{money(c, Number(l.amount))}</span>
        </li>
      ))}
      {Number(inv.vat) > 0 && (
        <>
          <li>
            <span>Subtotal</span>
            <span className="pt-mono">{money(c, Number(inv.subtotal))}</span>
          </li>
          <li>
            <span>VAT {Number(inv.vat_rate)}%</span>
            <span className="pt-mono">{money(c, Number(inv.vat))}</span>
          </li>
        </>
      )}
      <li className="pt-lines-total">
        <b>Total</b>
        <b className="pt-mono">{money(c, Number(inv.amount))}</b>
      </li>
    </ul>
  );
}
