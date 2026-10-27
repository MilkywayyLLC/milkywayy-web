"use client";

import { useState, useTransition } from "react";
import { acceptProposal, declineProposal } from "@/lib/portal/pay-actions";

/**
 * Milkywayy proposed another time (phase 1, 27 Oct 2026). Accept confirms the shoot at that time;
 * decline cancels it with a full refund (card refunds go straight back to the card).
 */
export function ProposalBanner({
  projectId,
  when,
  was,
  note,
  paid,
}: {
  projectId: string;
  when: string;
  was: string;
  note?: string | null;
  paid: boolean;
}) {
  const [msg, setMsg] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <section
      className="pt-card pt-proposal"
      role="region"
      aria-label="New time proposed"
      data-testid="proposal"
    >
      <span className="pt-eb">New time proposed</span>
      <b className="pt-proposal-when">{when}</b>
      <span className="pt-meta">
        {was ? `Instead of ${was}. ` : ""}
        {note ? `“${note}”` : "Your preferred time wasn’t available."}
      </span>
      <div className="pt-proposal-btns">
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await acceptProposal(projectId);
              setMsg(r.ok ? (r.notice ?? "") : (r.error ?? ""));
            })
          }
        >
          Accept new time
        </button>
        {!sure ? (
          <button
            type="button"
            className="btn btn-g btn-s"
            disabled={pending}
            onClick={() => setSure(true)}
          >
            Decline
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-g btn-s pt-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await declineProposal(projectId);
                setMsg(r.ok ? (r.notice ?? "") : (r.error ?? ""));
              })
            }
          >
            {paid ? "Decline and get a full refund" : "Decline and cancel"}
          </button>
        )}
      </div>
      {sure && !msg && (
        <span className="pt-meta">
          Declining cancels the booking{paid ? " and refunds your payment in full" : ""}.
        </span>
      )}
      {msg && (
        <span className="pt-meta" role="status">
          {msg}
        </span>
      )}
    </section>
  );
}
