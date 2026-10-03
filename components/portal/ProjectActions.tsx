"use client";

import { useState, useTransition } from "react";
import { approve, askRevision, fileLink, writeMessage } from "@/lib/portal/project-actions";
import type { ProjectMessage } from "@/lib/portal/projects";
import { Icon } from "./Icon";
import { Sheet, useToast } from "./ui";

/** Gets a short-lived link for one file, then starts the download (or opens a link/360 tour). */
export function DownloadButton({
  fileId,
  label = "Download",
  name,
}: {
  fileId: string;
  label?: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  const [toast, say] = useToast();
  return (
    <>
      <button
        type="button"
        className="btn btn-g btn-s pt-btn-sm"
        disabled={pending}
        aria-label={`${label} ${name}`}
        onClick={() =>
          start(async () => {
            const r = await fileLink(fileId);
            if (!r.ok || !r.url) return say(r.error ?? "Couldn’t get the file.");
            if (label === "Open") window.open(r.url, "_blank", "noopener");
            else window.location.assign(r.url);
          })
        }
      >
        {pending ? (
          "…"
        ) : label === "Open" ? (
          "Open"
        ) : (
          <Icon name="download" size={16} title={`Download ${name}`} />
        )}
      </button>
      {toast}
    </>
  );
}

export function ProjectActions({
  projectId,
  zipId,
  canRevise,
  canApprove,
  round,
  hasDelivery,
}: {
  projectId: string;
  zipId: string | null;
  canRevise: boolean;
  canApprove: boolean;
  round: { next: number; of: number };
  hasDelivery: boolean;
}) {
  const [sheet, setSheet] = useState<null | "revision" | "approve">(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [downloading, startDownload] = useTransition();
  const [toast, say] = useToast();
  if (!hasDelivery) return null;

  return (
    <>
      <div className="pt-btns">
        {zipId && (
          <button
            type="button"
            className="btn btn-p"
            disabled={downloading}
            onClick={() =>
              startDownload(async () => {
                const r = await fileLink(zipId);
                if (r.ok && r.url) window.location.assign(r.url);
                else say(r.error ?? "Couldn’t get the file.");
              })
            }
          >
            <Icon name="download" size={18} /> {downloading ? "Preparing…" : "Download all"}
          </button>
        )}
        {canRevise && (
          <button type="button" className="btn btn-g" onClick={() => setSheet("revision")}>
            Request revision ({round.next} of {round.of})
          </button>
        )}
        {canApprove && (
          <button type="button" className="btn btn-g" onClick={() => setSheet("approve")}>
            <Icon name="check" size={18} /> Approve
          </button>
        )}
      </div>

      {sheet === "revision" && (
        <Sheet title={`Revision ${round.next} of ${round.of}`} onClose={() => setSheet(null)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await askRevision(projectId, note);
                if (!r.ok) return setError(r.error);
                setSheet(null);
                setNote("");
                say(r.notice!);
              });
            }}
          >
            <label className="pt-field">
              What should change?
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Photo 12: brighten the kitchen. Reel at 0:18: swap the music."
              />
            </label>
            <span className="pt-meta">
              Point to photo numbers or video timecodes. Screenshots or links can go in a message
              below.
            </span>
            {error && (
              <p className="pt-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-p" disabled={pending}>
              {pending ? "Sending…" : "Send revision request"}
            </button>
          </form>
        </Sheet>
      )}
      {sheet === "approve" && (
        <Sheet title="Approve this delivery?" onClose={() => setSheet(null)}>
          <p style={{ margin: 0 }}>
            The shoot moves to Completed. Your files stay available to download, and you can still
            message us about it.
          </p>
          {error && (
            <p className="pt-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn btn-p"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await approve(projectId);
                if (!r.ok) return setError(r.error);
                setSheet(null);
                say(r.notice!);
              })
            }
          >
            {pending ? "Approving…" : "Approve"}
          </button>
        </Sheet>
      )}
      {toast}
    </>
  );
}

/** The thread with Milkywayy about this project (§4.2): works on completed projects too. */
export function ProjectMessages({
  projectId,
  messages,
  hint = "Questions about this project go here.",
}: {
  projectId: string;
  messages: ProjectMessage[];
  hint?: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <section className="pt-card" aria-labelledby="msgs">
      <h2 id="msgs" className="pt-h2">
        Messages about this project
      </h2>
      <div style={{ display: "grid", gap: 10 }} data-testid="messages">
        {messages.length === 0 && (
          <p className="pt-meta" style={{ margin: 0 }}>
            No messages yet. {hint}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`pt-msg ${m.is_admin ? "admin" : ""}`}>
            <span className="pt-eb">
              {m.is_admin ? "Milkywayy" : (m.author_name ?? "You")} ·{" "}
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
      </div>
      <form
        className="pt-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await writeMessage(projectId, body);
            if (!r.ok) return setError(r.error);
            setError(undefined);
            setBody("");
          });
        }}
      >
        <textarea
          aria-label="Message"
          placeholder="Write a message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
        />
        {error && (
          <p className="pt-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-g btn-s"
          style={{ justifySelf: "start" }}
          disabled={pending || !body.trim()}
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
