"use client";

import { Icon } from "@/components/portal/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, money, useToast } from "@/components/portal/ui";
import { INVOICES, PAYG_LINES, SUGGESTION, waChat } from "@/lib/portal-mock/data";

export default function Billing() {
  const { persona, account } = usePersona();
  const [toast, say] = useToast();
  const lines = PAYG_LINES[persona];
  const total = lines.reduce((t, l) => t + l.qty * l.unit, 0);
  const sug = SUGGESTION[persona];
  const plan = account.plan;

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Owner and admins only</span>
          <h1 className="pt-h1">Billing</h1>
        </div>
      </div>

      <div className="pt-grid2">
        {plan.mode === "package" ? (
          <section className="pt-card">
            <div className="pt-row">
              <span className="pt-eb">Your plan</span>
              <Badge tone="solid">Monthly</Badge>
            </div>
            <div>
              <span className="pt-big">{plan.name}</span>
              <div className="pt-meta">
                {money(account.currency, plan.price)} / month · renews {plan.renews}
              </div>
            </div>
            {plan.usage.map((u) => (
              <div key={u.label} style={{ display: "grid", gap: 6 }}>
                <div className="pt-row pt-small">
                  <span>{u.label}</span>
                  <b>
                    {u.used} of {u.of} this month
                  </b>
                </div>
                <div className="pt-meter">
                  <i style={{ width: `${(u.used / u.of) * 100}%` }} />
                </div>
              </div>
            ))}
            <span className="pt-meta">
              Extra work beyond the package is billed at your package rates and shows below.
            </span>
          </section>
        ) : (
          sug && (
            <section className="pt-card pt-suggest">
              <span className="pt-eb">Suggested for you</span>
              <b style={{ fontSize: 18 }}>
                At your volume, {sug.pkg} would save you about {sug.saving} a month.
              </b>
              <span className="pt-meta">
                {sug.why} {sug.pkg} is {sug.price}.
              </span>
              <a
                className="btn btn-p btn-s"
                style={{ justifySelf: "start" }}
                href={waChat(`Hi, I'd like to hear about the ${sug.pkg} package.`)}
                target="_blank"
                rel="noopener"
              >
                Talk to us →
              </a>
            </section>
          )
        )}

        <section className="pt-card">
          <span className="pt-eb">
            {plan.mode === "package" ? "Extras this month" : "Pay as you go"}
          </span>
          <div>
            <span className="pt-big">{money(account.currency, total)}</span>
            <div className="pt-meta">October so far · estimate, final invoice after month end</div>
          </div>
          <table className="pt-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="pt-r">Qty</th>
                <th className="pt-r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.item}>
                  <td>{l.item}</td>
                  <td className="pt-r">{l.qty}</td>
                  <td className="pt-r">{money(account.currency, l.qty * l.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 className="pt-h2">Invoices</h2>
        <div className="pt-list">
          {INVOICES[persona].map((i) => (
            <div key={i.no} className="pt-file">
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{i.amount}</b>
                  <Badge
                    tone={i.status === "Paid" ? "ok" : i.status === "Overdue" ? "warn" : "solid"}
                  >
                    {i.status}
                  </Badge>
                </div>
                <div className="pt-meta pt-mono">
                  {i.no} · {i.date}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-g btn-s pt-btn-sm"
                onClick={() => say(`${i.no}.pdf downloaded (mockup)`)}
              >
                <Icon name="download" size={16} /> PDF
              </button>
            </div>
          ))}
        </div>
        <p className="pt-meta" style={{ margin: 0 }}>
          Pay by bank transfer; details are on each invoice. We mark it paid once it lands.
        </p>
      </section>
      {toast}
    </>
  );
}
