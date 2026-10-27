"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { sendToCompany, startPayment } from "@/lib/portal/pay-actions";
import { Icon } from "./Icon";
import { StripeEmbed } from "./StripeEmbed";
import { ThankYou } from "./BookFrame";

/**
 * The pay page's right side (phase 1, 27 Oct 2026). Owners and billing people: Stripe straight away.
 * A teammate without billing access chooses "Pay myself" (their own card) or "Send to company for
 * payment" (owner/admins are emailed; the booking waits as "Awaiting company payment").
 */
export function PayChoice({
  invoiceId,
  projectId,
  teammate,
  bank,
  back,
  number,
}: {
  invoiceId: string;
  projectId: string | null;
  teammate: boolean;
  bank: boolean;
  back: string;
  number: string;
}) {
  const [mode, setMode] = useState<"choose" | "card" | "sent">(teammate ? "choose" : "card");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const begin = useCallback(() => startPayment(invoiceId), [invoiceId]);

  if (mode === "sent")
    return (
      <ThankYou
        idLabel="Invoice"
        id={number}
        heading="Sent to your company for payment"
        text="Your account owner and admins have it by email and in Billing. The booking waits as “Awaiting company payment”; once it’s paid we review the date and time and email you."
      >
        <Link href={back} className="btn btn-p btn-s">
          Track booking
        </Link>
      </ThankYou>
    );

  if (mode === "choose")
    return (
      <div className="pt-paychoice" role="group" aria-label="How to pay">
        <h2 className="pt-h2">How would you like to pay?</h2>
        <button type="button" className="pt-choice-card" onClick={() => setMode("card")}>
          <Icon name="card" size={20} />
          <span>
            <b>Pay myself</b>
            <span className="pt-meta">Use your own card now.</span>
          </span>
        </button>
        <button
          type="button"
          className="pt-choice-card"
          disabled={pending || !projectId}
          onClick={() =>
            start(async () => {
              const r = await sendToCompany(projectId!);
              if (r.ok) setMode("sent");
              else setErr(r.error ?? "Couldn’t send it.");
            })
          }
        >
          <Icon name="building" size={20} />
          <span>
            <b>{pending ? "Sending…" : "Send to company for payment"}</b>
            <span className="pt-meta">Your owner and admins get it by email and in Billing.</span>
          </span>
        </button>
        {err && (
          <p className="pt-error" role="alert">
            {err}
          </p>
        )}
      </div>
    );

  return (
    <>
      <StripeEmbed start={begin} />
      {teammate && (
        <button type="button" className="pt-link-btn pt-meta" onClick={() => setMode("choose")}>
          ← Other ways to pay
        </button>
      )}
      {bank && (
        <p className="pt-meta" style={{ margin: 0 }}>
          Prefer bank transfer? Pay to our account and upload the receipt on{" "}
          <Link href={back}>
            {back.startsWith("/portal/billing") ? "Billing" : "the booking page"}
          </Link>
          .
        </p>
      )}
    </>
  );
}
