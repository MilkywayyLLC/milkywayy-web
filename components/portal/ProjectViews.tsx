import Link from "next/link";
import { notFound } from "next/navigation";
import { AddFiles } from "@/components/portal/ClientUpload";
import { Icon } from "@/components/portal/Icon";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import {
  DownloadButton,
  ProjectActions,
  ProjectMessages,
} from "@/components/portal/ProjectActions";
import {
  actionsFor,
  ActivityList,
  ApprovalNote,
  DeliveryList,
  FilesInList,
} from "@/components/portal/ProjectParts";
import { AskAbout, ScriptReview } from "@/components/portal/ScriptReview";
import { Back, Badge, Stepper } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import {
  briefKindLabel,
  clientStatus,
  day,
  deliveries,
  myProjects,
  statusLabel,
  stepsFor,
  TYPE_PATH,
  type Project,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
  type ProjectScript,
} from "@/lib/portal/projects";
import { maxUploadGb } from "@/lib/r2";

/**
 * Editing (§5.3) and Avatars (§5.4) share one list and one project page; avatar videos add the
 * script approval. Shoots keep their own pages (dates, slots, addresses).
 */
type Kind = "edit" | "avatar";
const COPY = {
  edit: {
    eyebrow: "Post-production",
    title: "Editing",
    newLabel: "New batch",
    noun: "batch",
    empty: "Send us footage or photos and we edit them. Start with a new batch.",
  },
  avatar: {
    eyebrow: "AI avatars",
    title: "Avatars",
    newLabel: "New video",
    noun: "video",
    empty:
      "Videos with an AI presenter. Send a brief and we’ll write the script for your approval.",
  },
} as const;

const tone = (p: Project) =>
  p.status === "on_hold"
    ? "warn"
    : p.status === "delivered" || p.status === "script_ready"
      ? "gold"
      : undefined;

export async function ProjectList({ type, tab, q }: { type: Kind; tab?: string; q?: string }) {
  const base = TYPE_PATH[type];
  const c = COPY[type];
  const { db, current } = await requireAccount(base);
  const all = await myProjects(db, current.account.id, type);
  const active = all.filter((p) => p.status !== "completed");
  const query = (q ?? "").trim().toLowerCase();
  const done = all
    .filter((p) => p.status === "completed")
    .filter((p) =>
      `${p.ref} ${p.title} ${briefKindLabel(type, p.meta.kind)}`.toLowerCase().includes(query),
    );
  const showDone = tab === "completed";
  const ids = all.map((p) => p.id);
  // Latest delivery's zip (or first file) per completed project, for the Download button.
  const { data: outFiles } = ids.length
    ? await db
        .from("project_files")
        .select("*")
        .in("project_id", ids)
        .eq("direction", "out")
        .order("created_at")
    : { data: [] };
  const latestFor = (id: string) => {
    const g = deliveries(((outFiles ?? []) as ProjectFile[]).filter((f) => f.project_id === id))[0];
    return g
      ? (g.files.find((f) => f.kind === "zip") ?? (g.files.length === 1 ? g.files[0] : null))
      : null;
  };
  const latestLabel = (id: string) =>
    deliveries(((outFiles ?? []) as ProjectFile[]).filter((f) => f.project_id === id))[0]?.label;

  return (
    <>
      <LiveRefresh />
      <div className="pt-head">
        <div>
          <span className="pt-eb">{c.eyebrow}</span>
          <h1 className="pt-h1">{c.title}</h1>
        </div>
        <Link href={`${base}/new`} className="btn btn-p btn-s">
          <Icon name="plus" size={16} /> {c.newLabel}
        </Link>
      </div>

      <div className="pt-tabs" role="tablist">
        <Link href={base} role="tab" aria-selected={!showDone} prefetch={false}>
          Active ({active.length})
        </Link>
        <Link href={`${base}?tab=completed`} role="tab" aria-selected={showDone} prefetch={false}>
          Completed
        </Link>
      </div>

      {!showDone ? (
        active.length ? (
          <div className="pt-grid2" data-testid="projects">
            {active.map((p) => (
              <Link
                key={p.id}
                href={`${base}/${encodeURIComponent(p.ref)}`}
                className="pt-card pt-card-link"
              >
                <div className="pt-row">
                  <span className="pt-eb">
                    {p.ref} · {briefKindLabel(type, p.meta.kind)}
                  </span>
                  <Badge tone={tone(p)}>{clientStatus(p)}</Badge>
                </div>
                <b className="pt-title">{p.title}</b>
                {p.status === "on_hold" ? (
                  <div className="pt-hold">
                    <b style={{ color: "#b42318" }}>On hold: waiting on you</b>
                    <span className="pt-small">{p.status_note}</span>
                  </div>
                ) : (
                  <Stepper steps={stepsFor(type)} now={statusLabel(p.status)} />
                )}
                <span className="pt-meta">
                  {[
                    p.meta.quantity ? `${p.meta.quantity} items` : "",
                    `submitted ${day(p.created_at)}`,
                    p.due_at ? `wanted by ${day(p.due_at)}` : "",
                    latestLabel(p.id) ?? "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="pt-card">
            <b>Nothing in progress</b>
            <span className="pt-meta">{c.empty}</span>
          </div>
        )
      ) : (
        <>
          <form method="get" role="search">
            <input type="hidden" name="tab" value="completed" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search past projects"
              aria-label="Search past projects"
            />
          </form>
          <div className="pt-list" data-testid="completed">
            {done.map((p) => {
              const file = latestFor(p.id);
              return (
                <div key={p.id} style={{ display: "grid", gap: 10 }}>
                  <div>
                    <Link
                      href={`${base}/${encodeURIComponent(p.ref)}`}
                      className="pt-title"
                      prefetch={false}
                    >
                      <b>{p.title}</b>
                    </Link>
                    <div className="pt-meta">
                      {[
                        p.ref,
                        briefKindLabel(type, p.meta.kind),
                        `completed ${day(p.completed_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="pt-btns">
                    {file && <DownloadButton fileId={file.id} name={file.label} label="Download" />}
                    <AskAbout projectId={p.id} projectRef={p.ref} />
                  </div>
                </div>
              );
            })}
            {done.length === 0 && (
              <p className="pt-meta">
                {query ? `Nothing matches “${q}”.` : "Nothing completed yet."}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export async function ProjectDetail({ type, projectRef }: { type: Kind; projectRef: string }) {
  const base = TYPE_PATH[type];
  const c = COPY[type];
  const { db } = await requireAccount(`${base}/${projectRef}`);
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("ref", decodeURIComponent(projectRef))
    .eq("type", type)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const [{ data: files }, { data: events }, { data: messages }, { data: scripts }] =
    await Promise.all([
      db.from("project_files").select("*").eq("project_id", p.id).order("created_at"),
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
      type === "avatar"
        ? db
            .from("project_scripts")
            .select("*")
            .eq("project_id", p.id)
            .order("version", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
  const all = (files ?? []) as ProjectFile[];
  const groups = deliveries(all);
  const latest = groups[0];
  const zip = latest?.files.find((f) => f.kind === "zip");
  const [script, ...older] = (scripts ?? []) as ProjectScript[];
  const maxGb = maxUploadGb();
  const open = p.status !== "completed";

  return (
    <>
      <LiveRefresh />
      <Back href={base} label={c.title} />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {[
              p.ref,
              briefKindLabel(type, p.meta.kind),
              p.meta.quantity ? `${p.meta.quantity} items` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {p.title}
          </h1>
        </div>
        <Badge tone={tone(p)}>{clientStatus(p)}</Badge>
      </div>

      {p.status === "on_hold" ? (
        <div className="pt-hold" data-testid="on-hold">
          <b style={{ color: "#b42318" }}>On hold: waiting on you</b>
          <span>{p.status_note}</span>
          <div style={{ marginTop: 6 }}>
            <AddFiles projectId={p.id} maxGb={maxGb} label="Add the file" primary />
          </div>
        </div>
      ) : (
        <Stepper steps={stepsFor(type)} now={statusLabel(p.status)} />
      )}

      {type === "avatar" && !script && p.status === "brief_received" && (
        <p className="pt-meta" style={{ margin: 0 }}>
          {p.meta.script_by === "client"
            ? "We’re reading your script. We’ll post it here for a final approval before production."
            : "We’re writing the script. You’ll approve it here before production starts."}
        </p>
      )}
      {script && (
        <ScriptReview
          projectId={p.id}
          script={script}
          older={older}
          canDecide={p.status === "script_ready"}
        />
      )}

      <ApprovalNote p={p} />
      <ProjectActions
        projectId={p.id}
        zipId={zip?.id ?? null}
        {...actionsFor(p)}
        hasDelivery={!!latest}
        noun={c.noun}
      />
      <DeliveryList files={all} />
      {!latest && (
        <p className="pt-meta" style={{ margin: 0 }}>
          Nothing delivered yet.
        </p>
      )}

      <div className="pt-grid2">
        <section className="pt-card" aria-labelledby="files-in-h">
          <h2 id="files-in-h" className="pt-h2">
            Files in
          </h2>
          <FilesInList files={all} />
          {open && <AddFiles projectId={p.id} maxGb={maxGb} />}
          {open && (
            <span className="pt-meta">
              Uploads are deleted 30 days after the {c.noun} is completed.
            </span>
          )}
        </section>
        <section className="pt-card" aria-labelledby="brief-h">
          <h2 id="brief-h" className="pt-h2">
            {type === "avatar" ? "Your brief" : "Your notes"}
          </h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {(
              [
                [type === "avatar" ? "Length" : "What", briefKindLabel(type, p.meta.kind)],
                ["Quantity", p.meta.quantity ? String(p.meta.quantity) : ""],
                [
                  "Script",
                  type === "avatar"
                    ? p.meta.script_by === "client"
                      ? "You send it"
                      : "Milkywayy writes it"
                    : "",
                ],
                ["Wanted by", p.due_at ? day(p.due_at, true) : ""],
                ["Notes", p.meta.notes ?? ""],
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} style={{ display: "grid", gap: 2 }}>
                  <dt className="pt-eb">{k}</dt>
                  <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{v}</dd>
                </div>
              ))}
            {(p.meta.references ?? []).length > 0 && (
              <div style={{ display: "grid", gap: 2 }}>
                <dt className="pt-eb">Reference</dt>
                {(p.meta.references ?? []).map((r) => (
                  <dd key={r} style={{ margin: 0, overflowWrap: "anywhere" }}>
                    <a href={r} target="_blank" rel="noopener noreferrer">
                      {r}
                    </a>
                  </dd>
                ))}
              </div>
            )}
          </dl>
        </section>
      </div>

      <ActivityList events={(events ?? []) as ProjectEvent[]} />
      <div id="messages">
        <ProjectMessages projectId={p.id} messages={(messages ?? []) as ProjectMessage[]} />
      </div>
    </>
  );
}
