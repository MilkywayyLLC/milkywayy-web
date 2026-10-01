import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadEditor } from "@/components/admin/LeadEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { dubai } from "@/lib/admin/format";
import { LEAD_TYPES, waTo, type LeadRow } from "@/lib/admin/leads";
import { EDIT_KINDS, SERVICE_LABELS } from "@/lib/leads/rules";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Lead ${(await params).ref}` };
}

export default async function LeadDetail({ params }: Props) {
  const { ref } = await params;
  const { db } = await requireAdmin({ owner: true });
  const { data } = await db.from("leads").select("*").eq("ref", ref).maybeSingle();
  if (!data) notFound();
  const l = data as LeadRow;
  const d = l.data;
  const est = d.estimate as
    | {
        total: number;
        properties: {
          title: string;
          subtotal: number;
          lines: { label: string; amount: number }[];
        }[];
      }
    | undefined;

  const answers: [string, unknown][] = [
    ["Service", SERVICE_LABELS[String(d.service)] ?? d.service],
    ["What for", d.use === "Other" ? `Other: ${d.use_other}` : d.use],
    [
      "Needs",
      Array.isArray(d.what)
        ? (d.what as string[]).map((w) => EDIT_KINDS[w] ?? w).join(", ")
        : undefined,
    ],
    ["Volume per month", d.volume],
    ["Editing now", d.now],
    ["Country", d.country],
    ["Link", d.link],
    [
      "Free test path",
      d.path === "email"
        ? "Sent requirements by email"
        : d.path === "calendar"
          ? "Chose to book a call"
          : undefined,
    ],
    ["Message", d.brief],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "") as [string, unknown][];

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/leads" prefetch={false}>
            ← Leads
          </Link>
          <h1 className="ad-h1">{l.name || l.email || l.ref}</h1>
          <span className="ad-small ad-muted">
            {l.ref} · {LEAD_TYPES[l.type] ?? l.type} · {dubai(l.created_at, true)}
          </span>
        </div>
        <div className="ad-btns">
          {l.phone && (
            <a className="ad-btn" href={waTo(l.phone)} target="_blank" rel="noopener">
              WhatsApp
            </a>
          )}
          {l.email && (
            <a
              className="ad-btn ghost"
              href={`mailto:${l.email}?subject=${encodeURIComponent(`Your request (Ref ${l.ref})`)}`}
            >
              Email
            </a>
          )}
          {l.phone && (
            <a className="ad-btn ghost" href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}>
              Call
            </a>
          )}
        </div>
      </div>

      <div className="ad-grid2">
        <section className="ad-card" aria-label="Contact">
          <h2 className="ad-h2">Contact</h2>
          <dl className="ad-dl">
            <dt>Name</dt>
            <dd>{l.name ?? "—"}</dd>
            <dt>Company</dt>
            <dd>{l.company ?? "—"}</dd>
            <dt>Phone</dt>
            <dd>{l.phone ?? "—"}</dd>
            <dt>Email</dt>
            <dd>{l.email ?? "—"}</dd>
            <dt>Reply by</dt>
            <dd>{l.preferred_reply ?? "—"}</dd>
            <dt>Call booked</dt>
            <dd>{l.call_booked_at ? dubai(l.call_booked_at) : "—"}</dd>
          </dl>
        </section>
        <LeadEditor reference={l.ref} status={l.status} notes={l.notes ?? ""} />
      </div>

      {answers.length > 0 && (
        <section className="ad-card" aria-label="Answers">
          <h2 className="ad-h2">What they asked for</h2>
          <dl className="ad-dl">
            {answers.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {typeof d.message === "string" && (
        <section className="ad-card" aria-label="Booking">
          <h2 className="ad-h2">Booking</h2>
          <pre className="ad-mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {d.message}
          </pre>
          {est && (
            <div className="ad-scroll">
              <table className="ad-table" aria-label="Estimate at the time of the request">
                <tbody>
                  {est.properties.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <b>{p.title}</b>
                        <br />
                        <span className="ad-small ad-muted">
                          {p.lines
                            .map((x) => `${x.label} AED ${x.amount.toLocaleString("en-US")}`)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="ad-mono">AED {p.subtotal.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <b>Estimate at the time (AED)</b>
                    </td>
                    <td className="ad-mono">
                      <b>AED {est.total.toLocaleString("en-US")}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="ad-card" aria-label="Source">
        <h2 className="ad-h2">Where they came from</h2>
        <dl className="ad-dl">
          <dt>Sent from</dt>
          <dd>{l.page ?? "—"}</dd>
          <dt>Landing page</dt>
          <dd>{String(d.landing ?? "—")}</dd>
          <dt>Referrer</dt>
          <dd style={{ wordBreak: "break-all" }}>{l.referrer ?? "—"}</dd>
          <dt>Campaign</dt>
          <dd>
            {Object.entries(l.utm ?? {})
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ") || "—"}
          </dd>
        </dl>
      </section>
    </div>
  );
}
