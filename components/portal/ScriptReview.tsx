"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Sheet } from "@/components/portal/ui";
import { decideScript, writeMessage } from "@/lib/portal/project-actions";
import type { ProjectScript } from "@/lib/portal/projects";

const STATE: Record<ProjectScript["status"], string> = {
  pending: "Waiting for your approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  replaced: "Replaced by a newer version",
};

/** Script approval (§5.4): approve, or ask for changes with a comment. Production waits for it. */
export function ScriptReview({
  projectId,
  script,
  older,
  canDecide,
}: {
  projectId: string;
  script: ProjectScript;
  older: ProjectScript[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "changes" | "confirm">("view");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>();
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideScript(projectId, script.id, approve, comment);
      setMsg({ ok: r.ok, text: r.ok ? r.notice : r.error });
      if (r.ok) {
        setMode("view");
        setComment("");
        router.refresh();
      } else if (approve) setMode("view");
    });

  return (
    <section
      className={`pt-card ${script.status === "pending" ? "pt-suggest" : ""}`}
      aria-labelledby="script-h"
      data-testid="script"
    >
      <div className="pt-row">
        <div style={{ display: "grid", gap: 2 }}>
          <h2 id="script-h" className="pt-h2">
            Script · v{script.version}
          </h2>
          {script.length_note && <span className="pt-meta">{script.length_note}</span>}
        </div>
        <Badge
          tone={
            script.status === "approved" ? "ok" : script.status === "pending" ? "gold" : undefined
          }
        >
          {STATE[script.status]}
        </Badge>
      </div>
      <div className="pt-script">{script.body}</div>
      {script.status === "changes_requested" && script.client_comment && (
        <p className="pt-meta" style={{ margin: 0 }}>
          You asked: “{script.client_comment}”. We’ll post the next version here.
        </p>
      )}
      {script.status === "approved" && script.decided_by_name && (
        <p className="pt-meta" style={{ margin: 0 }}>
          Approved by {script.decided_by_name}. Production has started.
        </p>
      )}
      {script.status === "pending" && canDecide && mode === "view" && (
        <>
          <p className="pt-meta" style={{ margin: 0 }}>
            Production starts once you approve.
          </p>
          <div className="pt-btns">
            <button type="button" className="btn btn-p" onClick={() => setMode("confirm")}>
              Approve script
            </button>
            <button type="button" className="btn btn-g" onClick={() => setMode("changes")}>
              Ask for changes
            </button>
          </div>
        </>
      )}
      {mode === "confirm" && (
        <Sheet title={`Approve script v${script.version}?`} onClose={() => setMode("view")}>
          <p style={{ margin: 0 }}>
            Production starts with this script. Changes after this count as a revision of the
            finished video.
          </p>
          <button
            type="button"
            className="btn btn-p"
            disabled={pending}
            onClick={() => decide(true)}
          >
            {pending ? "Approving…" : "Approve and start production"}
          </button>
        </Sheet>
      )}
      {mode === "changes" && (
        <form
          className="pt-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            decide(false);
          }}
        >
          <label className="pt-field">
            What should change?
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder="e.g. Mention JVC first, and end with our phone number instead of the website."
            />
          </label>
          <div className="pt-btns">
            <button type="submit" className="btn btn-p btn-s" disabled={pending || !comment.trim()}>
              {pending ? "Sending…" : "Send changes"}
            </button>
            <button type="button" className="btn btn-g btn-s" onClick={() => setMode("view")}>
              Back
            </button>
          </div>
        </form>
      )}
      {msg?.text && (
        <p className={msg.ok ? "pt-note" : "pt-error"} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
      {older.length > 0 && (
        <details>
          <summary className="pt-small">Earlier versions ({older.length})</summary>
          {older.map((s) => (
            <div key={s.id} style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <span className="pt-eb">
                v{s.version} · {STATE[s.status]}
              </span>
              <div className="pt-script">{s.body}</div>
              {s.client_comment && (
                <span className="pt-meta">Your comment: “{s.client_comment}”</span>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

/** "Ask about this project" on a completed batch: a message into its thread. */
export function AskAbout({ projectId, projectRef }: { projectId: string; projectRef: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>();
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-g btn-s pt-btn-sm" onClick={() => setOpen(true)}>
        Ask about this project
      </button>
      {open && (
        <Sheet title={`Ask about ${projectRef}`} onClose={() => setOpen(false)}>
          {msg?.ok ? (
            <p className="pt-note" role="status">
              {msg.text}
            </p>
          ) : (
            <form
              className="pt-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await writeMessage(projectId, body);
                  setMsg({
                    ok: r.ok,
                    text: r.ok ? "Sent. We’ll reply in this project’s messages." : r.error,
                  });
                });
              }}
            >
              <label className="pt-field">
                Your request
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={4000}
                  placeholder="e.g. Need 5 more photos in square format"
                />
              </label>
              {msg?.text && (
                <p className="pt-error" role="alert">
                  {msg.text}
                </p>
              )}
              <button type="submit" className="btn btn-p" disabled={pending || !body.trim()}>
                {pending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
