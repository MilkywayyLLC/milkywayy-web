"use client";

import { dubaiToday, WhenPicker } from "./WhenPicker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { applyMyChange, quoteMyChange } from "@/lib/portal/payment-actions";
import type { ChangeKind, ChangeQuote } from "@/lib/portal/payments";
import type { RequestConfig } from "@/lib/portal/requests";
import type { BookingEdit } from "./BookingFlow";
import { Sheet } from "./ui";

/**
 * Change a shoot before it happens (owner, 10 Oct 2026). Requested: "Edit details". Confirmed:
 * "Request a change" (back to Requested; Milkywayy confirms it again). Both: "Reschedule" and
 * "Cancel" (payment terms, 24 Oct 2026): the fee and refund are shown before you confirm — free more
 * than 3 hours before the shoot, a late fee after that. Every change is in Activity and emailed.
 */
export function ShootChanges({ edit }: { cfg?: RequestConfig; edit: BookingEdit }) {
  const confirmed = edit.status === "confirmed";
  const [open, setOpen] = useState<ChangeKind | null>(null);
  return (
    <div className="pt-btns" data-testid="shoot-changes">
      {/* The Book media page, at the Summary (owner, 18 Oct 2026). */}
      <Link href={`/portal/book?edit=${encodeURIComponent(edit.ref)}`} className="btn btn-g btn-s">
        {confirmed ? "Request a change" : "Edit details"}
      </Link>
      <button type="button" className="btn btn-g btn-s" onClick={() => setOpen("reschedule")}>
        Reschedule
      </button>
      <button type="button" className="btn btn-g btn-s" onClick={() => setOpen("cancel")}>
        {confirmed ? "Cancel shoot" : "Cancel request"}
      </button>
      {open && (
        <ChangeDialog
          kind={open}
          projectId={edit.projectId}
          projectRef={edit.ref}
          noun="shoot"
          date={edit.date}
          startTime={edit.startTime}
          slot={edit.slot}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Edits and avatar videos: cancel before work starts (full refund). */
export function ProjectCancel({
  projectId,
  projectRef,
  noun,
}: {
  projectId: string;
  projectRef: string;
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-btns" data-testid="project-cancel">
      <button type="button" className="btn btn-g btn-s" onClick={() => setOpen(true)}>
        Cancel {noun}
      </button>
      {open && (
        <ChangeDialog
          kind="cancel"
          projectId={projectId}
          projectRef={projectRef}
          noun={noun}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const aed = (n: number) =>
  `AED ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function ChangeDialog({
  kind,
  projectId,
  projectRef,
  noun,
  date: date0 = "",
  startTime: time0 = "",
  slot: slot0 = "",
  onClose,
}: {
  kind: ChangeKind;
  projectId: string;
  projectRef: string;
  noun: string;
  date?: string;
  startTime?: string;
  slot?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<ChangeQuote | null>(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useState(date0);
  const [time, setTime] = useState(time0);
  const [loading, startLoad] = useTransition();
  const [pending, start] = useTransition();
  useEffect(() => {
    startLoad(async () => {
      const r = await quoteMyChange(projectId, kind);
      if (!r.ok || !r.quote) setErr(r.error ?? "Couldn’t work it out. Try again.");
      else setQuote(r.quote);
    });
  }, [projectId, kind]);
  const title = kind === "cancel" ? `Cancel ${projectRef}?` : `Reschedule ${projectRef}`;
  const charge = quote && (quote.fee > 0 || quote.halfDays > 0);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="pt-form" data-testid="change-dialog">
        {loading && <p className="pt-meta">Working out the fee…</p>}
        {quote && !quote.allowed && (
          <p className="pt-meta" role="alert" style={{ margin: 0 }}>
            {quote.blocked}
          </p>
        )}
        {quote?.allowed && (
          <>
            <div className={charge ? "pt-hold" : "pt-note"} data-testid="change-quote">
              <b>
                {charge
                  ? quote.halfDays
                    ? "Uses half a shoot day"
                    : `Late ${kind === "cancel" ? "cancellation" : "reschedule"} fee: ${aed(quote.fee)}`
                  : kind === "cancel"
                    ? "Free cancellation"
                    : "Free reschedule"}
              </b>
              <span>{quote.summary}</span>
            </div>
            {kind === "cancel" && (quote.paid > 0 || quote.refund > 0) && (
              <ul className="pt-lines" aria-label="Refund">
                <li>
                  <span>Paid</span>
                  <span className="pt-mono">{aed(quote.paid)}</span>
                </li>
                {quote.fee > 0 && (
                  <li>
                    <span>Fee</span>
                    <span className="pt-mono">− {aed(Math.min(quote.fee, quote.paid))}</span>
                  </li>
                )}
                <li className="pt-lines-total">
                  <b>Refund</b>
                  <b className="pt-mono">{aed(quote.refund)}</b>
                </li>
              </ul>
            )}
            {kind === "reschedule" && (
              <>
                <WhenPicker
                  date={date}
                  time={time}
                  min={dubaiToday()}
                  onDate={setDate}
                  onTime={setTime}
                  dateLabel="New date"
                />
                <span className="pt-meta">We confirm the new time before it’s booked in.</span>
              </>
            )}
          </>
        )}
        {err && (
          <p className="pt-error" role="alert">
            {err}
          </p>
        )}
        <div className="pt-btns">
          <button type="button" className="btn btn-g btn-s" onClick={onClose}>
            {kind === "cancel" ? `Keep the ${noun}` : "Back"}
          </button>
          {quote?.allowed && (
            <button
              type="button"
              className={`btn btn-s ${kind === "cancel" ? "btn-danger" : "btn-p"}`}
              disabled={pending || (kind === "reschedule" && (!date || !time))}
              onClick={() =>
                start(async () => {
                  setErr("");
                  const slot =
                    slot0 === "full_day" ? "full_day" : time < "13:00" ? "morning" : "afternoon";
                  const r = await applyMyChange(
                    projectId,
                    kind,
                    kind === "reschedule" ? { date, startTime: time, slot } : undefined,
                  );
                  if (!r.ok) return setErr(r.error ?? "Couldn’t save. Try again.");
                  onClose();
                  router.refresh();
                })
              }
            >
              {pending
                ? "Saving…"
                : kind === "cancel"
                  ? charge
                    ? `Cancel · ${quote.halfDays ? "use a half-day" : `fee ${aed(quote.fee)}`}`
                    : `Cancel ${noun}`
                  : charge
                    ? `Reschedule · ${quote.halfDays ? "half-day" : aed(quote.fee)}`
                    : "Reschedule"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
