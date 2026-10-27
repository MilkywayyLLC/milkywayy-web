"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Dropzone } from "@/components/portal/Dropzone";
import { Sheet } from "@/components/portal/ui";
import {
  addFileLink,
  finishClientUpload,
  resumeClientUpload,
  startClientUpload,
} from "@/lib/portal/project-actions";
import { bytes } from "@/lib/portal/projects";
import { uploadFile } from "@/lib/upload-browser";

type Row = { name: string; size: number; done: number; state: string };

/** Raw files straight from the browser to R2 (resumable), recorded on the project. */
export function useClientUploads() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  async function upload(projectId: string, files: File[]) {
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, done: 0, state: "Waiting" })));
    let ok = 0;
    for (const [i, f] of files.entries()) {
      const done = await uploadFile(
        f,
        projectId,
        {
          start: () => startClientUpload(projectId, f.name, f.size),
          resume: (key, uploadId) => resumeClientUpload(projectId, key, uploadId, f.size),
          finish: (x) =>
            finishClientUpload(projectId, { ...x, name: f.name, size: f.size, type: f.type }),
        },
        (patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x))),
      );
      if (done) ok++;
    }
    setBusy(false);
    return ok;
  }
  return { rows, busy, upload };
}

export function UploadRows({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "grid", gap: 10 }} data-testid="uploads">
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <span className="pt-small" style={{ overflowWrap: "anywhere" }}>
            {r.name} · {bytes(r.size)} · {r.state}
            {r.state === "Uploading" || r.state === "Resuming"
              ? ` ${Math.floor((r.done / Math.max(1, r.size)) * 100)}%`
              : ""}
          </span>
          <div className="pt-progress" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (r.done / Math.max(1, r.size)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FilePicker({
  files,
  onChange,
  maxGb,
  disabled,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  maxGb: number;
  disabled?: boolean;
}) {
  // Previews for photos the browser can show (phase 1: they showed as blank file tiles).
  const srcs = useMemo(
    () =>
      files.map((f) =>
        /^image\/(jpeg|png|webp|gif|avif)$/.test(f.type) ? URL.createObjectURL(f) : undefined,
      ),
    [files],
  );
  useEffect(() => () => srcs.forEach((u) => u && URL.revokeObjectURL(u)), [srcs]);
  return (
    <>
      <Dropzone
        items={files.map((f, i) => ({ id: String(i), name: f.name, size: f.size, src: srcs[i] }))}
        onAdd={(add) => onChange([...files, ...add])}
        onRemove={(id) => onChange(files.filter((_, j) => String(j) !== id))}
        accept=""
        types="Any file"
        noun="files"
        maxMb={maxGb * 1024}
        disabled={disabled}
        testId="file-picker"
      />
      <span className="pt-meta">Bigger than {maxGb} GB? Paste a link instead.</span>
    </>
  );
}

/** "+ Add files" on a batch or avatar project: a link, or uploads. */
export function AddFiles({
  projectId,
  maxGb,
  label = "+ Add files",
  primary,
}: {
  projectId: string;
  maxGb: number;
  label?: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [name, setName] = useState("More files");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>();
  const [pending, start] = useTransition();
  const { rows, busy, upload } = useClientUploads();

  return (
    <>
      <button
        type="button"
        className={primary ? "btn btn-p btn-s" : "lnk pt-small"}
        style={{ justifySelf: "start" }}
        onClick={() => {
          setMsg(undefined);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <Sheet title="Add files" onClose={() => !busy && setOpen(false)}>
          <div className="pt-seg" role="group" aria-label="How to send files">
            <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>
              Paste a link
            </button>
            <button
              type="button"
              aria-pressed={mode === "upload"}
              onClick={() => setMode("upload")}
            >
              Upload
            </button>
          </div>
          {mode === "link" ? (
            <form
              className="pt-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await addFileLink(projectId, name, url);
                  setMsg({ ok: r.ok, text: r.ok ? r.notice : r.error });
                  if (r.ok) {
                    setUrl("");
                    router.refresh();
                  }
                });
              }}
            >
              <label className="pt-field">
                Label
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
              </label>
              <label className="pt-field">
                Link
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Drive, Dropbox, OneDrive, WeTransfer or Frame.io"
                />
              </label>
              <button type="submit" className="btn btn-p" disabled={pending || !url.trim()}>
                {pending ? "Adding…" : "Add"}
              </button>
            </form>
          ) : (
            <div className="pt-form">
              <FilePicker files={files} onChange={setFiles} maxGb={maxGb} disabled={busy} />
              <UploadRows rows={rows} />
              <button
                type="button"
                className="btn btn-p"
                disabled={busy || !files.length}
                onClick={async () => {
                  const n = await upload(projectId, files);
                  setFiles([]);
                  setMsg({
                    ok: n > 0,
                    text: n
                      ? `${n} file${n === 1 ? "" : "s"} uploaded.`
                      : "Nothing uploaded. Check the messages above.",
                  });
                  router.refresh();
                }}
              >
                {busy ? "Uploading…" : `Upload ${files.length || ""}`.trim()}
              </button>
            </div>
          )}
          {msg?.text && (
            <p className={msg.ok ? "pt-note" : "pt-error"} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
