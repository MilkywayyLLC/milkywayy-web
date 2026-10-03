import Link from "next/link";
import { EmailAttachedBadge } from "@/components/admin/EmailAttachedBadge";
import { requireAdmin } from "@/lib/admin/auth";
import { dubai } from "@/lib/admin/format";
import {
  LEAD_STATUSES,
  LEAD_TYPES,
  leadSummary,
  queryLeads,
  type LeadRow,
} from "@/lib/admin/leads";

export const metadata = { title: "Leads" };

type Props = { searchParams: Promise<{ q?: string; type?: string; status?: string }> };

/** Every form and booking request (Owner only; RLS too). Filters are a plain GET form. */
export default async function Leads({ searchParams }: Props) {
  const { db } = await requireAdmin({ owner: true });
  const f = await searchParams;
  const { data, error } = await queryLeads(db, f);
  const leads = (data ?? []) as LeadRow[];
  const qs = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Workspace</span>
          <h1 className="ad-h1">Leads</h1>
        </div>
        <a className="ad-btn ghost" href={`/admin/leads/export${qs ? `?${qs}` : ""}`}>
          Export CSV
        </a>
      </div>
      <form className="ad-filter" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Name, email, phone or ref"
          aria-label="Search leads"
          style={{ flex: "1 1 220px", width: "auto" }}
        />
        <select name="type" defaultValue={f.type ?? ""} aria-label="Type">
          <option value="">All types</option>
          {Object.entries(LEAD_TYPES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <button className="ad-btn small" type="submit">
          Filter
        </button>
        {qs && (
          <Link className="ad-btn quiet small" href="/admin/leads">
            Clear
          </Link>
        )}
      </form>
      {error && <p className="ad-note warn">Couldn’t load leads: {error.message}</p>}
      <div className="ad-list">
        {leads.map((l) => (
          <Link
            key={l.ref}
            href={`/admin/leads/${l.ref}`}
            className="ad-row ad-lead"
            prefetch={false}
            data-testid={`lead-${l.ref}`}
          >
            <span className={`ad-pill ${l.status === "new" ? "live" : "draft"}`}>{l.status}</span>
            <span className="ad-row-main">
              <span>
                <span className="ad-row-title">
                  {l.name || l.email || "No name"} · {LEAD_TYPES[l.type] ?? l.type}{" "}
                  {l.data?.attached_by_email === true && <EmailAttachedBadge />}
                </span>
                <span className="ad-row-meta" style={{ display: "block" }}>
                  {l.ref} · {dubai(l.created_at)} · {l.preferred_reply ?? "—"}
                  {l.call_booked_at ? " · call booked" : ""} · {leadSummary(l)}
                </span>
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
        {!leads.length && (
          <p className="ad-empty">
            {qs
              ? "No leads match these filters."
              : "No leads yet. Every form and booking request lands here."}
          </p>
        )}
      </div>
    </div>
  );
}
