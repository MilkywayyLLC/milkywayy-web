import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterLauncher, CharactersRow } from "@/components/portal/Characters";
import { AddFiles } from "@/components/portal/ClientUpload";
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
import { AvatarRequestActions } from "@/components/portal/AvatarRequest";
import {
  ProjectPaymentCard,
  type BillingPayments,
  type MyProjectPayment,
} from "@/components/portal/PaymentParts";
import { ProjectCancel } from "@/components/portal/ShootChanges";
import { seesMoney } from "@/lib/portal/shell";
import { stripeReady } from "@/lib/stripe";
import { AskAbout, ScriptReview } from "@/components/portal/ScriptReview";
import { DraftsRow, StartRequests } from "@/components/portal/StartRequests";
import { Back, Badge, Stepper } from "@/components/portal/ui";
import { AREA_OF, can } from "@/lib/portal/access";
import { requireAccount } from "@/lib/portal/auth";
import { characterTitle, coverOf, myCharacters } from "@/lib/portal/characters";
import { myDrafts } from "@/lib/portal/draft-actions";
import { requestConfig } from "@/lib/portal/requests";
import {
  avatarAction,
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
import { AVATAR_FORMATS, type AvatarFormat } from "@/lib/portal/booking";
import { maxUploadGb } from "@/lib/r2";

/** An avatar video's brief as the edit form's starting point (format and length from it). */
function avatarEditOf(p: Project, files: ProjectFile[], presenters: string[]) {
  const notes = p.meta.notes ?? "";
  const format: AvatarFormat = p.meta.kind === "longer" ? "long" : "short";
  const min = Number(/· (\d+) min/.exec(notes)?.[1] ?? 0);
  const stop = Math.max(0, (AVATAR_FORMATS.long.stops as readonly number[]).indexOf(min));
  return {
    projectId: p.id,
    ref: p.ref,
    title: p.title,
    format,
    stop: format === "long" ? stop : 0,
    notes: notes
      .split("\n")
      .filter((l) => !l.startsWith("Format: "))
      .join("\n")
      .trim(),
    reference: p.meta.references?.[0] ?? "",
    scriptBy: p.meta.script_by ?? "milkywayy",
    presenters,
    files: files.filter((f) => f.direction === "in").map((f) => ({ id: f.id, label: f.label })),
  };
}

/**
 * Editing (§5.3) and Avatars (§5.4) share one list and one project page; avatar videos add the
 * script approval. Shoots keep their own pages (dates, slots, addresses).
 */
type Kind = "edit" | "avatar";
const COPY = {
  edit: {
    eyebrow: "Post-production",
    title: "Editing",
    newLabel: "Edit my files",
    noun: "batch",
    empty: "No editing requests yet. Send your files and track them here.",
  },
  avatar: {
    eyebrow: "AI avatars",
    title: "Avatars",
    newLabel: "AI avatar video",
    noun: "video",
    empty: "No avatar videos yet. Send a brief and track it here.",
  },
} as const;

const busyRev = (p: Project) =>
  p.revision_state === "requested" || p.revision_state === "in_progress";
const tone = (p: Project) =>
  p.status === "on_hold"
    ? "warn"
    : p.status === "delivered" || p.status === "script_ready"
      ? "gold"
      : undefined;

export async function ProjectList({ type, tab, q }: { type: Kind; tab?: string; q?: string }) {
  const base = TYPE_PATH[type];
  const c = COPY[type];
  const { db, user, current } = await requireAccount(base);
  if (!can(current, AREA_OF[type]))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include {c.title.toLowerCase()}</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const [all, cfg, drafts, characters] = await Promise.all([
    myProjects(db, current.account.id, type, user.id),
    requestConfig(db, current),
    myDrafts(),
    type === "avatar" ? myCharacters(db, current.account.id) : Promise.resolve([]),
  ]);
  const presenters = characters
    .filter((ch) => ch.status === "approved")
    .map((ch) => ({ id: ch.id, name: characterTitle(ch), src: coverOf(ch)?.src ?? null }));
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
        {type === "avatar" ? (
          <CharacterLauncher cfg={cfg} presenters={presenters} />
        ) : (
          <StartRequests cfg={cfg} only={type} label={c.newLabel} />
        )}
      </div>
      {type === "avatar" && <CharactersRow characters={characters} />}
      <DraftsRow
        drafts={drafts.filter((d) => d.kind === type)}
        hrefs={{
          [type]:
            type === "edit" ? "/portal/book?kind=edit&draft=1" : `${base}?new=${type}&draft=1`,
        }}
      />

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
              <div key={p.id} className="pt-card pt-card-link pt-stretch" style={{ gap: 10 }}>
                <div className="pt-row">
                  <span className="pt-eb">
                    {p.ref} · {briefKindLabel(type, p.meta.kind)}
                  </span>
                  <Badge tone={tone(p)}>{clientStatus(p)}</Badge>
                </div>
                <Link
                  href={`${base}/${encodeURIComponent(p.ref)}`}
                  className="pt-title pt-stretch-link"
                >
                  {p.title}
                </Link>
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
                    p.shared_with?.length ? `Shared with ${p.shared_with.length}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {type === "avatar" &&
                  (() => {
                    const act = avatarAction(p.status, busyRev(p));
                    return act ? (
                      <Link
                        href={`${base}/${encodeURIComponent(p.ref)}?${act}=1`}
                        className="lnk pt-small pt-stretch-act"
                        prefetch={false}
                      >
                        {act === "edit" ? "Edit request" : "Request a revision"}
                      </Link>
                    ) : null;
                  })()}
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-card">
            <span className="pt-meta">
              {all.length ? "Nothing in progress. Your earlier ones are under Completed." : c.empty}
            </span>
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
                {query
                  ? `Nothing matches “${q}”.`
                  : "Nothing completed yet. Finished work stays here to download."}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export async function ProjectDetail({
  type,
  projectRef,
  open: openAction,
  banner,
}: {
  type: Kind;
  projectRef: string;
  /** Avatar videos: ?edit=1 or ?revise=1 from a card opens that modal. */
  open?: "edit" | "revise";
  /** Back from Stripe: ?paid=1 or ?pay=1. */
  banner?: "paid" | "pay" | null;
}) {
  const base = TYPE_PATH[type];
  const c = COPY[type];
  const { db, current } = await requireAccount(`${base}/${projectRef}`);
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
  // Payment terms (owner, 24 Oct 2026): unpaid booking invoices lock the downloads.
  const [{ data: payData }, { data: bp }] = await Promise.all([
    db.rpc("my_project_payment", { p_project: p.id }),
    seesMoney(current)
      ? db.rpc("my_billing_payments", { p_account: current.account.id })
      : Promise.resolve({ data: null }),
  ]);
  const pay = payData as MyProjectPayment | null;
  const locked = !!pay?.locked;
  // Avatar videos: what Edit request / Request a revision need.
  const [cfg, characters, { data: pc }] =
    type === "avatar"
      ? await Promise.all([
          requestConfig(db, current),
          myCharacters(db, current.account.id),
          db.from("project_characters").select("character_id").eq("project_id", p.id),
        ])
      : [null, [], { data: [] }];
  const presenters = characters
    .filter((ch) => ch.status === "approved")
    .map((ch) => ({ id: ch.id, name: characterTitle(ch), src: coverOf(ch)?.src ?? null }));
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
          <h1 className="pt-h1">{p.title}</h1>
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

      {type === "avatar" && cfg && (
        <AvatarRequestActions
          projectId={p.id}
          status={p.status}
          revisionBusy={busyRev(p)}
          cfg={cfg}
          presenters={presenters}
          edit={avatarEditOf(
            p,
            all,
            ((pc ?? []) as { character_id: string }[]).map((x) => x.character_id),
          )}
          autoOpen={openAction}
        />
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

      {pay && (
        <ProjectPaymentCard
          pay={pay}
          card={stripeReady()}
          billing={bp as BillingPayments | null}
          banner={banner}
        />
      )}
      {can(current, AREA_OF[type]) &&
        ["submitted", "files_received", "brief_received"].includes(p.status) && (
          <ProjectCancel projectId={p.id} projectRef={p.ref} noun={c.noun} />
        )}
      <ApprovalNote p={p} />
      <ProjectActions
        projectId={p.id}
        zipId={locked ? null : (zip?.id ?? null)}
        {...actionsFor(p)}
        // Avatar videos ask for revisions (with images) from Request a revision above.
        {...(type === "avatar" ? { canRevise: false } : {})}
        hasDelivery={!!latest}
        noun={c.noun}
      />
      <DeliveryList files={all} locked={locked} />
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
