import Link from "next/link";
import { Pill, type Tone } from "@/components/admin/Pill";
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
  refundState,
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
  stage?: "full" | "deposit" | "balance" | "fee" | null;
};

const STAGE: Record<string, string> = {
  full: "Booking 100%",
  deposit: "Deposit 50%",
  balance: "Balance",
  fee: "Late fee",
};
/** The payment column (owner, 24 Oct 2026): what the client owes on it. */
const paymentStatus = (r: QueueRow) =>
  r.status === "paid"
    ? "Paid"
    : r.status === "void"
      ? "Cancelled"
      : r.status === "draft" || r.status === "approved"
        ? "—"
        : r.payment_state === "submitted"
          ? "Receipt uploaded"
          : r.shown_status === "overdue"
            ? "Overdue"
            : "Unpaid";

const PAY_TONE: Record<string, Tone> = {
  Paid: "ok",
  Overdue: "danger",
  "Receipt uploaded": "warn",
  Unpaid: "info",
  Cancelled: "danger",
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
  let refunded: Record<string, number> = {};
  let error = "";
  if (!portalAdminReady()) error = "PORTAL_ADMIN_SECRET isn’t set for this deployment.";
  else
    [rows, clients, proofs, refunded] = await Promise.all([
      rpc<QueueRow[]>("portal_admin_invoice_queue", {
        p_status: submitted ? null : status || null,
      }),
      rpc<ClientListRow[]>("portal_admin_clients", {}),
      submitted
        ? rpc<InvoiceRowData[]>("portal_admin_invoices", { p_account: null, p_status: "submitted" })
        : Promise.resolve([]),
      rpc<Record<string, number>>("portal_admin_refunded_invoices", {}),
    ]);
  if (submitted) rows = rows.filter((r) => proofs.some((i) => i.id === r.id));
  const list = clients
    .map((c) => ({ id: c.id, name: c.name, currency: c.currency }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toReview = rows.filter((r) => r.status === "draft").length;
  // Chip counts from every invoice (one more call only when a filter is on).
  const every =
    !error && (status || submitted)
      ? await rpc<QueueRow[]>("portal_admin_invoice_queue", { p_status: null })
      : rows;
  const counts: Record<string, number> = {
    "": every.length,
    draft: every.filter((r) => r.status === "draft").length,
    approved: every.filter((r) => r.status === "approved").length,
    overdue: every.filter((r) => r.shown_status === "overdue").length,
    paid: every.filter((r) => r.status === "paid").length,
    submitted: every.filter((r) => r.payment_state === "submitted" && r.status !== "paid").length,
  };

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Money</span>
          <h1 className="ad-h1">Invoices</h1>
          <span className="ad-small ad-muted">
            Drafts are made on the 25th and when a one-off project is delivered. Nothing reaches a
            client until you approve it.
          </span>
        </div>
      </div>
      {error && <p className="ad-note warn">{error}</p>}
      {f.deleted && (
        <p className="ad-note" role="status">
          Draft deleted.
        </p>
      )}
      <div className="ad-card ad-gap-12">
        <div className="ad-row-between">
          <h2 className="ad-h2 ad-m0">Invoice queue{toReview ? ` · ${toReview} to review` : ""}</h2>
          <GenerateDrafts />
        </div>
        <nav className="ad-btns ad-chips" aria-label="Filter invoices">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              href={k ? `/admin/billing?status=${k}` : "/admin/billing"}
              prefetch={false}
              className={`ad-chip${k === status ? "on" : ""}`}
              aria-current={k === status ? "page" : undefined}
            >
              {label}
              {counts[k] != null && <span className="ad-chip-n">{counts[k]}</span>}
            </Link>
          ))}
        </nav>
        {proofs.map((i) => (
          <div key={i.id} className="ad-row ad-lead ad-stack-8">
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
            <span role="columnheader">Payment</span>
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
              <span role="cell" data-testid="payment-status">
                <Pill tone={PAY_TONE[paymentStatus(r)] ?? "neutral"}>{paymentStatus(r)}</Pill>
                {r.stage && <span className="ad-small ad-muted">{STAGE[r.stage]}</span>}
              </span>
              <span role="cell">
                {r.payment_state === "submitted" && r.status !== "paid" ? (
                  <Pill status="receipt">Payment submitted</Pill>
                ) : (
                  <Pill status={r.shown_status}>{QUEUE_STATUS_LABEL[r.shown_status]}</Pill>
                )}
                {refunded[r.id] > 0 && (
                  <span data-testid="refunded-pill">
                    <Pill tone="warn">
                      {refundState({ amount: Number(r.amount), refunded: refunded[r.id] })}
                    </Pill>
                  </span>
                )}
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
