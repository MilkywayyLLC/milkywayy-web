"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  finishClientUpload,
  requestAvatarRevision,
  resumeClientUpload,
  startClientUpload,
} from "@/lib/portal/project-actions";
import { avatarAction } from "@/lib/portal/projects";
import type { RequestConfig } from "@/lib/portal/requests";
import { uploadFile } from "@/lib/upload-browser";
import { Dropzone, usePicked } from "./Dropzone";
import { Field, Modal } from "./forms";
import { ProjectRequestModal, type AvatarEdit, type Presenter } from "./NewProjectForm";

/**
 * An avatar video's request actions (owner, 17 Oct 2026): "Edit request" while the brief is
 * received (we haven't started), else "Request a revision" (a note and optional images). Cards
 * link here with ?edit=1 / ?revise=1, which opens the matching modal straight away.
 */
export function AvatarRequestActions({
  projectId,
  status,
  revisionBusy,
  cfg,
  presenters,
  edit,
  autoOpen,
}: {
  projectId: string;
  status: string;
  /** A delivered video's revision is already under way. */
  revisionBusy: boolean;
  cfg: RequestConfig;
  presenters: Presenter[];
  edit: AvatarEdit;
  autoOpen?: "edit" | "revise";
}) {
  const router = useRouter();
  const mode = avatarAction(status, revisionBusy);
  // ?edit=1 / ?revise=1 opens the modal once on the client (never in the server render).
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [chosen, setOpen] = useState<"edit" | "revise" | null | undefined>(undefined);
  const open = chosen === undefined ? (mounted && autoOpen === mode ? autoOpen : null) : chosen;
  if (!mode) return null;
  const close = () => {
    setOpen(null);
    // Drop ?edit / ?revise so a refresh doesn't reopen it.
    if (autoOpen) router.replace(window.location.pathname, { scroll: false });
    router.refresh();
  };
  return (
    <>
      <div className="pt-btns">
        <button
          type="button"
          className="btn btn-g btn-s"
          data-testid={mode === "edit" ? "edit-request" : "request-revision"}
          onClick={() => setOpen(mode)}
        >
          {mode === "edit" ? "Edit request" : "Request a revision"}
        </button>
      </div>
      {open === "edit" && (
        <ProjectRequestModal
          type="avatar"
          cfg={cfg}
          characters={presenters}
          edit={edit}
          onClose={close}
        />
      )}
      {open === "revise" && <RevisionModal projectId={projectId} onClose={close} />}
    </>
  );
}

const noop = () => () => {};

function RevisionModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const picked = usePicked();
  const [prog, setProg] = useState<Record<string, { progress?: number; error?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await requestAvatarRevision(projectId, note, picked.list.length);
    if (!r.ok) {
      setBusy(false);
      return setMsg({ ok: false, text: r.error ?? "Something went wrong. Try again." });
    }
    let failed = 0;
    for (const p of picked.list) {
      const f = p.file;
      const ok = await uploadFile(
        f,
        projectId,
        {
          start: () => startClientUpload(projectId, f.name, f.size),
          resume: (key, uploadId) => resumeClientUpload(projectId, key, uploadId, f.size),
          finish: (x) =>
            finishClientUpload(projectId, { ...x, name: f.name, size: f.size, type: f.type }),
        },
        (u) =>
          u.done != null &&
          setProg((g) => ({
            ...g,
            [p.id]: { progress: Math.min(0.99, u.done! / Math.max(1, f.size)) },
          })),
      );
      setProg((g) => ({ ...g, [p.id]: ok ? { progress: 1 } : { error: "Didn’t upload" } }));
      if (!ok) failed++;
    }
    setBusy(false);
    setMsg({
      ok: !failed,
      text: failed
        ? "Sent, but some images didn’t upload. Add them under Files in."
        : (r.notice ?? "Revision requested."),
    });
  }

  const sent = msg?.ok;
  return (
    <Modal
      title="Request a revision"
      onClose={onClose}
      testId="avatar-revision"
      footer={
        sent ? (
          <button type="button" className="btn btn-p btn-s" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-g btn-s" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-p btn-s"
              disabled={busy || note.trim().length < 3}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send revision request"}
            </button>
          </>
        )
      }
    >
      <div className="pt-form">
        {msg && (
          <p className={msg.ok ? "pt-note" : "pt-form-banner"} role={msg.ok ? "status" : "alert"}>
            {msg.text}
          </p>
        )}
        {!sent && (
          <>
            <Field name="note" label="What should change?" required>
              <textarea
                rows={4}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Field name="images" label="Images" group hint="Optional: show us what you mean.">
              <Dropzone
                items={picked.list.map((p) => ({
                  id: p.id,
                  name: p.file.name,
                  size: p.file.size,
                  src: p.src,
                  progress: prog[p.id]?.progress,
                  error: prog[p.id]?.error,
                }))}
                onAdd={(f) => picked.add(f)}
                onRemove={picked.remove}
                accept="image/png,image/jpeg,image/webp,image/heic"
                types="JPG, PNG, WebP or HEIC"
                maxMb={25}
                max={6}
                disabled={busy}
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
