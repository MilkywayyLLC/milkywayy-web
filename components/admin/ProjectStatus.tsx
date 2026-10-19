"use client";

import { useState, useTransition } from "react";
import { logWhatsApp, setStatus, type ActionResult } from "@/lib/portal/admin-project-actions";
import {
  projectLink,
  waLink,
  whatsappFor,
  type MessageEvent,
  type ProjectInfo,
} from "@/lib/portal/messages";
import { statusLabel } from "@/lib/portal/projects";

export type StatusTarget = ProjectInfo & {
  id: string;
  status: string;
  inPortal: boolean;
  /** Who gets the WhatsApp: the account owner's number, else the booking's. */
  phone: string | null;
  name: string | null;
};

/** "Send on WhatsApp" with the ready-written message; the tap is logged (sent by hand). */
export function WhatsAppButton({
  project,
  event,
  origin,
  label = "Send on WhatsApp",
  small,
}: {
  project: StatusTarget;
  event: MessageEvent | "status";
  origin: string;
  label?: string;
  small?: boolean;
}) {
  if (!project.phone) return <span className="ad-small ad-muted">No WhatsApp number on file.</span>;
  const text = whatsappFor(event, project, {
    name: project.name,
    link: projectLink(origin, project.ref),
    status: statusLabel(project.status),
  });
  return (
    <a
      className={`ad-btn ${small ? "small ghost" : ""}`}
      href={waLink(project.phone, text)}
      target="_blank"
      rel="noopener"
      onClick={() => void logWhatsApp(project.id, event, project.phone!)}
    >
      {label}
    </a>
  );
}

/**
 * One-tap status buttons (phone list and project page). Each opens a small dialog: date and slot
 * when confirming, a reason when putting on hold, "Email the client" ticked, then Save. After saving,
 * the ready-written WhatsApp is one tap away.
 */
export function StatusButtons({
  project,
  options,
  origin,
}: {
  project: StatusTarget;
  options: string[];
  origin: string;
}) {
  const [to, setTo] = useState<string | null>(null);
  return (
    <>
      <div
        className="ad-btns"
        role="group"
        aria-label={`Set status for ${project.ref}`}
        style={{ gap: 6 }}
      >
        {options.map((s) => (
          <button
            key={s}
            type="button"
            className={`ad-btn small ${s === project.status ? "" : "ghost"}`}
            aria-pressed={s === project.status}
            disabled={s === project.status}
            onClick={() => setTo(s)}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>
      {to && <StatusDialog project={project} to={to} origin={origin} onClose={() => setTo(null)} />}
    </>
  );
}

const EVENT_FOR: Record<string, MessageEvent> = {
  confirmed: "booking_confirmed",
  shot: "shoot_done",
  delivered: "delivered",
  script_ready: "script_ready",
};
/** Every step can be emailed; the ones without their own email send a short progress update. */
const eventFor = (status: string): MessageEvent => EVENT_FOR[status] ?? "status_update";

function StatusDialog({
  project,
  to,
  origin,
  onClose,
}: {
  project: StatusTarget;
  to: string;
  origin: string;
  onClose: () => void;
}) {
  const event = eventFor(to);
  const [notify, setNotify] = useState(project.inPortal);
  const [date, setDate] = useState(project.shoot_date ?? "");
  const [slot, setSlot] = useState(project.slot ?? "Morning");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const saved = result?.ok;

  return (
    <div
      className="ad-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${project.ref} → ${statusLabel(to)}`}
      onClick={onClose}
    >
      <div className="ad-overlay-body ad-card ad-form" onClick={(e) => e.stopPropagation()}>
        <h2 className="ad-h2">
          {project.ref} → {statusLabel(to)}
        </h2>
        <span className="ad-small ad-muted">{project.title}</span>
        {!saved && (
          <>
            {to === "confirmed" && (
              <div className="ad-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="ad-field">
                  <label htmlFor="st-date">Date</label>
                  <input
                    id="st-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="ad-field">
                  <label htmlFor="st-slot">Slot</label>
                  <select id="st-slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                    {["Morning", "Afternoon", "Evening", "Twilight"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {to === "on_hold" && (
              <div className="ad-field">
                <label htmlFor="st-note">What you’re waiting for (the client sees this)</label>
                <input
                  id="st-note"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. The music licence for reel 2"
                />
              </div>
            )}
            <label className="ad-check">
              <input
                type="checkbox"
                checked={notify}
                disabled={!project.inPortal}
                onChange={(e) => setNotify(e.target.checked)}
              />
              {project.inPortal
                ? "Email the client"
                : "Email the client (not in the portal yet: use WhatsApp)"}
            </label>
            {result?.error && (
              <p className="ad-status error" role="alert">
                {result.error}
              </p>
            )}
            <div className="ad-btns">
              <button
                type="button"
                className="ad-btn"
                disabled={pending}
                onClick={() => {
                  if (to === "on_hold" && !note.trim())
                    return setResult({
                      ok: false,
                      error: "Say what you’re waiting for: the client sees it.",
                    });
                  start(async () =>
                    setResult(await setStatus(project.id, to, { date, slot, note, notify })),
                  );
                }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button type="button" className="ad-btn quiet" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
        {saved && (
          <>
            <p className="ad-note" role="status">
              {result.notice}
            </p>
            <div className="ad-btns">
              <WhatsAppButton
                project={{
                  ...project,
                  status: to,
                  status_note: to === "on_hold" ? note : null,
                  shoot_date: date || project.shoot_date,
                  slot: to === "confirmed" ? slot : project.slot,
                }}
                event={event}
                origin={origin}
              />
              <button type="button" className="ad-btn quiet" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
