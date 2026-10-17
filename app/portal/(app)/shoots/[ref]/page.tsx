import { ShareWith } from "@/components/portal/ShareWith";
import { contactName, sharedLabel, teammates } from "@/lib/portal/agents";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { ProjectActions, ProjectMessages } from "@/components/portal/ProjectActions";
import {
  actionsFor,
  ActivityList,
  ApprovalNote,
  DeliveryList,
} from "@/components/portal/ProjectParts";
import { Back, Badge } from "@/components/portal/ui";
import { ProgressTracker } from "@/components/portal/detail/ProgressTracker";
import { Icon } from "@/components/portal/Icon";
import { projectCovers } from "@/lib/portal/covers";
import { getPropertyPricing } from "@/lib/data";
import { asProperty, type PropertyConfig } from "@/lib/portal/booking";
import { title as propertyTitle } from "@/lib/booking";
import { requireAccount } from "@/lib/portal/auth";
import {
  clientStatus,
  deliveries,
  SHOOT_SERVICE_LABEL,
  shootDay,
  statusLabel,
  stepsFor,
  REVISION_LABEL,
  type Project,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { seesMoney } from "@/lib/portal/shell";
import { Deliverables } from "@/components/portal/Deliverables";
import { ShootChanges } from "@/components/portal/ShootChanges";
import { can } from "@/lib/portal/access";
import type { Slot } from "@/lib/portal/booking";
import { ShootDeliveries, type DFile } from "@/components/portal/ShootDeliveries";
import { downloadUrl, presign, r2Ready } from "@/lib/r2";
import {
  normalizeServices,
  SERVICE_LABEL,
  serviceShort,
  type Deliverable,
} from "@/lib/portal/booking";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
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
  const admin = current.role === "owner" || current.role === "admin";
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
      seesMoney(current)
        ? db
            .from("line_items")
            .select("description, qty, unit_price, currency")
            .eq("project_id", p.id)
        : Promise.resolve({ data: [] }),
      db.from("project_deliverables").select("*").eq("project_id", p.id).order("sort"),
    ]);
  const booking = p.meta.booking;
  // Before it's shot, the client can change or cancel it (owner, 10 Oct 2026).
  const changeable =
    (p.status === "requested" || p.status === "confirmed") && can(current, "shoots");
  const pricing = await getPropertyPricing().catch(() => null);
  const cover = (await projectCovers(db, [p.id])).get(p.id) ?? null;
  const slotKey = (p.slot ?? "").toLowerCase().replace(" ", "_") as Slot | "";
  // Deliveries grouped by kind (owner, 10 Oct 2026), with short-lived signed links.
  const GROUPED = ["photos", "reel", "long_form", "tour"];
  const r2 = r2Ready();
  const outFiles = (files ?? []) as (ProjectFile & { deliverable_id?: string | null })[];
  // A photos *link* (a shared folder) has nothing for the photo grid: it goes in the plain list.
  const grouped = (f: ProjectFile) =>
    GROUPED.includes(f.kind) && !(f.kind === "photos" && f.source === "link");
  const delivList = (deliv ?? []) as Deliverable[];
  const dfiles: DFile[] = [
    ...outFiles.filter(grouped).map((f) => ({
      id: f.id,
      label: f.label,
      kind: f.kind,
      link: f.source === "link" ? f.url : null,
      download: f.source === "r2" && r2 && f.r2_key ? downloadUrl(f.r2_key, f.label, 3600) : null,
      view:
        f.source === "r2" && r2 && f.r2_key ? presign("GET", f.web_key ?? f.r2_key, 3600) : null,
      thumb: r2 && f.thumb_key ? presign("GET", f.thumb_key, 3600) : null,
      deliverableId: f.deliverable_id ?? null,
    })),
    // Long-form and 360 delivered as links on the deliverable itself.
    ...delivList
      .filter((d) => d.link_url && (d.kind === "long_form" || d.kind === "tour"))
      .map((d) => ({
        id: d.id,
        label: d.label,
        kind: d.kind,
        link: d.link_url,
        download: null,
        view: null,
        thumb: null,
        deliverableId: d.id,
      })),
  ];
  const photosDeliverable = delivList.find((d) => d.kind === "photos")?.id ?? null;
  const groups = deliveries((files ?? []) as ProjectFile[]);
  const latest = groups[0];
  const zip = latest?.files.find((f) => f.kind === "zip");
  const [agentName, team] = await Promise.all([
    contactName(db, p.agent_contact_id),
    admin ? teammates(db, current.account.id) : Promise.resolve([]),
  ]);
  const total = (items ?? []).reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);

  const services = booking ? normalizeServices(booking.services) : [];
  const serviceLine = booking
    ? services
        .map((x) => [SERVICE_LABEL[x.service], serviceShort(x)].filter(Boolean).join(": "))
        .join(" + ")
    : (p.meta.services ?? []).map((x) => SHOOT_SERVICE_LABEL[x] ?? x).join(" + ");
  const propertyCfg = services.find((x) => x.service === "property")?.property as
    PropertyConfig | undefined;
  const propertyText =
    propertyCfg && pricing ? propertyTitle(asProperty(propertyCfg, pricing), pricing) : "";
  const slotText = [p.slot, booking?.start_time ? `from ${booking.start_time}` : ""]
    .filter(Boolean)
    .join(" · ");
  const address = booking
    ? [
        booking.location.unit,
        booking.location.building,
        booking.location.community,
        booking.location.address,
      ]
        .filter(Boolean)
        .join(" · ")
    : [p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
        .filter(Boolean)
        .join(", ");
  const showTotal = seesMoney(current) && total > 0;
  const details: [string, string][] = [
    ["Property", propertyText],
    ["Address", address],
    ["Date", shootDay(p.shoot_date) || "To be confirmed"],
    ["Time", slotText],
    ["Agent", agentName ?? ""],
    ...(showTotal
      ? [
          [
            "Total",
            `${current.account.currency} ${total.toLocaleString("en-US")} (${(items ?? []).some((i) => /estimate/.test(i.description)) ? "estimate at booking" : "agreed price"})`,
          ] as [string, string],
        ]
      : []),
  ];
  const hasFiles = delivList.length > 0 || dfiles.length > 0 || !!latest;

  return (
    <div className="pt-detail">
      <LiveRefresh />
      <Back href="/portal/shoots" label="All bookings" />
      <div className="pt-head">
        <div>
          <h1 className="pt-h1" style={{ fontSize: 30 }}>
            {p.title}
            {p.meta.unit ? ` · ${p.meta.unit}` : ""}
          </h1>
          <span className="pt-meta pt-dt-sub">
            <span className="pt-mono">{p.ref}</span>
            {serviceLine ? ` · ${serviceLine}` : ""}
          </span>
        </div>
        <Badge tone={p.status === "delivered" ? "gold" : undefined}>{clientStatus(p)}</Badge>
      </div>
      {p.status === "cancelled" ? (
        <p className="pt-note" role="status">
          Cancelled. Book again any time with Book media.
        </p>
      ) : (
        <ProgressTracker
          steps={stepsFor("shoot")}
          now={statusLabel(p.status)}
          note={p.revision_state ? REVISION_LABEL[p.revision_state] : undefined}
        />
      )}
      {changeable && (
        <ShootChanges
          edit={{
            projectId: p.id,
            ref: p.ref,
            status: p.status as "requested" | "confirmed",
            date: p.shoot_date ?? "",
            slot: ["morning", "afternoon", "full_day"].includes(slotKey) ? slotKey : "",
            startTime: booking?.start_time ?? "",
            location: booking?.location ?? {
              address: [p.meta.building, p.meta.area].filter(Boolean).join(", "),
              unit: p.meta.unit,
            },
            services: booking?.services ?? [],
            note: booking?.note ?? "",
          }}
        />
      )}
      {booked && (
        <p className="pt-note" role="status">
          Requested. We’ll confirm the date and slot shortly; you’ll get an email when it’s
          confirmed.
        </p>
      )}
      {!!(agentName || p.shared_with?.length) && (
        <p className="pt-meta" data-testid="shoot-people" style={{ margin: 0 }}>
          {[agentName && `Agent: ${agentName}`, sharedLabel(p.shared_with?.length)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {admin && team.length > 1 && (
        <ShareWith kind="p" id={p.id} team={team} chosen={p.shared_with ?? []} />
      )}
      <div className="pt-dt-grid">
        <div className="pt-dt-main">
          {delivList.length > 0 ? (
            <Deliverables items={delivList} />
          ) : (
            !hasFiles && (
              <section className="pt-card" aria-labelledby="deliv-empty-h">
                <h2 id="deliv-empty-h" className="pt-h2">
                  Deliverables
                </h2>
                <p className="pt-meta pt-dt-empty">
                  Your files will appear here once they’re delivered.
                </p>
              </section>
            )
          )}

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
                    One link with the photos, video, price and your contact. Looks right in
                    WhatsApp.
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
          <ShootDeliveries files={dfiles} title={p.title} photosDeliverable={photosDeliverable} />
          <DeliveryList files={outFiles.filter((f) => !grouped(f))} />
          <ActivityList events={(events ?? []) as ProjectEvent[]} />
          <div id="messages">
            <ProjectMessages
              projectId={p.id}
              messages={(messages ?? []) as ProjectMessage[]}
              hint="Questions about access, parking or the brief go here."
            />
          </div>
        </div>

        <aside className="pt-dt-aside" aria-label="Booking details">
          <section className="pt-card pt-dt-details" data-testid="booking-details">
            <div className="pt-dt-cover">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" loading="lazy" />
              ) : (
                <Icon
                  name={
                    services.length && services.every((x) => x.service === "videos")
                      ? "video"
                      : "photo"
                  }
                  size={32}
                />
              )}
            </div>
            <dl className="pt-dt-dl">
              {details
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {booking?.location.lat != null && booking.location.lng != null && MAPS_KEY && (
              <a
                className="pt-staticmap"
                href={`https://www.google.com/maps/search/?api=1&query=${booking.location.lat},${booking.location.lng}`}
                target="_blank"
                rel="noopener"
                aria-label="Open the shoot location in Google Maps"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  loading="lazy"
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${booking.location.lat},${booking.location.lng}&zoom=16&size=600x240&scale=2&markers=color:0x111110%7C${booking.location.lat},${booking.location.lng}&key=${encodeURIComponent(MAPS_KEY)}`}
                />
              </a>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
