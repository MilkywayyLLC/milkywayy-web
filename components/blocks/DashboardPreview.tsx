export interface DashRow {
  title: string;
  meta: string;
  status: string;
  tone?: "ok" | "go";
}

/** Static illustration of the client dashboard (Property shoots). Rows are illustrative copy. */
export function DashboardPreview({ rows }: { rows: DashRow[] }) {
  return (
    <div
      className="dash-ui"
      role="img"
      aria-label="Client dashboard preview: shoots, deliveries and invoices"
    >
      <div className="bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {rows.map((r) => (
        <div className="drow" key={r.title} aria-hidden="true">
          <span>
            {r.title}
            <small>{r.meta}</small>
          </span>
          <span className={r.tone ? `st ${r.tone}` : "st"}>{r.status}</span>
        </div>
      ))}
    </div>
  );
}
