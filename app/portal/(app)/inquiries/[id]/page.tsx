import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentButton, ReplyForm, StatusToggle } from "@/components/portal/Inquiry";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { Back, Badge } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { r2Ready } from "@/lib/r2";

export const metadata = { title: "Inquiry" };

type Msg = {
  id: string;
  author_name: string | null;
  is_admin: boolean;
  body: string;
  link_url: string | null;
  link_label: string | null;
  attachment_key: string | null;
  attachment_name: string | null;
  at: string;
};

/** One inquiry: the thread (our replies may carry a private link), reply, resolve or reopen. */
export default async function InquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireAccount(`/portal/inquiries/${id}`);
  const [{ data: q }, { data: msgs }] = await Promise.all([
    db.from("inquiries").select("*, projects(ref, title, type)").eq("id", id).maybeSingle(),
    db.from("inquiry_messages").select("*").eq("inquiry_id", id).order("at"),
  ]);
  if (!q) notFound();
  if (q.client_unread) await db.rpc("read_inquiry", { p_inquiry: id });
  const project = q.projects as { ref: string; title: string; type: string } | null;
  const base =
    project?.type === "shoot" ? "shoots" : project?.type === "edit" ? "editing" : "avatars";
  return (
    <>
      <LiveRefresh />
      <Back href="/portal/inquiries" label="Inquiries" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {project ? (
              <Link href={`/portal/${base}/${encodeURIComponent(project.ref)}`}>
                {project.ref} · {project.title}
              </Link>
            ) : (
              "Inquiry"
            )}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {q.subject}
          </h1>
        </div>
        <div className="pt-btns">
          <Badge tone={q.status === "open" ? "gold" : "ok"}>
            {q.status === "open" ? "Open" : "Resolved"}
          </Badge>
          <StatusToggle id={id} status={q.status} />
        </div>
      </div>
      {sent && (
        <p className="pt-note" role="status">
          Sent. We’ll reply here and by email.
        </p>
      )}
      <section className="pt-card" aria-label="Messages" data-testid="thread">
        {((msgs ?? []) as Msg[]).map((m) => (
          <div key={m.id} className={m.is_admin ? "pt-msg admin" : "pt-msg"} data-testid="message">
            <span className="pt-meta">
              {m.is_admin ? "Milkywayy" : (m.author_name ?? "You")} ·{" "}
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
              <span className="pt-btns" style={{ alignItems: "center" }}>
                <a
                  className="btn btn-p btn-s"
                  href={m.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open link${m.link_label ? `: ${m.link_label}` : ""}`}
                >
                  Open link ↗
                </a>
                {m.link_label && <span className="pt-meta">{m.link_label}</span>}
              </span>
            )}
            {m.attachment_key && (
              <AttachmentButton messageId={m.id} name={m.attachment_name ?? "Attachment"} />
            )}
          </div>
        ))}
        <ReplyForm id={id} canAttach={r2Ready()} />
      </section>
    </>
  );
}
