import { requireAdmin } from "@/lib/admin/auth";
import { dubai } from "@/lib/admin/format";

export const metadata = { title: "Leads" };

type Lead = {
  ref: string;
  type: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  preferred_reply: string | null;
  page: string | null;
  utm: Record<string, string>;
  created_at: string;
  status: string;
};

/** Read-only for now: the forms start saving leads in Phase 6. Owner only (RLS too). */
export default async function Leads() {
  const { db } = await requireAdmin({ owner: true });
  const { data, error } = await db
    .from("leads")
    .select(
      "ref, type, name, company, phone, email, preferred_reply, page, utm, created_at, status",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const leads = (data ?? []) as Lead[];
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Workspace · read-only</span>
          <h1 className="ad-h1">Leads</h1>
        </div>
      </div>
      {error && <p className="ad-note warn">Couldn’t load leads: {error.message}</p>}
      <div className="ad-scroll">
        <table className="ad-table" aria-label="Leads">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Date</th>
              <th>Type</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Reply by</th>
              <th>Page</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.ref}>
                <td className="ad-mono">{l.ref}</td>
                <td>{dubai(l.created_at)}</td>
                <td>{l.type}</td>
                <td>
                  {l.name ?? "—"}
                  {l.company ? ` · ${l.company}` : ""}
                </td>
                <td>{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</td>
                <td>{l.preferred_reply ?? "—"}</td>
                <td>{l.page ?? "—"}</td>
                <td>{l.utm?.utm_source ?? "—"}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!leads.length && (
          <p className="ad-empty">
            No leads yet. Every form and booking request will appear here once the forms are
            connected (next phase).
          </p>
        )}
      </div>
    </div>
  );
}
