import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAttachment, InquiryReply, InquiryStatus } from "@/components/admin/InquiryTools";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Inquiry" };

type Detail = {
  id: string;
  subject: string;
  status: "open" | "resolved";
  account_id: string;
  account_name: string;
  project_id: string | null;
  project_ref: string | null;
  project_title: string | null;
  created_by_name: string | null;
  messages: {
    id: string;
    author_name: string | null;
    is_admin: boolean;
    body: string;
    link_url: string | null;
    link_label: string | null;
    attachment_key: string | null;
    attachment_name: string | null;
    at: string;
  }[];
};

export default async function AdminInquiry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const q = await rpc<Detail | null>("portal_admin_inquiry", { p_id: id });
  if (!q) notFound();
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/inquiries" prefetch={false}>
            ← Inquiries
          </Link>
          <h1 className="ad-h1">{q.subject}</h1>
          <span className="ad-small ad-muted">
            <Link href={`/admin/accounts/${q.account_id}`} prefetch={false}>
              {q.account_name}
            </Link>
            {q.project_ref && (
              <>
                {" · "}
                <Link href={`/admin/projects/${q.project_id}`} prefetch={false}>
                  {q.project_ref} {q.project_title}
                </Link>
              </>
            )}
            {q.created_by_name ? ` · from ${q.created_by_name}` : ""}
          </span>
        </div>
        <div className="ad-btns">
          <span className={`ad-pill ${q.status === "open" ? "draft" : "live"}`}>
            {q.status === "open" ? "Open" : "Resolved"}
          </span>
          <InquiryStatus id={q.id} status={q.status} />
        </div>
      </div>
      <section className="ad-card" aria-label="Thread" data-testid="admin-thread">
        {q.messages.map((m) => (
          <div key={m.id} className={m.is_admin ? "ad-msg ours" : "ad-msg"}>
            <span className="ad-small ad-muted">
              {m.is_admin ? "Milkywayy" : (m.author_name ?? "Client")} ·{" "}
              {new Date(m.at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Dubai",
              })}
            </span>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
            {m.link_url && (
              <a href={m.link_url} target="_blank" rel="noopener noreferrer" className="ad-small">
                {m.link_label || "Link"} ↗
              </a>
            )}
            {m.attachment_key && (
              <AdminAttachment k={m.attachment_key} name={m.attachment_name ?? "Attachment"} />
            )}
          </div>
        ))}
        <InquiryReply id={q.id} />
      </section>
    </div>
  );
}
