"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelBooking } from "@/lib/portal/book-actions";
import type { RequestConfig } from "@/lib/portal/requests";
import Link from "next/link";
import type { BookingEdit } from "./BookingFlow";
import { ChoiceDialog } from "./forms";

/**
 * Change a shoot before it happens (owner, 10 Oct 2026). Requested: "Edit details" and "Cancel
 * request". Confirmed: "Request a change" (back to Requested; Milkywayy confirms it again) and
 * "Cancel shoot". Nothing once it's shot. Every change is in Activity and emailed to Milkywayy.
 */
export function ShootChanges({ edit }: { cfg?: RequestConfig; edit: BookingEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState<"cancel" | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const confirmed = edit.status === "confirmed";
  return (
    <div className="pt-btns" data-testid="shoot-changes">
      {/* The Book media page, at the Summary (owner, 18 Oct 2026). */}
      <Link href={`/portal/book?edit=${encodeURIComponent(edit.ref)}`} className="btn btn-g btn-s">
        {confirmed ? "Request a change" : "Edit details"}
      </Link>
      <button type="button" className="btn btn-g btn-s" onClick={() => setOpen("cancel")}>
        {confirmed ? "Cancel shoot" : "Cancel request"}
      </button>
      {err && (
        <p className="pt-error" role="alert" style={{ width: "100%" }}>
          {err}
        </p>
      )}
      {open === "cancel" && (
        <ChoiceDialog
          title={confirmed ? "Cancel this shoot?" : "Cancel this request?"}
          body={`${edit.ref} will be cancelled and we’ll be told straight away.`}
          choices={[
            {
              label: pending ? "Cancelling…" : confirmed ? "Cancel shoot" : "Cancel request",
              danger: true,
              onClick: () =>
                start(async () => {
                  const r = await cancelBooking(edit.projectId);
                  setOpen(null);
                  if (!r.ok) return setErr(r.error ?? "Couldn’t cancel. Try again.");
                  router.refresh();
                }),
            },
            { label: "Keep it", onClick: () => setOpen(null) },
          ]}
          onDismiss={() => setOpen(null)}
        />
      )}
    </div>
  );
}
