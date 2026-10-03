import Link from "next/link";
import { BillingNav } from "@/components/admin/BillingNav";
import {
  InvoiceActions,
  NewInvoiceForm,
  type InvoiceRowData,
} from "@/components/admin/BillingTools";
import { portalAdminPage, portalAdminReady, type ClientListRow } from "@/lib/portal/admin";
import { dateLabel, money, STATUS_LABEL } from "@/lib/portal/billing";

export const metadata = { title: "Billing" };

type Props = { searchParams: Promise<{ account?: string; status?: string }> };

/**
 * Admin → Billing → Invoices (§7.3): upload the PDF made in Milkywayy Ledger with its number,
 * dates, amount, currency and status. Clients see and download it in their Billing tab. Owner only.
 */
export default async function BillingInvoices({ searchParams }: Props) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  let invoices: InvoiceRowData[] = [];
  let clients: ClientListRow[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    [invoices, clients] = await Promise.all([
      rpc<InvoiceRowData[]>("portal_admin_invoices", {
        p_account: f.account || null,
        p_status: f.status || null,
      }),
      rpc<ClientListRow[]>("portal_admin_clients", {}),
    ]);
  const list = clients
    .map((c) => ({ id: c.id, name: c.name, currency: c.currency }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Billing</h1>
          <span className="ad-small ad-muted">
            Invoices, rates, packages and suggestions. Clients’ Owners and Admins see their own;
            Members never see prices.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing" />
      {error && <p className="ad-note warn">{error}</p>}
      <NewInvoiceForm clients={list} account={f.account} />
      <form className="ad-filter" method="get" role="search">
        <select name="account" defaultValue={f.account ?? ""} aria-label="Client">
          <option value="">All clients</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          <option value="due">Due</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
        <button className="ad-btn small" type="submit">
          Filter
        </button>
        {(f.account || f.status) && (
          <Link className="ad-btn quiet small" href="/admin/billing" prefetch={false}>
            Clear
          </Link>
        )}
      </form>
      <div className="ad-list" data-testid="invoices">
        {invoices.map((i) => (
          <div
            key={i.id}
            className="ad-row ad-lead"
            style={{ gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "start" }}
          >
            <span
              className={
                i.shown_status === "paid"
                  ? "ad-pill"
                  : i.shown_status === "overdue"
                    ? "ad-pill warn"
                    : "ad-pill live"
              }
            >
              {STATUS_LABEL[i.shown_status]}
            </span>
            <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
              <span className="ad-row-title">
                {i.number} · {i.account_name} · {money(i.currency, i.amount)}
              </span>
              <span className="ad-row-meta">
                {dateLabel(i.issued_on)} · due {dateLabel(i.due_on)}
              </span>
              <InvoiceActions inv={i} />
            </span>
          </div>
        ))}
        {!invoices.length && !error && (
          <p className="ad-empty">No invoices{f.account || f.status ? " match" : " yet"}.</p>
        )}
      </div>
    </div>
  );
}
