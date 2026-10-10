import Link from "next/link";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Inquiries" };

type Row = {
  id: string;
  subject: string;
  status: "open" | "resolved";
  admin_unread: boolean;
  last_message_at: string;
  created_by_name: string | null;
  account_id: string;
  account_name: string;
  project_id: string | null;
  project_ref: string | null;
  project_title: string | null;
  messages: number;
};

const FILTERS = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["", "All"],
] as const;

/** Admin → Inquiries (owner, 10 Oct 2026): every client thread; unread first. */
export default async function AdminInquiries({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const rpc = await portalAdminPage();
  const { status: s } = await searchParams;
  const status = s === undefined ? "open" : FILTERS.some(([k]) => k === s) ? s : "open";
  const rows = await rpc<Row[]>("portal_admin_inquiries", { p_status: status || null });
  const unread = rows.filter((r) => r.admin_unread).length;
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Portal</span>
          <h1 className="ad-h1">Inquiries{unread ? ` · ${unread} unread` : ""}</h1>
          <span className="ad-small ad-muted">
            Clients’ questions, optionally about a shoot. You’re emailed on each new one and each
            reply; they’re emailed when you answer.
          </span>
        </div>
      </div>
      <nav className="ad-btns" aria-label="Filter inquiries">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/inquiries?status=${k}`}
            prefetch={false}
            className={k === status ? "ad-btn small" : "ad-btn small ghost"}
            aria-current={k === status ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="ad-list" data-testid="inquiries-admin">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/inquiries/${r.id}`}
            prefetch={false}
            className="ad-row ad-row-link"
          >
            <div>
              <div className="ad-row-title">
                {r.admin_unread && (
                  <span className="ad-pill warn" data-testid="unread" style={{ marginRight: 8 }}>
                    Unread
                  </span>
                )}
                {r.subject}
              </div>
              <div className="ad-row-meta">
                {r.account_name}
                {r.project_ref ? ` · ${r.project_ref} ${r.project_title}` : ""} · {r.messages}{" "}
                message
                {r.messages === 1 ? "" : "s"} ·{" "}
                {new Date(r.last_message_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
            </div>
            <span className={`ad-pill ${r.status === "open" ? "draft" : "live"}`}>
              {r.status === "open" ? "Open" : "Resolved"}
            </span>
          </Link>
        ))}
        {!rows.length && <p className="ad-empty">Nothing here.</p>}
      </div>
    </div>
  );
}
