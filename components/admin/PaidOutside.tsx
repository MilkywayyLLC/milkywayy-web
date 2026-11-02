"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPaidOutside } from "@/lib/portal/admin-payment-actions";

/**
 * Step 1 for work that was settled outside the portal (2 Nov 2026): past projects ("before the portal")
 * and projects flagged Already paid show this instead of Charges: nothing is billed, ever. A flagged
 * project can be made billable again; a past project can't.
 */
export function PaidOutside({ project, past }: { project: string; past: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="ad-card ad-form" aria-label="Charges" data-testid="paid-outside">
      <h2 className="ad-h2 ad-m0">1 · Charges — what we bill</h2>
      <p className="ad-note ad-m0">Paid outside the portal — not billed.</p>
      {!past && (
        <div className="ad-btns ad-center">
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setPaidOutside(project, false);
                setMsg(r.ok ? "" : (r.error ?? "Couldn’t save."));
                if (r.ok) router.refresh();
              })
            }
          >
            Make billable again
          </button>
          <span className="ad-err" role="alert">
            {msg}
          </span>
        </div>
      )}
    </section>
  );
}

/** A small control under Charges: flag a project as already paid so it is never billed. */
export function MarkPaidOutside({ project }: { project: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns ad-center" data-testid="mark-paid-outside">
      <button
        type="button"
        className="ad-btn quiet small"
        disabled={pending}
        onClick={() =>
          sure
            ? start(async () => {
                const r = await setPaidOutside(project, true);
                setMsg(r.ok ? "" : (r.error ?? "Couldn’t save."));
                if (r.ok) router.refresh();
              })
            : setSure(true)
        }
      >
        {sure ? "Really? Removes unbilled charges" : "Already paid outside the portal"}
      </button>
      <span className="ad-err" role="alert">
        {msg}
      </span>
    </div>
  );
}
