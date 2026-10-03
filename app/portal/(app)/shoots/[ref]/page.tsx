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

export const metadata = { title: "Shoot" };

/** One shoot (§5.2): status, deliveries and downloads, revision, approve, details, activity, messages. */
export default async function ShootPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { db, current } = await requireAccount(`/portal/shoots/${ref}`);
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("ref", decodeURIComponent(ref))
    .eq("type", "shoot")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const [{ data: files }, { data: events }, { data: messages }, { data: items }] =
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
    ]);
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

      <ApprovalNote p={p} />
      <ProjectActions
        projectId={p.id}
        zipId={zip?.id ?? null}
        {...actionsFor(p)}
        hasDelivery={!!latest}
      />
      <DeliveryList files={(files ?? []) as ProjectFile[]} />

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Details</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [
                  "Address",
                  [p.meta.unit && `Unit ${p.meta.unit}`, p.meta.building, p.meta.area]
                    .filter(Boolean)
                    .join(", "),
                ],
                [
                  "Services",
                  (p.meta.services ?? []).map((s) => SHOOT_SERVICE_LABEL[s] ?? s).join(", "),
                ],
                ["When", when || "To be confirmed"],
                ...(isManager(current) && total > 0
                  ? [
                      [
                        "Price",
                        `${current.account.currency} ${total.toLocaleString("en-US")} (estimate at booking)`,
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
