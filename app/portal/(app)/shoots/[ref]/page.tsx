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
import { Back, Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  clientStatus,
  deliveries,
  SHOOT_SERVICE_LABEL,
  shortTitle,
  statusLabel,
  stepsFor,
  visibleTo,
  type Project,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { seesMoney } from "@/lib/portal/shell";
import { Deliverables } from "@/components/portal/Deliverables";
import { ShootChanges } from "@/components/portal/ShootChanges";
import { can } from "@/lib/portal/access";
import { requestConfig } from "@/lib/portal/requests";
import type { Slot } from "@/lib/portal/booking";
import { ShootDeliveries, type DFile } from "@/components/portal/ShootDeliveries";
import { downloadUrl, presign, r2Ready } from "@/lib/r2";
import { stripeReady } from "@/lib/stripe";
import { ProposalBanner } from "@/components/portal/ProposalBanner";
import { DraftBooking } from "@/components/portal/DraftBooking";
import { portalAdminAs } from "@/lib/portal/admin";
import type { ProjectPayment } from "@/lib/portal/payment-actions";
import { projectWhen, whenLabel } from "@/lib/portal/when";
import { thumbSrc } from "@/lib/portal/thumbs";
import { zipName } from "@/lib/portal/zip-browser";
import { ShootMap } from "@/components/portal/ShootMap";
import { AddToCalendar } from "@/components/portal/AddToCalendar";
import { shootEventOf } from "@/lib/portal/shoot-calendar";
import { originFrom } from "@/lib/portal/invite";
import { headers } from "next/headers";
import {
  ProjectPaymentCard,
  type BillingPayments,
  type MyProjectPayment,
} from "@/components/portal/PaymentParts";
import {
  normalizeServices,
  SERVICE_LABEL,
  serviceShort,
  type Deliverable,
} from "@/lib/portal/booking";

/** The address once: unit, then the full address; building and community only when it lacks them. */
function fullAddress(l: {
  unit?: string | null;
  building?: string | null;
  community?: string | null;
  address?: string | null;
}) {
  const addr = l.address ?? "";
  const lower = addr.toLowerCase();
  const parts = [
    l.unit && !lower.includes(l.unit.toLowerCase()) ? `Unit ${l.unit}` : null,
    ...(addr ? [] : [l.building, l.community]),
    addr,
  ];
  return parts.filter(Boolean).join(", ");
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
export const metadata = { title: "Shoot" };

/** One shoot (§5.2): status, deliveries and downloads, revision, approve, details, activity, messages. */
export default async function ShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ booked?: string; paid?: string; pay?: string }>;
}) {
  const { ref } = await params;
  const { booked, paid, pay: payBack } = await searchParams;
  const { db, user, current } = await requireAccount(`/portal/shoots/${ref}`);
  const admin = current.role === "owner" || current.role === "admin";
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("ref", decodeURIComponent(ref))
    .eq("type", "shoot")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  // An unpaid draft is its booker's alone (owner, 27 Oct 2026).
  if (!visibleTo(p, user.id)) notFound();
  const draft = p.status === "awaiting_payment";
  const draftPay = draft
    ? await portalAdminAs(`client:${user.email ?? user.id}`)<ProjectPayment>(
        "portal_admin_project_payment",
        { p_project: p.id },
      ).catch(() => null)
    : null;
  const draftInvoice = draftPay?.invoices.find(
    (i) => i.stage && (i.status === "due" || i.status === "overdue"),
  );
  const draftExpires = p.meta.awaiting_since
    ? new Date(new Date(p.meta.awaiting_since).getTime() + 7 * 864e5).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Dubai",
      })
    : null;
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
  // Payment terms (owner, 24 Oct 2026): unpaid booking invoices lock the downloads.
  const [{ data: payData }, { data: bp }] = await Promise.all([
    db.rpc("my_project_payment", { p_project: p.id }),
    seesMoney(current)
      ? db.rpc("my_billing_payments", { p_account: current.account.id })
      : Promise.resolve({ data: null }),
  ]);
  const pay = payData as MyProjectPayment | null;
  const locked = !!pay?.locked;
  const booking = p.meta.booking;
  // Before it's shot, the client can change or cancel it (owner, 10 Oct 2026).
  const changeable =
    (p.status === "requested" || p.status === "confirmed") && can(current, "shoots");
  const cfg = changeable ? await requestConfig(db, current).catch(() => null) : null;
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
      link: f.source === "link" && !locked ? f.url : null,
      download:
        f.source === "r2" && r2 && f.r2_key && !locked
          ? downloadUrl(f.r2_key, f.label, 3600)
          : null,
      // Locked: photos through the watermarked preview, videos only as their web copy.
      view:
        f.source !== "r2" || !r2 || !f.r2_key
          ? null
          : !locked
            ? presign("GET", f.web_key ?? f.r2_key, 3600)
            : f.kind === "photos"
              ? `/api/portal/preview/${f.id}`
              : f.web_key
                ? presign("GET", f.web_key, 3600)
                : null,
      thumb:
        locked && f.kind === "photos" && f.source === "r2"
          ? `/api/portal/preview/${f.id}?s=t`
          : r2
            ? thumbSrc(f)
            : null,
      deliverableId: f.deliverable_id ?? null,
    })),
    // Long-form and 360 delivered as links on the deliverable itself.
    ...delivList
      .filter((d) => d.link_url && (d.kind === "long_form" || d.kind === "tour"))
      .map((d) => ({
        id: d.id,
        label: d.label,
        kind: d.kind,
        link: locked ? null : d.link_url,
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
  // The real date and start time, never Morning / Afternoon (phase 1).
  const when = projectWhen(p);
  const origin = originFrom(await headers());
  const proposal = (
    p.meta as { proposal?: { date: string; start_time: string; note?: string | null } }
  ).proposal;
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
          <h1 className="pt-h1">{shortTitle(p.title)}</h1>
        </div>
        <Badge tone={p.status === "delivered" ? "gold" : undefined}>{clientStatus(p, pay)}</Badge>
      </div>
      {p.status === "cancelled" ? (
        <p className="pt-note" role="status">
          Cancelled
          {pay?.fee_waived
            ? " (fee waived)"
            : pay?.cancel_fee
              ? ` with a late fee of ${current.account.currency} ${Number(pay.cancel_fee).toLocaleString("en-US")}`
              : ""}
          . Book again any time with Book media.
        </p>
      ) : draft ? (
        <DraftBooking
          projectId={p.id}
          payHref={draftInvoice ? `/portal/pay/${draftInvoice.id}` : null}
          expires={draftExpires}
        />
      ) : (
        <Stepper steps={stepsFor("shoot")} now={statusLabel(p.status)} />
      )}
      {changeable && cfg && (
        <ShootChanges
          cfg={cfg}
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
      {proposal && p.status !== "cancelled" && can(current, "shoots") && (
        <ProposalBanner
          projectId={p.id}
          when={whenLabel(proposal.date, proposal.start_time)}
          was={when}
          note={proposal.note}
          paid={!!pay?.invoices?.some((i) => i.stage && i.status === "paid")}
        />
      )}
      {booked && (
        <p className="pt-note" role="status">
          Requested. Your preferred date and time are subject to availability. We’ll review and
          email you once confirmed.
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
      {p.meta.shot_update?.note && (
        <p className="pt-note" role="status" data-testid="shot-update">
          {p.meta.shot_update.note}
          {pay?.sees_money && p.meta.shot_update.diff
            ? p.meta.shot_update.outcome === "invoice"
              ? ". The difference is on a separate invoice below."
              : p.meta.shot_update.outcome === "credit"
                ? ". The difference is credit on your account: it comes off your next invoice."
                : p.meta.shot_update.outcome === "balance"
                  ? ". Your balance invoice follows what we shot."
                  : "."
            : ""}
        </p>
      )}
      {pay && (
        <ProjectPaymentCard
          pay={pay}
          card={stripeReady()}
          billing={bp as BillingPayments | null}
          banner={paid ? "paid" : payBack ? "pay" : null}
        />
      )}
      <Deliverables items={delivList} />

      <ApprovalNote p={p} />
      <ProjectActions
        projectId={p.id}
        zipId={locked ? null : (zip?.id ?? null)}
        {...actionsFor(p)}
        hasDelivery={!!latest}
        files={dfiles
          .filter((f) => f.download)
          .map((f, i) => ({ url: f.download!, name: zipName(f.label, i, f.kind) }))}
        zipLabel={p.title}
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
      <span id="files" />
      <ShootDeliveries
        files={dfiles}
        title={p.title}
        photosDeliverable={photosDeliverable}
        locked={locked}
      />
      <DeliveryList files={outFiles.filter((f) => !grouped(f))} locked={locked} />

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Details</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [
                  "Address",
                  booking
                    ? fullAddress(booking.location)
                    : [p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
                        .filter(Boolean)
                        .join(", "),
                ],
                [
                  "Services",
                  booking
                    ? normalizeServices(booking.services)
                        .map((s) =>
                          [SERVICE_LABEL[s.service], serviceShort(s)].filter(Boolean).join(": "),
                        )
                        .join(" · ")
                    : (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", "),
                ],
                ["When", when || "To be confirmed"],
                ...(seesMoney(current) && total > 0
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
          {p.shoot_date && ["requested", "confirmed"].includes(p.status) && (
            <AddToCalendar {...calendarLinks(shootEventOf(p, origin))} />
          )}
          {booking?.location.lat != null && booking.location.lng != null && MAPS_KEY && (
            <ShootMap lat={booking.location.lat} lng={booking.location.lng} />
          )}
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

const calendarLinks = (e: ReturnType<typeof shootEventOf>) => ({ google: e.google, ics: e.icsUrl });
