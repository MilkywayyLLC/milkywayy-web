"use client";

import { useState, useTransition } from "react";
import {
  addLinkFile,
  adminReply,
  finishUpload,
  publishDelivery,
  removeFile,
  resumeUpload,
  revisionStep,
  saveProjectNotes,
  startUpload,
  type ActionResult,
} from "@/lib/portal/admin-project-actions";
import {
  bytes,
  FILE_KINDS,
  kindLabel,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { WhatsAppButton, type StatusTarget } from "./ProjectStatus";

const PART = 16 * 1024 * 1024;
const PARALLEL = 3;

function Status({
  r,
  pending,
  busy = "Saving…",
}: {
  r?: ActionResult;
  pending?: boolean;
  busy?: string;
}) {
  return (
    <span className={`ad-status${r && !r.ok ? "error" : ""}`} role="status">
      {pending ? busy : (r?.notice ?? r?.error)}
    </span>
  );
}

/** PUT straight to R2 with a presigned URL, reporting progress; returns the part's ETag. */
function put(url: string, body: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () =>
      x.status >= 200 && x.status < 300
        ? resolve(x.getResponseHeader("ETag") ?? "")
        : reject(new Error(`R2 said ${x.status}`));
    x.onerror = () => reject(new Error("Network error (check the bucket's CORS settings)"));
    x.send(body);
  });
}

async function retry<T>(fn: () => Promise<T>, tries = 3) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

type Saved = { key: string; uploadId: string };
const memo = (ref: string, f: File) => `mw-upload:${ref}:${f.name}:${f.size}`;
const recall = (k: string): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null");
  } catch {
    return null;
  }
};
const remember = (k: string, v: Saved | null) => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {}
};

/**
 * Upload files into one delivery. Files up to 16 MB go in one request; bigger ones in 16 MB parts,
 * 3 at a time, each retried. If the page reloads mid-upload, choosing the same file again resumes:
 * R2 says which parts it already has.
 */
function Uploader({
  projectId,
  projectRef,
  delivery,
}: {
  projectId: string;
  projectRef: string;
  delivery: { no: number; label: string };
}) {
  const [kind, setKind] = useState("photos");
  const [rows, setRows] = useState<{ name: string; size: number; done: number; state: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function upload(files: File[]) {
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, done: 0, state: "Waiting" })));
    for (const [i, f] of files.entries()) {
      try {
        const k = memo(projectRef, f);
        const saved = recall(k);
        const plan = saved
          ? await resumeUpload(saved.key, saved.uploadId, f.size)
          : await startUpload(projectId, projectRef, delivery.no, f.name, f.size);
        if (!plan.ok) {
          set(i, { state: plan.error });
          continue;
        }
        if (plan.single) {
          set(i, { state: "Uploading" });
          await retry(() => put(plan.single!, f, (n) => set(i, { done: n })));
          const r = await finishUpload(projectId, delivery, {
            key: plan.key,
            name: f.name,
            size: f.size,
            type: f.type,
            kind,
          });
          set(i, { done: f.size, state: r.ok ? "Done" : r.error! });
          continue;
        }
        remember(k, { key: plan.key, uploadId: plan.uploadId! });
        const resumed = (plan as { done?: { partNumber: number; etag: string }[] }).done;
        const finished: { partNumber: number; etag: string }[] = resumed ? [...resumed] : [];
        const sent: Record<number, number> = Object.fromEntries(
          finished.map((p) => [p.partNumber, PART]),
        );
        const show = () =>
          set(i, {
            done: Math.min(
              f.size,
              Object.values(sent).reduce((a, b) => a + b, 0),
            ),
          });
        set(i, { state: finished.length ? "Resuming" : "Uploading" });
        show();
        const queue = [...plan.parts!];
        await Promise.all(
          Array.from({ length: PARALLEL }, async () => {
            for (let p = queue.shift(); p; p = queue.shift()) {
              const part = p;
              const blob = f.slice((part.partNumber - 1) * PART, part.partNumber * PART);
              const etag = await retry(() =>
                put(part.url, blob, (n) => ((sent[part.partNumber] = n), show())),
              );
              finished.push({ partNumber: part.partNumber, etag });
            }
          }),
        );
        set(i, { state: "Finishing" });
        const r = await finishUpload(projectId, delivery, {
          key: plan.key,
          uploadId: plan.uploadId,
          parts: finished,
          name: f.name,
          size: f.size,
          type: f.type,
          kind,
        });
        if (r.ok) remember(k, null);
        set(i, { done: f.size, state: r.ok ? "Done" : r.error! });
      } catch (e) {
        set(i, {
          state: `${e instanceof Error ? e.message : "Failed"}. Choose the file again to resume.`,
        });
      }
    }
    setBusy(false);
  }

  return (
    <div className="ad-form" style={{ gap: 10 }}>
      <div
        className="ad-grid2"
        style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", alignItems: "end" }}
      >
        <div className="ad-field">
          <label htmlFor={`kind-${delivery.no}`}>What is it?</label>
          <select id={`kind-${delivery.no}`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {FILE_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor={`files-${delivery.no}`}>Upload files (up to 5 GB each)</label>
          <input
            id={`files-${delivery.no}`}
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              e.target.value = "";
              if (fs.length) void upload(fs);
            }}
          />
        </div>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <span className="ad-small">
            {r.name} · {bytes(r.size)} · {r.state}
            {r.state === "Uploading" || r.state === "Resuming"
              ? ` ${Math.floor((r.done / r.size) * 100)}%`
              : ""}
          </span>
          <div className="ad-progress" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (r.done / Math.max(1, r.size)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkForm({
  projectId,
  delivery,
}: {
  projectId: string;
  delivery: { no: number; label: string };
}) {
  const [kind, setKind] = useState("photos");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-form"
      style={{ gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addLinkFile(projectId, delivery, { kind, label, url });
          setR(res);
          if (res.ok) {
            setLabel("");
            setUrl("");
          }
        });
      }}
    >
      <div className="ad-grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="ad-field">
          <label htmlFor={`lk-${delivery.no}`}>Or add a link: what is it?</label>
          <select id={`lk-${delivery.no}`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {FILE_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <label htmlFor={`ln-${delivery.no}`}>Name the client sees</label>
          <input
            id={`ln-${delivery.no}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 360 tour"
          />
        </div>
      </div>
      <div className="ad-field">
        <label htmlFor={`lu-${delivery.no}`}>Link</label>
        <input
          id={`lu-${delivery.no}`}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small ghost" disabled={pending}>
          Add link
        </button>
        <Status r={r} pending={pending} />
      </div>
    </form>
  );
}

/**
 * Deliveries (§4.2): numbered and kept, so earlier versions stay downloadable. Files are hidden
 * from the client until the delivery is published; publishing marks the project Delivered (or the
 * revision delivered) and can email the client.
 */
export function Deliveries({
  project,
  groups,
  revisionOpen,
  origin,
}: {
  project: StatusTarget;
  groups: { no: number; label: string; files: ProjectFile[]; published: boolean }[];
  revisionOpen: boolean;
  origin: string;
}) {
  const nextNo = (groups[0]?.no ?? 0) + 1;
  const revisions = groups.filter((g) => g.label.startsWith("Revision")).length;
  const [draft, setDraft] = useState<{ no: number; label: string } | null>(null);
  const open =
    groups.find((g) => !g.published) ??
    (draft && !groups.some((g) => g.no === draft.no)
      ? { ...draft, files: [], published: false }
      : null);
  const [notify, setNotify] = useState(project.inPortal);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const [published, setPublished] = useState<string | null>(null);

  return (
    <section className="ad-card ad-form" aria-label="Deliveries" data-testid="deliveries">
      <h2 className="ad-h2">Deliveries</h2>
      {groups.length === 0 && !open && <p className="ad-empty">Nothing delivered yet.</p>}
      {groups.map((g) => (
        <div
          key={g.no}
          className="ad-form"
          style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}
        >
          <div className="ad-row-main" style={{ justifyContent: "space-between" }}>
            <b>{g.label}</b>
            <span className={`ad-pill ${g.published ? "live" : "draft"}`}>
              {g.published ? "Published" : "Not published yet"}
            </span>
          </div>
          <div className="ad-list">
            {g.files.map((f) => (
              <div key={f.id} className="ad-row ad-lead">
                <span className="ad-pill draft">{kindLabel(f.kind)}</span>
                <span className="ad-row-main">
                  <span>
                    <span className="ad-row-title">{f.label}</span>
                    <span className="ad-row-meta" style={{ display: "block" }}>
                      {f.source === "link" ? f.url : bytes(f.bytes)}
                    </span>
                  </span>
                </span>
                <RemoveFile projectId={project.id} fileId={f.id} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {open ? (
        <div
          className="ad-form"
          style={{ gap: 12, borderTop: "1px solid var(--fg)", paddingTop: 12 }}
        >
          <b>Adding to {open.label}</b>
          <Uploader
            projectId={project.id}
            projectRef={project.ref}
            delivery={{ no: open.no, label: open.label }}
          />
          <LinkForm projectId={project.id} delivery={{ no: open.no, label: open.label }} />
          <label className="ad-check">
            <input
              type="checkbox"
              checked={notify}
              disabled={!project.inPortal}
              onChange={(e) => setNotify(e.target.checked)}
            />
            {project.inPortal
              ? "Email the client when published"
              : "Not in the portal yet: send the WhatsApp after publishing"}
          </label>
          <div className="ad-btns" style={{ alignItems: "center" }}>
            <button
              type="button"
              className="ad-btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await publishDelivery(project.id, open.no, notify);
                  setR(res);
                  if (res.ok) {
                    setPublished(res.event ?? "delivered");
                    setDraft(null);
                  }
                })
              }
            >
              Publish {open.label}
            </button>
            <Status r={r} pending={pending} busy="Publishing…" />
          </div>
        </div>
      ) : (
        <div className="ad-btns">
          <button
            type="button"
            className="ad-btn ghost"
            onClick={() =>
              setDraft({
                no: nextNo,
                label: revisionOpen
                  ? `Revision ${revisions + 1}`
                  : `Delivery ${nextNo - revisions}`,
              })
            }
          >
            {revisionOpen
              ? `Start Revision ${revisions + 1}`
              : `Start Delivery ${nextNo - revisions}`}
          </button>
        </div>
      )}
      {published && (
        <div className="ad-btns" style={{ alignItems: "center" }}>
          <WhatsAppButton
            project={project}
            event={published === "revision_delivered" ? "revision_delivered" : "delivered"}
            origin={origin}
          />
          <span className="ad-status" role="status">
            {r?.notice} Optional: tell them on WhatsApp too.
          </span>
        </div>
      )}
    </section>
  );
}

function RemoveFile({ projectId, fileId }: { projectId: string; fileId: string }) {
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  return (
    <button
      type="button"
      className="ad-btn quiet small"
      disabled={pending}
      onClick={() =>
        sure ? start(async () => void (await removeFile(projectId, fileId))) : setSure(true)
      }
    >
      {pending ? "Removing…" : sure ? "Really remove?" : "Remove"}
    </button>
  );
}

export function RevisionPanel({
  projectId,
  state,
  used,
  allowed,
}: {
  projectId: string;
  state: string | null;
  used: number;
  allowed: number;
}) {
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <section className="ad-card ad-form" aria-label="Revisions">
      <h2 className="ad-h2">Revisions</h2>
      <span>
        {used} of {allowed} rounds used
        {state
          ? ` · ${state === "requested" ? "requested by the client" : state === "in_progress" ? "in progress" : "delivered"}`
          : ""}
      </span>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        {state === "requested" && (
          <button
            type="button"
            className="ad-btn small"
            disabled={pending}
            onClick={() => start(async () => setR(await revisionStep(projectId, "in_progress")))}
          >
            Mark in progress
          </button>
        )}
        <button
          type="button"
          className="ad-btn small ghost"
          disabled={pending}
          onClick={() => start(async () => setR(await revisionStep(projectId, "grant_round")))}
        >
          +1 round
        </button>
        <Status r={r} pending={pending} />
      </div>
      {(state === "requested" || state === "in_progress") && (
        <span className="ad-small ad-muted">
          Deliver the revision by starting a new delivery below and publishing it.
        </span>
      )}
    </section>
  );
}

export function Thread({
  project,
  messages,
  origin,
}: {
  project: StatusTarget;
  messages: ProjectMessage[];
  origin: string;
}) {
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(project.inPortal);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <section className="ad-card ad-form" aria-label="Messages" data-testid="thread">
      <h2 className="ad-h2">Messages</h2>
      {messages.length === 0 && <p className="ad-empty">No messages yet.</p>}
      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            display: "grid",
            gap: 2,
            padding: "8px 10px",
            border: "1px solid var(--line)",
            background: m.is_admin ? "var(--bg)" : "var(--surface)",
          }}
        >
          <span className="ad-eb">
            {m.is_admin ? "Milkywayy" : (m.author_name ?? "Client")} ·{" "}
            {new Date(m.at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Dubai",
            })}
          </span>
          <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
        </div>
      ))}
      <div className="ad-field">
        <label htmlFor="reply">Reply</label>
        <textarea
          id="reply"
          rows={3}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <label className="ad-check">
        <input
          type="checkbox"
          checked={notify}
          disabled={!project.inPortal}
          onChange={(e) => setNotify(e.target.checked)}
        />
        Email the client
      </label>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              const res = await adminReply(project.id, body, notify);
              setR(res);
              if (res.ok) setBody("");
            })
          }
        >
          Send reply
        </button>
        <Status r={r} pending={pending} busy="Sending…" />
        {r?.ok && (
          <WhatsAppButton
            project={project}
            event="new_message"
            origin={origin}
            small
            label="Tell them on WhatsApp"
          />
        )}
      </div>
    </section>
  );
}

export function ProjectNotes({ projectId, notes: initial }: { projectId: string; notes: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <section className="ad-card ad-form" aria-label="Internal notes">
      <div className="ad-field">
        <label htmlFor="pnotes">Internal notes (only admins see these)</label>
        <textarea
          id="pnotes"
          rows={4}
          maxLength={8000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn small"
          disabled={pending || notes === saved}
          onClick={() =>
            start(async () => {
              const res = await saveProjectNotes(projectId, notes);
              setR(res);
              if (res.ok) setSaved(notes);
            })
          }
        >
          Save notes
        </button>
        <Status r={r} pending={pending} />
      </div>
    </section>
  );
}
