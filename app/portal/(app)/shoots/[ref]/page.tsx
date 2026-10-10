import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { ProjectActions, ProjectMessages } from "@/components/portal/ProjectActions";
import {
  actionsFor,
  ActivityList,
  ApprovalNote,
  DeliveryList,
} from "@/components/portal/ProjectParts";
import { Back, Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  clientStatus,
  deliveries,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  stepsFor,
  type Project,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { isManager } from "@/lib/portal/shell";
import { Deliverables } from "@/components/portal/Deliverables";
import { SERVICE_LABEL, type Deliverable } from "@/lib/portal/booking";

export const metadata = { title: "Shoot" };

/** One shoot (§5.2): status, deliveries and downloads, revision, approve, details, activity, messages. */
export default async function ShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ booked?: string }>;
}) {
  const { ref } = await params;
  const { booked } = await searchParams;
  const { db, current } = await requireAccount(`/portal/shoots/${ref}`);
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("ref", decodeURIComponent(ref))
    .eq("type", "shoot")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const [{ data: files }, { data: events }, { data: messages }, { data: items }, { data: deliv }] =
    await Promise.all([
      db
        .from("project_files")
        .select("*")
        .eq("project_id", p.id)
        .eq("direction", "out")
        .order("created_at"),
      db
        .from("project_events")
        .select("*")
        .eq("project_id", p.id)
        .order("at", { ascending: false }),
      db
        .from("project_messages")
        .select("id, author_name, is_admin, body, at")
        .eq("project_id", p.id)
        .order("at"),
      isManager(current)
        ? db
            .from("line_items")
            .select("description, qty, unit_price, currency")
            .eq("project_id", p.id)
        : Promise.resolve({ data: [] }),
      db.from("project_deliverables").select("*").eq("project_id", p.id).order("sort"),
    ]);
  const booking = p.meta.booking;
  const groups = deliveries((files ?? []) as ProjectFile[]);
  const latest = groups[0];
  const zip = latest?.files.find((f) => f.kind === "zip");
  const when = [shootDay(p.shoot_date), p.slot].filter(Boolean).join(" · ");
  const total = (items ?? []).reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);

  return (
    <>
      <LiveRefresh />
      <Back href="/portal/shoots" label="Shoots" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {p.ref}
            {when ? ` · ${when}` : ""}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {p.title}
          </h1>
        </div>
        <Badge tone={p.status === "delivered" ? "gold" : undefined}>{clientStatus(p)}</Badge>
      </div>
      <Stepper steps={stepsFor("shoot")} now={statusLabel(p.status)} />
      {booked && (
        <p className="pt-note" role="status">
          Requested. We’ll confirm the date and slot shortly; you’ll get an email when it’s
          confirmed.
        </p>
      )}
      <Deliverables items={(deliv ?? []) as Deliverable[]} />

      <ApprovalNote p={p} />
      <ProjectActions
        projectId={p.id}
        zipId={zip?.id ?? null}
        {...actionsFor(p)}
        hasDelivery={!!latest}
      />
      {(p.status === "delivered" || p.status === "completed") &&
        (files ?? []).some((f) => f.kind === "photos" && f.source === "r2") && (
          <section className="pt-card pt-row" style={{ flexWrap: "wrap" }}>
            <div>
              <b>Share this property</b>
              <div className="pt-meta">
                One link with the photos, video, price and your contact. Looks right in WhatsApp.
              </div>
            </div>
            <a
              className="btn btn-p btn-s"
              href={`/portal/listings/new?shoot=${encodeURIComponent(p.ref)}`}
            >
              Create share link
            </a>
          </section>
        )}
      <DeliveryList files={(files ?? []) as ProjectFile[]} />

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Details</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [
                  "Address",
                  booking
                    ? [booking.location.address, booking.location.unit].filter(Boolean).join(" · ")
                    : [p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
                        .filter(Boolean)
                        .join(", "),
                ],
                [
                  "Services",
                  booking
                    ? booking.services
                        .map((s) =>
                          s.service === "property"
                            ? SERVICE_LABEL.property
                            : `${SERVICE_LABEL[s.service]} (${s.qty ?? 1})`,
                        )
                        .join(", ")
                    : (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", "),
                ],
                ["When", when || "To be confirmed"],
                ...(isManager(current) && total > 0
                  ? [
                      [
                        "Price",
                        `${current.account.currency} ${total.toLocaleString("en-US")} (${(items ?? []).some((i) => /estimate/.test(i.description)) ? "estimate at booking" : "agreed price"})`,
                      ],
                    ]
                  : []),
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} style={{ display: "grid", gap: 2 }}>
                  <dt className="pt-eb">{k}</dt>
                  <dd style={{ margin: 0 }}>{v}</dd>
                </div>
              ))}
          </dl>
        </section>
        <ActivityList events={(events ?? []) as ProjectEvent[]} />
      </div>

      <div id="messages">
        <ProjectMessages
          projectId={p.id}
          messages={(messages ?? []) as ProjectMessage[]}
          hint="Questions about access, parking or the brief go here."
        />
      </div>
    </>
  );
}
