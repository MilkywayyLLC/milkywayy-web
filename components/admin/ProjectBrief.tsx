"use client";

import { useState, useTransition } from "react";
import { adminFileLink, postScript, type ActionResult } from "@/lib/portal/admin-project-actions";
import { bytes, day, expiry, type ProjectFile, type ProjectScript } from "@/lib/portal/projects";
import { WhatsAppButton, type StatusTarget } from "./ProjectStatus";

/** What the client sent: links open, uploads download through a short-lived link. */
export function FilesIn({ projectId, files }: { projectId: string; files: ProjectFile[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const ins = files.filter((f) => f.direction === "in");
  return (
    <section className="ad-card ad-form" aria-label="Files in" data-testid="files-in">
      <h2 className="ad-h2">Files in ({ins.length})</h2>
      {ins.length === 0 && <p className="ad-empty">The client hasn’t added files yet.</p>}
      <div className="ad-list">
        {ins.map((f) => (
          <div
            key={f.id}
            className="ad-row ad-lead"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
          >
            <span className="ad-row-main">
              <span>
                <span className="ad-row-title" style={{ overflowWrap: "anywhere" }}>
                  {f.label}
                </span>
                <span
                  className="ad-row-meta"
                  style={{ display: "block", overflowWrap: "anywhere" }}
                >
                  {f.source === "link" ? f.url : bytes(f.bytes)} · {day(f.created_at)}
                  {f.expires_at ? ` · ${expiry(f.expires_at)}` : ""}
                </span>
              </span>
            </span>
            <button
              type="button"
              className="ad-btn small ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await adminFileLink(projectId, f.id);
                  if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
                  else setErr(r.error);
                })
              }
            >
              {f.source === "link" ? "Open" : "Download"}
            </button>
          </div>
        ))}
      </div>
      {err && (
        <p className="ad-status error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

const STATE: Record<ProjectScript["status"], string> = {
  pending: "Waiting for the client",
  approved: "Approved",
  changes_requested: "Changes requested",
  replaced: "Replaced",
};

/** Avatar scripts: post a version, see the client's answer, post the next one. */
export function ScriptPanel({
  project,
  scripts,
  origin,
}: {
  project: StatusTarget;
  scripts: ProjectScript[];
  origin: string;
}) {
  const latest = scripts[0];
  const locked = latest?.status === "approved";
  const [body, setBody] = useState(latest && latest.status !== "approved" ? latest.body : "");
  const [length, setLength] = useState(latest?.length_note ?? "");
  const [notify, setNotify] = useState(project.inPortal);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();

  return (
    <section className="ad-card ad-form" aria-label="Script" data-testid="scripts">
      <h2 className="ad-h2">Script</h2>
      {scripts.map((s) => (
        <details key={s.id} open={s === latest}>
          <summary>
            <b>v{s.version}</b> · {STATE[s.status]}
            {s.decided_by_name ? ` by ${s.decided_by_name}` : ""} · {day(s.created_at)}
          </summary>
          <div className="ad-small" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
            {s.body}
          </div>
          {s.client_comment && (
            <p className="ad-note warn" style={{ marginTop: 8 }}>
              Client: “{s.client_comment}”
            </p>
          )}
        </details>
      ))}
      {locked ? (
        <span className="ad-small ad-muted">Approved. Production can start.</span>
      ) : (
        <>
          <div className="ad-field">
            <label htmlFor="script-body">
              {latest ? `Version ${latest.version + 1}` : "Version 1"} (the client approves this)
            </label>
            <textarea
              id="script-body"
              rows={8}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="ad-field">
            <label htmlFor="script-length">Length note (optional)</label>
            <input
              id="script-length"
              value={length}
              maxLength={60}
              placeholder="about 55 seconds"
              onChange={(e) => setLength(e.target.value)}
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
                start(async () => setR(await postScript(project.id, body, length, notify)))
              }
            >
              {latest ? "Post new version" : "Post script"}
            </button>
            <span className={r && !r.ok ? "ad-status error" : "ad-status"} role="status">
              {pending ? "Posting…" : (r?.notice ?? r?.error)}
            </span>
            {r?.ok && (
              <WhatsAppButton
                project={{ ...project, status: "script_ready" }}
                event="script_ready"
                origin={origin}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
