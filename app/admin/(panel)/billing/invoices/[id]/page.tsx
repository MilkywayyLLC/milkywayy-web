import Link from "next/link";
import { notFound } from "next/navigation";
import {
  InvoiceActions,
  PaymentReview,
  type InvoiceRowData,
} from "@/components/admin/BillingTools";
import { DraftEditor, type DraftData } from "@/components/admin/InvoiceDraft";
import { portalAdminPage } from "@/lib/portal/admin";
import type { BillingSettings } from "@/lib/portal/admin-billing-actions";
import {
  CATEGORY_LABEL,
  dateLabel,
  money,
  monthLabel,
  QUEUE_STATUS_LABEL,
  type InvoiceCategory,
  type InvoiceLine,
  type QueueStatus,
} from "@/lib/portal/billing";

export const metadata = { title: "Invoice" };

type Full = DraftData & {
  account_name: string;
  shown_status: QueueStatus;
  amount: number;
  subtotal: number | null;
  vat: number;
  issued_on: string;
  period_start: string | null;
  project_id: string | null;
  project_ref: string | null;
  project_title: string | null;
  approved_by: string | null;
  published_at: string | null;
};

/** One invoice: a draft to edit and approve, or a published one to follow up. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const inv = await rpc<Full | null>("portal_admin_invoice", { p_id: id });
  if (!inv) notFound();
  const settings = await rpc<BillingSettings>("portal_admin_billing_settings");
  const editable = inv.status === "draft" || inv.status === "approved";
  const row = editable
    ? null
    : (await rpc<InvoiceRowData[]>("portal_admin_invoices", { p_account: inv.account_id })).find(
        (x) => x.id === id,
      );
  const c = inv.currency;
  const category = inv.category as InvoiceCategory | null;

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/billing" prefetch={false}>
            ← Invoice queue
          </Link>
          <h1 className="ad-h1">
            {inv.number ?? "Draft"} · {inv.account_name}
          </h1>
          <span className="ad-small ad-muted">
            {category ? CATEGORY_LABEL[category] : "Invoice"}
            {inv.advance ? " (billed in advance)" : ""}
            {inv.period_start ? ` · ${monthLabel(inv.period_start)}` : ""}
            {inv.project_ref ? (
              <>
                {" · "}
                <Link href={`/admin/projects/${inv.project_id}`} prefetch={false}>
                  {inv.project_ref} {inv.project_title}
                </Link>
              </>
            ) : null}
            {inv.status === "approved" && inv.publish_on
              ? ` · approved, publishes ${dateLabel(inv.publish_on)}`
              : ""}
            {inv.published_at ? ` · published ${dateLabel(inv.published_at)}` : ""}
          </span>
        </div>
        <span className={`ad-pill ${inv.shown_status}`} data-testid="invoice-status">
          {QUEUE_STATUS_LABEL[inv.shown_status]}
        </span>
      </div>

      {editable ? (
        <DraftEditor inv={inv} vatOn={!!settings?.vat_registered} />
      ) : (
        <div className="ad-card">
          <ul className="ad-lines" data-testid="invoice-lines">
            {(inv.lines as InvoiceLine[]).map((l, n) => (
              <li key={n}>
                <span>
                  {l.description}
                  {Number(l.qty) !== 1 && ` · ${Number(l.qty)} × ${money(c, Number(l.unit_price))}`}
                </span>
                <span className="ad-mono">{money(c, Number(l.amount))}</span>
              </li>
            ))}
            {Number(inv.vat) > 0 && (
              <li>
                <span>VAT {Number(inv.vat_rate)}%</span>
                <span className="ad-mono">{money(c, Number(inv.vat))}</span>
              </li>
            )}
            <li>
              <b>Total</b>
              <b className="ad-mono">{money(c, Number(inv.amount))}</b>
            </li>
          </ul>
          <span className="ad-small ad-muted">
            Issued {dateLabel(inv.issued_on)} · due {dateLabel(inv.due_on)}
          </span>
          <div className="ad-btns">
            {inv.pdf_source === "generated" && (
              <a
                className="ad-btn ghost small"
                href={`/admin/billing/invoices/${inv.id}/pdf`}
                target="_blank"
                rel="noopener"
              >
                PDF
              </a>
            )}
          </div>
          {row && (
            <>
              <PaymentReview inv={row} />
              <InvoiceActions inv={row} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
