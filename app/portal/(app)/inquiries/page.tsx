import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { Badge } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { dateLabel } from "@/lib/portal/billing";

export const metadata = { title: "Inquiries" };

type Row = {
  id: string;
  subject: string;
  status: "open" | "resolved";
  client_unread: boolean;
  last_message_at: string;
  created_by_name: string | null;
  projects: { ref: string; title: string } | null;
};

/** Inquiries (owner, 10 Oct 2026): threads with Milkywayy, newest first; unread replies marked. */
export default async function Inquiries() {
  const { db, current } = await requireAccount("/portal/inquiries");
  const { data } = await db
    .from("inquiries")
    .select(
      "id, subject, status, client_unread, last_message_at, created_by_name, projects(ref, title)",
    )
    .eq("account_id", current.account.id)
    .order("last_message_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">{rows.filter((r) => r.status === "open").length} open</span>
          <h1 className="pt-h1">Inquiries</h1>
        </div>
        <Link href="/portal/inquiries/new" className="btn btn-p btn-s">
          <Icon name="plus" size={16} /> New inquiry
        </Link>
      </div>
      {rows.length ? (
        <div className="pt-list" data-testid="inquiries">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/portal/inquiries/${r.id}`}
              className="pt-card pt-card-link pt-inq"
            >
              <div className="pt-row">
                <b>
                  {r.client_unread && <span className="pt-dot" aria-label="New reply" />}
                  {r.subject}
                </b>
                <Badge tone={r.status === "open" ? "gold" : "ok"}>
                  {r.status === "open" ? "Open" : "Resolved"}
                </Badge>
              </div>
              <span className="pt-meta">
                {r.projects ? `${r.projects.ref} · ${r.projects.title} · ` : ""}
                {dateLabel(r.last_message_at)}
                {r.created_by_name ? ` · ${r.created_by_name}` : ""}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="pt-card">
          <span className="pt-meta">
            No messages yet. Ask us anything about a shoot or your files and track the reply here.
          </span>
        </div>
      )}
    </>
  );
}
