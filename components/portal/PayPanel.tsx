"use client";

import { useCallback, useState, useTransition } from "react";
import { startProofUpload, submitProofs } from "@/lib/portal/billing-actions";
import { startBatchPayment, startPayment } from "@/lib/portal/pay-actions";
import { putBlob } from "@/lib/upload-browser";
import { SingleFile } from "./Dropzone";
import { Icon } from "./Icon";
import { StripeEmbed } from "./StripeEmbed";

export type PayBank = {
  account_name: string | null;
  bank: string | null;
  iban: string | null;
  swift: string | null;
} | null;

/**
 * How to pay (owner, 2 Nov 2026): one panel per invoice (and for "Pay all"), two clearly labelled
 * choices side by side, stacked on a phone. Card goes to Stripe; bank transfer opens our details
 * (from Business & billing; empty fields are left out), each with a copy button, the invoice number as
 * the reference, then "Upload receipt" + "I've paid". Payment options per client can leave one out.
 */
export function PayPanel({
  ids,
  numbers,
  amount,
  options,
  cardReady,
  bank,
  wio,
  target,
  state,
  rejected,
  onBack,
}: {
  /** The invoices this pays (a receipt is recorded on each). */
  ids: string[];
  /** Their numbers: the transfer reference. */
  numbers: string[];
  /** "AED 900.00" */
  amount: string;
  options: "both" | "card" | "bank";
  /** Stripe is switched on for this deployment. */
  cardReady: boolean;
  bank: PayBank;
  wio?: string | null;
  /** What Stripe is opened for: one invoice, or a "Pay all" batch. */
  target: { kind: "invoice" | "batch"; id: string };
  /** A receipt is already in, waiting for us. */
  state?: "submitted" | null;
  rejected?: string | null;
  onBack?: () => void;
}) {
  const card = options !== "bank" && cardReady;
  const transfer = options !== "card";
  const [mode, setMode] = useState<"choose" | "card">("choose");
  const [bankOpen, setBankOpen] = useState(options === "bank");
  const [done, setDone] = useState(false);
  const start = useCallback(
    () => (target.kind === "batch" ? startBatchPayment(target.id) : startPayment(target.id)),
    [target.kind, target.id],
  );

  if (state === "submitted" || done)
    return (
      <div className="pt-paypanel" data-testid="pay-submitted">
        <p className="pt-note" role="status" style={{ margin: 0 }}>
          <b>Payment submitted</b>
          <br />
          Thanks — we’ll confirm your payment shortly.
        </p>
      </div>
    );

  if (mode === "card")
    return (
      <div className="pt-paypanel">
        <StripeEmbed start={start} />
        <button
          type="button"
          className="pt-link-btn pt-meta"
          onClick={() => {
            setMode("choose");
            onBack?.();
          }}
        >
          ← Other ways to pay
        </button>
      </div>
    );

  return (
    <div className="pt-paypanel" data-testid="pay-panel">
      {rejected && (
        <p className="pt-meta pt-warn-text" role="alert" style={{ margin: 0 }}>
          We couldn’t confirm your transfer: {rejected}. Upload the receipt again.
        </p>
      )}
      <p className="pt-meta" style={{ margin: 0 }}>
        {card && transfer
          ? "Pay instantly by card, or by bank transfer with no fees."
          : card
            ? "Pay instantly by card."
            : "Pay by bank transfer — no card fees."}
      </p>
      {!card && options === "card" && (
        <p className="pt-meta" role="status" style={{ margin: 0 }}>
          Card payments aren’t switched on yet. Please contact us to arrange payment.
        </p>
      )}
      <div className="pt-paychoices" data-n={(card ? 1 : 0) + (transfer ? 1 : 0)}>
        {card && (
          <section className="pt-paychoice-card" aria-label="Pay by card">
            <div className="pt-paychoice-head">
              <Icon name="card" size={20} />
              <span>
                <b>Pay by card</b>
                <span className="pt-meta">Card, Apple Pay, Google Pay</span>
              </span>
            </div>
            <button type="button" className="btn btn-p" onClick={() => setMode("card")}>
              Pay {amount}
            </button>
          </section>
        )}
        {transfer && (
          <section className="pt-paychoice-card" aria-label="Pay by bank transfer">
            <button
              type="button"
              className="pt-paychoice-head pt-paychoice-toggle"
              aria-expanded={bankOpen}
              onClick={() => setBankOpen((o) => !o)}
            >
              <Icon name="building" size={20} />
              <span>
                <b>Pay by bank transfer — no card fees</b>
                <span className="pt-meta">{bankOpen ? "Hide details" : "Show our bank details"}</span>
              </span>
            </button>
            {bankOpen && (
              <BankTransfer ids={ids} numbers={numbers} bank={bank} wio={wio} onDone={() => setDone(true)} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Copy({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="pt-copy"
      aria-label={`Copy ${label}`}
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* clipboard blocked: the value is still on screen */
        }
      }}
    >
      {ok ? "Copied" : "Copy"}
    </button>
  );
}

function BankTransfer({
  ids,
  numbers,
  bank,
  wio,
  onDone,
}: {
  ids: string[];
  numbers: string[];
  bank: PayBank;
  wio?: string | null;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, run] = useTransition();
  const reference = numbers.filter(Boolean).join(", ");
  const rows: [string, string | null | undefined, boolean][] = [
    ["Bank", bank?.bank, false],
    ["Account name", bank?.account_name, false],
    ["IBAN", bank?.iban, true],
    ["SWIFT/BIC", bank?.swift, true],
    ["Reference", reference, true],
  ];
  const shown = rows.filter(([, v]) => !!v && String(v).trim());
  return (
    <div className="pt-bank-open" data-testid="bank">
      {bank ? (
        <dl className="pt-bank-dl">
          {shown.map(([label, value, mono]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={mono ? "pt-mono" : undefined}>{value}</dd>
              <Copy value={String(value)} label={label} />
            </div>
          ))}
        </dl>
      ) : (
        <p className="pt-meta" style={{ margin: 0 }}>
          Our bank details aren’t available here yet. Please contact us and we’ll send them.
        </p>
      )}
      {wio && (
        <span className="pt-meta">
          Or pay with Wio:{" "}
          <a href={wio} target="_blank" rel="noopener noreferrer">
            open the payment link ↗
          </a>
        </span>
      )}
      <form
        className="pt-form"
        aria-label="Payment receipt"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return setMsg("Upload the transfer receipt first.");
          run(async () => {
            const type = file.type || "application/pdf";
            const up = await startProofUpload(ids[0], file.name, file.size, type);
            if (!up.ok || !up.url || !up.key) return setMsg(up.error ?? "Couldn’t upload.");
            if (!(await putBlob(up.url, file))) return setMsg("Upload failed. Try again.");
            const r = await submitProofs(
              ids,
              { key: up.key, name: file.name, size: file.size, type },
              note.trim(),
            );
            if (r.ok) onDone();
            else setMsg(r.error ?? "Couldn’t send.");
          });
        }}
      >
        <SingleFile
          label="Upload receipt"
          file={file}
          onFile={setFile}
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          types="PDF, JPG, PNG or HEIC"
          maxMb={10}
          noun="the receipt"
        />
        <label className="pt-field">
          Note (optional)
          <input
            type="text"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Paid from Harbourline Properties LLC"
          />
        </label>
        <span className="pt-meta" role="status">
          {pending ? "Sending…" : msg}
        </span>
        <button type="submit" className="btn btn-p" disabled={pending}>
          I’ve paid
        </button>
      </form>
    </div>
  );
}
