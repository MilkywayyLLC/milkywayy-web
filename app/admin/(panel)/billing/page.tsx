import Link from "next/link";
import { BillingNav } from "@/components/admin/BillingNav";
import {
  NewInvoiceForm,
  PaymentReview,
  type InvoiceRowData,
} from "@/components/admin/BillingTools";
import { GenerateDrafts } from "@/components/admin/InvoiceDraft";
import { portalAdminPage, portalAdminReady, type ClientListRow } from "@/lib/portal/admin";
import {
  CATEGORY_LABEL,
  dateLabel,
  money,
  monthLabel,
  QUEUE_STATUS_LABEL,
  type InvoiceCategory,
  type QueueStatus,
} from "@/lib/portal/billing";

export const metadata = { title: "Invoice queue" };

type QueueRow = {
  id: string;
  account_id: string;
  account_name: string;
  number: string | null;
  category: InvoiceCategory | null;
  period_start: string | null;
  amount: number;
  currency: string;
  status: QueueStatus;
  shown_status: QueueStatus;
  publish_on: string | null;
  issued_on: string;
  due_on: string;
  advance: boolean;
  changed: boolean;
  payment_state: "submitted" | "rejected" | null;
};

const FILTERS = [
  ["", "All"],
  ["open", "To review"],
  ["draft", "Drafts"],
  ["approved", "Approved"],
  ["due", "Published"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
  ["submitted", "Payment submitted"],
] as const;

/**
 * Admin → Billing → Invoice queue (owner, 10 Oct 2026). Every invoice is a draft first: month-end
 * drafts appear on the 25th (budget and fixed packages, pay as you go billed monthly, and next
 * month's package for clients billed in advance); one-off drafts when a project is delivered.
 * Open one to edit and approve it. Approved month-end invoices publish on the month's last day,
 * one-offs on approval; publishing emails the client.
 */
export default async function InvoiceQueue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; deleted?: string }>;
}) {
  const rpc = await portalAdminPage();
  const f = await searchParams;
  const status = FILTERS.some(([k]) => k === f.status) ? (f.status ?? "") : "";
  // "Payment submitted": the transfers to confirm, each with its proof (as before the queue).
  const submitted = status === "submitted";
  let rows: QueueRow[] = [];
  let clients: ClientListRow[] = [];
  let proofs: InvoiceRowData[] = [];
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    [rows, clients, proofs] = await Promise.all([
      rpc<QueueRow[]>("portal_admin_invoice_queue", {
        p_status: submitted ? null : status || null,
      }),
      rpc<ClientListRow[]>("portal_admin_clients", {}),
      submitted
        ? rpc<InvoiceRowData[]>("portal_admin_invoices", { p_account: null, p_status: "submitted" })
        : Promise.resolve([]),
    ]);
  if (submitted) rows = rows.filter((r) => proofs.some((i) => i.id === r.id));
  const list = clients
    .map((c) => ({ id: c.id, name: c.name, currency: c.currency }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toReview = rows.filter((r) => r.status === "draft").length;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Billing</h1>
          <span className="ad-small ad-muted">
            Drafts are made on the 25th and when a one-off project is delivered. Nothing reaches a
            client until you approve it.
          </span>
        </div>
      </div>
      <BillingNav current="/admin/billing" />
      {error && <p className="ad-note warn">{error}</p>}
      {f.deleted && (
        <p className="ad-note" role="status">
          Draft deleted.
        </p>
      )}
      <div className="ad-card" style={{ gap: 10 }}>
        <div className="ad-row-between">
          <h2 className="ad-h2" style={{ margin: 0 }}>
            Invoice queue{toReview ? ` · ${toReview} to review` : ""}
          </h2>
          <GenerateDrafts />
        </div>
        <nav className="ad-btns" aria-label="Filter invoices">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              href={k ? `/admin/billing?status=${k}` : "/admin/billing"}
              prefetch={false}
              className={k === status ? "ad-btn small" : "ad-btn small ghost"}
              aria-current={k === status ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {proofs.map((i) => (
          <div key={i.id} className="ad-row ad-lead" style={{ display: "grid", gap: 6 }}>
            <span className="ad-row-title">
              {i.number} · {i.account_name} · {money(i.currency, i.amount)}
            </span>
            <PaymentReview inv={i} />
          </div>
        ))}
        <div className="ad-queue" role="table" aria-label="Invoices" data-testid="queue">
          <div role="row" className="ad-queue-row ad-th">
            <span role="columnheader">Client</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Period</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Status</span>
          </div>
          {rows.map((r) => (
            <Link
              key={r.id}
              role="row"
              href={`/admin/billing/invoices/${r.id}`}
              prefetch={false}
              className="ad-queue-row"
              data-testid="queue-row"
              aria-label={`${r.account_name} ${r.category ? CATEGORY_LABEL[r.category] : ""} ${r.number ?? "draft"}`}
            >
              <span role="cell">
                <b>{r.account_name}</b>
                <span className="ad-small ad-muted">{r.number ?? "No number yet"}</span>
              </span>
              <span role="cell">
                {r.category ? CATEGORY_LABEL[r.category] : "Invoice"}
                {r.advance ? " · in advance" : ""}
              </span>
              <span role="cell" className="ad-small">
                {r.period_start ? monthLabel(r.period_start) : dateLabel(r.issued_on)}
              </span>
              <span role="cell" className="ad-mono">
                {money(r.currency, Number(r.amount))}
              </span>
              <span role="cell">
                <span className={`ad-pill ${r.shown_status}`}>
                  {r.payment_state === "submitted" && r.status !== "paid"
                    ? "Payment submitted"
                    : QUEUE_STATUS_LABEL[r.shown_status]}
                </span>
                {r.status === "approved" && r.publish_on && (
                  <span className="ad-small ad-muted"> publishes {dateLabel(r.publish_on)}</span>
                )}
                {r.changed && <span className="ad-small ad-warn-text"> · activity changed</span>}
              </span>
            </Link>
          ))}
          {!rows.length && <p className="ad-empty">Nothing here.</p>}
        </div>
      </div>
      <NewInvoiceForm clients={list} />
    </div>
  );
}
