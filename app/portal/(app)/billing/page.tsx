import { cx } from "@/lib/cx";
import { InvoiceDownload } from "@/components/portal/InvoiceDownload";
import { PaidByTransfer, PayNow } from "@/components/portal/InvoicePay";
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
  const [{ data: billing, error }, { data: invoiceRows }, { data: statementRows }] =
    await Promise.all([
      db.rpc("my_billing", { p_account: a.id }),
      db.from("invoices").select("*").eq("account_id", a.id),
      db.from("statements").select("*").eq("account_id", a.id),
    ]);
  if (error) console.error("[portal] my_billing:", error.message);
  const b = billing as MyBilling | null;
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
  const plan = b?.plan;
  const anyOver = !!plan?.usage.some((u) => Number(u.over) > 0);

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

      {b?.budget && <BudgetCard b={b.budget} currency={b.currency} />}
      {b?.budget && <ActivityList rows={b.budget.activity} currency={b.currency} />}
      {!b?.budget && b?.activity && <ActivityList rows={b.activity} currency={b.currency} />}

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
                        ? extraCount(Number(u.over), u.label)
                        : `${Number(u.remaining)} left this month`}
                    </span>
                  </div>
                );
              })}
            </div>
            {anyOver && (
              <span className="pt-meta" data-testid="extras-note">
                Billed at your agreed rate on your next invoice.
              </span>
            )}
          </section>
        )}

        {b?.mode === "budget" ? null : b?.suggestion ? (
          <section className="pt-card pt-suggest" aria-labelledby="sug-h" data-testid="suggestion">
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
                      {open && !submitted && b?.pay_online && (
                        <PayNow id={i.id} number={i.number ?? ""} />
                      )}
                      {open && !submitted && b && !b.pay_online && (
                        <PaidByTransfer id={i.id} number={i.number ?? ""} />
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
      if (Number(u.over) > 0) rows.push([extraCount(Number(u.over), u.label), Number(u.overage)]);
    if (Number(s.package.extras_total) > 0)
      rows.push(["Other work at your rates", Number(s.package.extras_total)]);
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
