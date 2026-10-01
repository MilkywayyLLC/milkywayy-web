"use client";

import { useState, useTransition } from "react";
import { updateLead } from "@/lib/admin/actions";
import { LEAD_STATUSES } from "@/lib/admin/leads";

/** Status (saves on change) and private notes for one lead. */
export function LeadEditor({
  reference,
  status: initialStatus,
  notes: initialNotes,
}: {
  reference: string;
  status: string;
  notes: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  const run = (patch: { status?: string; notes?: string }, ok: string) =>
    start(async () => {
      const r = await updateLead(reference, patch);
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Couldn't save." });
      if (r.ok && patch.notes !== undefined) setSaved(patch.notes);
    });
  return (
    <section className="ad-card ad-form" aria-label="Follow-up">
      <h2 className="ad-h2">Follow-up</h2>
      <div className="ad-field">
        <label htmlFor="lead-status">Status</label>
        <select
          id="lead-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            run({ status: e.target.value }, "Status saved.");
          }}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="ad-field">
        <label htmlFor="lead-notes">Notes (only admins see these)</label>
        <textarea
          id="lead-notes"
          rows={4}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn"
          disabled={pending || notes === saved}
          onClick={() => run({ notes }, "Notes saved.")}
        >
          Save notes
        </button>
        <span className={`ad-status${msg ? (msg.ok ? "ok" : "error") : ""}`} role="status">
          {pending ? "Saving…" : msg?.text}
        </span>
      </div>
    </section>
  );
}
