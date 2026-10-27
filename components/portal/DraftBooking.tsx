"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discardDraft } from "@/lib/portal/pay-actions";
import { ChoiceDialog } from "./forms";

/**
 * An unpaid 100% / 50% upfront booking (owner, 27 Oct 2026): a draft only its booker sees. Milkywayy
 * hears about it once it's paid (or a bank receipt is uploaded); unpaid it expires after 7 days.
 */
export function DraftBooking({
  projectId,
  payHref,
  expires,
}: {
  projectId: string;
  payHref: string | null;
  expires: string | null;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const discard = () =>
    start(async () => {
      setAsk(false);
      const r = await discardDraft(projectId);
      if (!r.ok) return setErr(r.error ?? "Couldn’t discard it.");
      router.push("/portal/shoots");
    });
  return (
    <div className="pt-card pt-draft" role="status" data-testid="draft-booking">
      <b>Draft · payment pending</b>
      <span className="pt-meta">
        Your request is sent to Milkywayy once it’s paid.
        {expires ? ` Unpaid, this draft is removed on ${expires}.` : ""}
      </span>
      {err && <span className="pt-err">{err}</span>}
      <div className="pt-btns">
        {payHref && (
          <Link href={payHref} className="btn btn-p btn-s">
            Resume payment
          </Link>
        )}
        <button
          type="button"
          className="btn btn-g btn-s"
          disabled={pending}
          onClick={() => setAsk(true)}
        >
          Discard
        </button>
      </div>
      {ask && (
        <ChoiceDialog
          title="Discard this booking?"
          body="The draft and its unpaid invoice are removed. Nothing has been charged."
          onDismiss={() => setAsk(false)}
          choices={[
            { label: "Keep it", onClick: () => setAsk(false) },
            { label: "Discard", onClick: discard, danger: true },
          ]}
        />
      )}
    </div>
  );
}
