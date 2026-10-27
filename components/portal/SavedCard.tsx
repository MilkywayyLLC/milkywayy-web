"use client";

import { useCallback, useState, useTransition } from "react";
import { removeCard, setAutopay, startCardSetup } from "@/lib/portal/pay-actions";
import { StripeEmbed } from "./StripeEmbed";
import { Sheet } from "./ui";

export type PaymentOptions = {
  bank_transfer: boolean;
  card: { brand: string; last4: string; exp: string } | null;
  autopay: boolean;
  failed: { number: string; error: string }[] | null;
};

const BRAND: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  unionpay: "UnionPay",
  jcb: "JCB",
  diners: "Diners",
};

/**
 * Billing → Saved card (phase 1, 27 Oct 2026): save a card (Stripe, on our page), replace or remove it,
 * and opt in to "Pay invoices automatically with this card" (month-end invoices, charged when due).
 */
export function SavedCard({ opts, saved }: { opts: PaymentOptions; saved?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(saved ? "Card saved." : "");
  const [pending, start] = useTransition();
  const begin = useCallback(() => startCardSetup(), []);
  const c = opts.card;
  return (
    <section className="pt-card pt-savedcard" aria-labelledby="card-h" data-testid="saved-card">
      <div className="pt-row">
        <h2 id="card-h" className="pt-h2">
          Saved card
        </h2>
        {c && (
          <button
            type="button"
            className="pt-link-btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeCard();
                setMsg(r.ok ? (r.notice ?? "") : (r.error ?? ""));
              })
            }
          >
            Remove
          </button>
        )}
      </div>
      {c ? (
        <div className="pt-cardrow">
          <span className="pt-cardchip" aria-hidden="true">
            {(BRAND[c.brand] ?? c.brand).slice(0, 4).toUpperCase()}
          </span>
          <span>
            <b>
              {BRAND[c.brand] ?? c.brand} •••• {c.last4}
            </b>
            <span className="pt-meta"> · expires {c.exp}</span>
          </span>
          <button
            type="button"
            className="btn btn-g btn-s pt-btn-sm"
            onClick={() => setAdding(true)}
          >
            Replace
          </button>
        </div>
      ) : (
        <div className="pt-cardrow">
          <span className="pt-meta">
            Save a card to pay invoices in one tap. Card details stay with Stripe; we never see
            them.
          </span>
          <button
            type="button"
            className="btn btn-p btn-s pt-btn-sm"
            onClick={() => setAdding(true)}
          >
            Save a card
          </button>
        </div>
      )}
      <label className={`pt-check${c ? "" : " is-off"}`}>
        <input
          type="checkbox"
          checked={opts.autopay}
          disabled={!c || pending}
          onChange={(e) =>
            start(async () => {
              const r = await setAutopay(e.target.checked);
              setMsg(r.ok ? (r.notice ?? "") : (r.error ?? ""));
            })
          }
        />
        <span>
          Pay invoices automatically with this card
          <span className="pt-meta"> · month-end invoices are charged on their due date</span>
        </span>
      </label>
      {opts.failed?.length ? (
        <p className="pt-error" role="alert">
          Automatic payment didn’t go through for {opts.failed.map((f) => f.number).join(", ")}:{" "}
          {opts.failed[0].error}. Pay it below or replace the card.
        </p>
      ) : null}
      {msg && (
        <span className="pt-meta" role="status">
          {msg}
        </span>
      )}
      {adding && (
        <Sheet title={c ? "Replace card" : "Save a card"} onClose={() => setAdding(false)}>
          <StripeEmbed start={begin} label="Card form" />
        </Sheet>
      )}
    </section>
  );
}
