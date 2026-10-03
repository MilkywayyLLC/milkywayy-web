"use client";

import { useState, useTransition } from "react";
import { disableShare, resolveReports } from "@/lib/portal/admin-listing-actions";

/** Turn a share page off (with a reason the client sees), back on, or clear its reports. */
export function ShareSwitch({
  kind,
  id,
  title,
  disabled,
  reports,
}: {
  kind: "l" | "c";
  id: string;
  title: string;
  disabled: boolean;
  reports: number;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (p: () => Promise<{ ok: boolean; error?: string; notice?: string }>) =>
    start(async () => {
      const r = await p();
      setMsg(r.ok ? (r.notice ?? "Done.") : (r.error ?? "Couldn’t do that."));
      if (r.ok) setOpen(false);
    });
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      {disabled ? (
        <button
          type="button"
          className="ad-btn small ghost"
          disabled={pending}
          onClick={() => run(() => disableShare(kind, id, null))}
        >
          Turn back on
        </button>
      ) : open ? (
        <form
          className="ad-btns"
          aria-label={`Turn off ${title}`}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => disableShare(kind, id, reason));
          }}
        >
          <input
            aria-label={`Reason for turning off ${title}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (the client sees it)"
            minLength={3}
            maxLength={300}
            required
          />
          <button type="submit" className="ad-btn small" disabled={pending}>
            Turn off
          </button>
          <button type="button" className="ad-btn quiet small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="ad-btn small ghost"
          aria-label={`Turn off ${title}`}
          onClick={() => setOpen(true)}
        >
          Turn off
        </button>
      )}
      {reports > 0 && !disabled && (
        <button
          type="button"
          className="ad-btn quiet small"
          disabled={pending}
          onClick={() => run(() => resolveReports(kind, id))}
        >
          Clear reports
        </button>
      )}
      <span className="ad-status" role="status">
        {msg}
      </span>
    </div>
  );
}
