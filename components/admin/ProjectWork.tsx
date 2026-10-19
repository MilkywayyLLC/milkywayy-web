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
  saveThumb,
  startUpload,
  thumbUploadUrl,
  type ActionResult,
} from "@/lib/portal/admin-project-actions";
import {
  bytes,
  FILE_KINDS,
  kindLabel,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/portal/projects";
import { makeWebVersions, mediaUploadUrls, saveMedia } from "@/lib/portal/admin-listing-actions";
import { makeImage, makeThumb, putBlob, uploadFile, videoPoster } from "@/lib/upload-browser";
import { Confirm } from "./Confirm";
import { WhatsAppButton, type StatusTarget } from "./ProjectStatus";

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
    <span className={r && !r.ok ? "ad-status error" : "ad-status"} role="status">
      {pending ? busy : (r?.notice ?? r?.error)}
    </span>
  );
}

/** Share-page versions of a delivered photo, made in this browser (no-op if it can't). */
async function photoWebVersions(projectId: string, fileId: string, f: File) {
  const [web, og] = await Promise.all([
    makeImage(f, 2048, "image/webp", 0.82),
    makeImage(f, 1200, "image/jpeg", 0.8),
  ]);
  if (!web || !og) return;
  const u = await mediaUploadUrls(projectId, fileId, "photo");
  if (!u.ok || !u.urls) return;
  if ((await putBlob(u.urls.web, web)) && (await putBlob(u.urls.og, og)))
    await saveMedia(projectId, fileId, { web: true, og: true, bytes: web.size });
}

const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === "application/zip";
const IMAGE = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;
const IMAGE_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};
/** The images inside a zip, as files (folders and macOS metadata skipped), in name order. */
async function unzipImages(zip: File): Promise<File[]> {
  const { default: JSZip } = await import("jszip");
  const z = await JSZip.loadAsync(zip);
  const entries = Object.values(z.files)
    .filter((e) => !e.dir && IMAGE.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const out: File[] = [];
  for (const e of entries) {
    const name = e.name.split("/").pop()!;
    const ext = name.split(".").pop()!.toLowerCase();
    out.push(new File([await e.async("blob")], name, { type: IMAGE_TYPE[ext] ?? "image/jpeg" }));
  }
  return out;
}

/**
 * Upload files into one delivery (lib/upload-browser: straight to R2, resumable).
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

  async function upload(picked: File[]) {
    setBusy(true);
    // Photos are always stored one image at a time (listings use them): a zip is unpacked here,
    // in the browser, and each image uploaded on its own (owner, 10 Oct 2026).
    let files = picked;
    if (kind === "photos" && picked.some(isZip)) {
      setRows(
        picked.map((f) => ({
          name: f.name,
          size: f.size,
          done: 0,
          state: isZip(f) ? "Unzipping…" : "Waiting",
        })),
      );
      files = (await Promise.all(picked.map((f) => (isZip(f) ? unzipImages(f) : [f])))).flat();
      if (!files.length) {
        setRows([
          { name: "No images found in the zip", size: 0, done: 0, state: "Nothing to upload" },
        ]);
        setBusy(false);
        return;
      }
    }
    setRows(files.map((f) => ({ name: f.name, size: f.size, done: 0, state: "Waiting" })));
    for (const [i, f] of files.entries()) {
      await uploadFile(
        f,
        projectRef,
        {
          start: () => startUpload(projectId, projectRef, delivery.no, f.name, f.size),
          resume: (key, uploadId) => resumeUpload(key, uploadId, f.size),
          finish: async (x) => {
            const r = await finishUpload(projectId, delivery, {
              ...x,
              name: f.name,
              size: f.size,
              type: f.type,
              kind,
            });
            // Photos: a small preview next to the original, so clients see it without downloading.
            if (r.ok && r.fileId) {
              const thumb = await makeThumb(f);
              const t = thumb ? await thumbUploadUrl(x.key) : null;
              if (thumb && t?.url && (await putBlob(t.url, thumb)))
                await saveThumb(projectId, r.fileId, x.key);
              // And the web versions share pages use (§6.5): a 2048px WebP, a 1200px JPEG preview.
              if (kind === "photos" && thumb) await photoWebVersions(projectId, r.fileId, f);
            }
            return r;
          },
        },
        (patch) => set(i, patch),
      );
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
  past = false,
}: {
  project: StatusTarget;
  groups: { no: number; label: string; files: ProjectFile[]; published: boolean }[];
  revisionOpen: boolean;
  origin: string;
  /** A past project: no client email unless ticked (owner, 4 Oct 2026). */
  past?: boolean;
}) {
  const nextNo = (groups[0]?.no ?? 0) + 1;
  const revisions = groups.filter((g) => g.label.startsWith("Revision")).length;
  const [draft, setDraft] = useState<{ no: number; label: string } | null>(null);
  const open =
    groups.find((g) => !g.published) ??
    (draft && !groups.some((g) => g.no === draft.no)
      ? { ...draft, files: [], published: false }
      : null);
  const [notify, setNotify] = useState(project.inPortal && !past);
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
                      {f.expires_at && f.source === "r2"
                        ? ` · kept until ${new Date(f.expires_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : ""}
                    </span>
                  </span>
                </span>
                {(f.kind === "reel" || f.kind === "long_form") && (
                  <WebVersion projectId={project.id} file={f} />
                )}
                <RemoveFile
                  projectId={project.id}
                  fileId={f.id}
                  label={f.label}
                  published={f.published}
                />
              </div>
            ))}
          </div>
          {g.files.some((f) => f.kind === "photos" && f.source === "r2" && !f.web_key) && (
            <MakeWebVersions projectId={project.id} />
          )}
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
              ? past
                ? "Notify client (email them that the files are in their portal)"
                : "Email the client when published"
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

/**
 * Remove a file. Before publishing: two taps. After publishing the client may already rely on it,
 * so a dialog says so first (owner QA, 3 Oct 2026).
 */
function RemoveFile({
  projectId,
  fileId,
  label,
  published,
}: {
  projectId: string;
  fileId: string;
  label: string;
  published: boolean;
}) {
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const remove = () => start(async () => void (await removeFile(projectId, fileId)));
  return (
    <>
      <button
        type="button"
        className="ad-btn quiet small"
        disabled={pending}
        onClick={() => (published ? setSure(true) : sure ? remove() : setSure(true))}
      >
        {pending ? "Removing…" : sure && !published ? "Really remove?" : "Remove"}
      </button>
      {published && (
        <Confirm
          open={sure}
          title={`Remove “${label}”?`}
          confirmLabel="Remove it"
          danger
          busy={pending}
          onConfirm={remove}
          onCancel={() => setSure(false)}
        >
          <p style={{ margin: 0 }}>
            This delivery is already published: the client loses access to this file straight away,
            and an uploaded file is deleted from storage. To send a corrected version, start a new
            delivery instead.
          </p>
        </Confirm>
      )}
    </>
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

/**
 * A reel's web version for share pages (owner, 3 Oct 2026: no streaming service yet): an MP4 up
 * to 40 MB that plays straight from R2, with a poster taken from the video (or chosen).
 */
function WebVersion({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const has = !!file.web_key;
  async function upload(mp4: File, poster: File | null) {
    if (!/^video\/mp4$/.test(mp4.type)) return setState("Choose an MP4.");
    if (mp4.size > 40 * 1024 * 1024) return setState("Keep the web version under 40 MB.");
    setBusy(true);
    setState("Uploading…");
    try {
      const u = await mediaUploadUrls(projectId, file.id, "video");
      if (!u.ok || !u.urls) return setState(u.error ?? "Couldn’t start.");
      if (!(await putBlob(u.urls.web, mp4))) return setState("Upload failed. Try again.");
      const still = poster ?? (await videoPoster(mp4));
      const posterOk = still ? await putBlob(u.urls.poster, still) : false;
      const r = await saveMedia(projectId, file.id, {
        web: true,
        poster: posterOk,
        bytes: mp4.size,
        video: true,
      });
      setState(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ad-web" data-testid="web-version">
      <summary className={has ? "ad-pill live" : "ad-pill draft"}>
        {has ? `Web version · ${bytes(file.web_bytes ?? null)}` : "Add web version"}
      </summary>
      <form
        className="ad-form"
        style={{ gap: 8, paddingTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const mp4 = fd.get("mp4") as File | null;
          const poster = fd.get("poster") as File | null;
          if (mp4 && mp4.size) void upload(mp4, poster && poster.size ? poster : null);
        }}
      >
        <div className="ad-field">
          <label htmlFor={`mp4-${file.id}`}>Web version (MP4, up to 40 MB)</label>
          <input id={`mp4-${file.id}`} name="mp4" type="file" accept="video/mp4" required />
        </div>
        <div className="ad-field">
          <label htmlFor={`poster-${file.id}`}>Poster (optional: taken from the video)</label>
          <input id={`poster-${file.id}`} name="poster" type="file" accept="image/jpeg" />
        </div>
        <div className="ad-btns" style={{ alignItems: "center" }}>
          <button type="submit" className="ad-btn small" disabled={busy}>
            {has ? "Replace" : "Upload"}
          </button>
          {has && (
            <button
              type="button"
              className="ad-btn quiet small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await saveMedia(projectId, file.id, { web: false, video: true });
                setState(r.ok ? (r.notice ?? "Removed.") : (r.error ?? "Couldn’t remove."));
                setBusy(false);
              }}
            >
              Remove
            </button>
          )}
          <span className="ad-status" role="status">
            {state}
          </span>
        </div>
      </form>
    </details>
  );
}

/** Older photos without share-page versions: made on the server, six at a time. */
function MakeWebVersions({ projectId }: { projectId: string }) {
  const [r, setR] = useState<{ ok: boolean; error?: string; notice?: string }>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <button
        type="button"
        className="ad-btn small ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            let res = await makeWebVersions(projectId);
            while (res.ok && res.left) res = await makeWebVersions(projectId);
            setR(res);
          })
        }
      >
        Make web versions for share pages
      </button>
      <span className={r && !r.ok ? "ad-status error" : "ad-status"} role="status">
        {pending ? "Making web versions…" : (r?.notice ?? r?.error)}
      </span>
    </div>
  );
}
