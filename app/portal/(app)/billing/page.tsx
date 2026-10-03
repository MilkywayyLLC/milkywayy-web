import { cx } from "@/lib/cx";
import { InvoiceDownload } from "@/components/portal/InvoiceDownload";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { Badge } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  chatLink,
  dateLabel,
  money,
  shownStatus,
  STATUS_LABEL,
  type Invoice,
  type MyBilling,
} from "@/lib/portal/billing";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Billing" };

/**
 * Billing (§5.5; owner decisions 3 Oct 2026). Owner and Admins only: Members never see a price
 * (the database refuses them too). The plan and its usage, or this month's pay-as-you-go total
 * (an estimate), a package suggestion when the rules say so, and every invoice with its PDF.
 */
export default async function Billing() {
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
  const invoices = (invoiceRows ?? []) as Invoice[];
  const month = new Date().toLocaleDateString("en-GB", { month: "long", timeZone: "Asia/Dubai" });

  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">Owner and admins only · {a.currency}</span>
          <h1 className="pt-h1">Billing</h1>
        </div>
      </div>

      <div className="pt-grid2">
        {b?.plan ? (
          <section className="pt-card" aria-labelledby="plan-h" data-testid="plan">
            <div className="pt-row">
              <span className="pt-eb">Your plan · monthly</span>
              <span className="pt-meta">Renews {dateLabel(b.plan.renews_on)}</span>
            </div>
            <h2 id="plan-h" className="pt-h2">
              {b.plan.name}
            </h2>
            <span className="pt-meta">{money(b.plan.currency, b.plan.price)} a month</span>
            <div className="pt-meters">
              {b.plan.usage.map((u) => {
                const pct = Math.min(100, (Number(u.used) / Math.max(1, Number(u.qty))) * 100);
                return (
                  <div key={u.key} className="pt-usage">
                    <div className="pt-row">
                      <span>{u.label}</span>
                      <span className="pt-mono">
                        {Number(u.used)} of {Number(u.qty)}
                      </span>
                    </div>
                    <span
                      className={cx("pt-meter-bar", Number(u.used) > Number(u.qty) && "over")}
                      role="meter"
                      aria-label={`${u.label}: ${Number(u.used)} of ${Number(u.qty)}`}
                      aria-valuemin={0}
                      aria-valuemax={Number(u.qty)}
                      aria-valuenow={Number(u.used)}
                    >
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
            {b.plan.overage.length > 0 && (
              <span className="pt-meta">
                Beyond your plan:{" "}
                {b.plan.overage
                  .map((o) => `${o.label} ${money(b.plan!.currency, o.amount)}`)
                  .join(" · ")}
              </span>
            )}
          </section>
        ) : (
          <section className="pt-card" aria-labelledby="payg-h" data-testid="payg">
            <span className="pt-eb">Pay as you go · {month} so far</span>
            <h2 id="payg-h" className="pt-h2" style={{ fontSize: 34 }}>
              {money(b?.currency ?? a.currency, b?.payg.total ?? 0)}
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
                        · {i.ref} · {Number(i.qty)} × {money(b.currency, i.unit_price)}
                      </span>
                    </span>
                    <span className="pt-mono">
                      {money(b.currency, Number(i.qty) * Number(i.unit_price))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="pt-meta">Nothing delivered yet this month.</span>
            )}
          </section>
        )}

        {b?.suggestion ? (
          <section className="pt-card pt-suggest" aria-labelledby="sug-h" data-testid="suggestion">
            <span className="pt-eb">A thought</span>
            <h2 id="sug-h" className="pt-h2">
              At your volume, {b.suggestion.package} would save you about{" "}
              {money(b.suggestion.currency, b.suggestion.saving)} a month.
            </h2>
            <span className="pt-meta">
              You’ve averaged {money(b.suggestion.currency, b.suggestion.average)} a month; the
              package is {money(b.suggestion.currency, b.suggestion.price)}.
            </span>
            <a
              className="btn btn-p btn-s"
              style={{ justifySelf: "start" }}
              href={chatLink(
                `Hi, I'd like to hear about the ${b.suggestion.package} package for ${a.name}.`,
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
              return (
                <div key={i.id} className="pt-inv">
                  <div>
                    <b>{i.number}</b>
                    <div className="pt-meta">
                      {dateLabel(i.issued_on)} · due {dateLabel(i.due_on)}
                    </div>
                  </div>
                  <span className="pt-mono">{money(i.currency, i.amount)}</span>
                  <Badge tone={st === "paid" ? "ok" : st === "overdue" ? "warn" : "gold"}>
                    {STATUS_LABEL[st]}
                  </Badge>
                  {i.pdf_key ? <InvoiceDownload id={i.id} number={i.number} /> : <span />}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            No invoices yet. They appear here, with a PDF, as soon as we issue them.
          </p>
        )}
      </section>
    </>
  );
}
