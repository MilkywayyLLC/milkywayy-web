"use client";

import { useState, useTransition } from "react";
import { payInvoice, startProofUpload, submitProof } from "@/lib/portal/billing-actions";
import { putBlob } from "@/lib/upload-browser";
import { Sheet } from "./ui";

/** "Pay now": off to Stripe Checkout (card) for accounts that pay online. */
export function PayNow({ id, number }: { id: string; number: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        type="button"
        className="btn btn-p btn-s pt-btn-sm"
        aria-label={`Pay invoice ${number} now`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await payInvoice(id);
            if (r.ok && r.url) window.location.assign(r.url);
            else setErr(r.error);
          })
        }
      >
        {pending ? "Opening…" : "Pay now"}
      </button>
      {err && (
        <span className="pt-error" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}

/** "I've paid" by bank transfer: upload the proof (PDF or photo, 10 MB) with an optional note. */
export function PaidByTransfer({ id, number }: { id: string; number: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-g btn-s pt-btn-sm"
        aria-label={`I've paid invoice ${number}`}
        onClick={() => setOpen(true)}
      >
        I’ve paid
      </button>
      {open && (
        <Sheet title={`I’ve paid ${number}`} onClose={() => setOpen(false)}>
          <form
            className="pt-form"
            aria-label="Payment proof"
            onSubmit={(e) => {
              e.preventDefault();
              if (!file) return setMsg("Choose the transfer receipt.");
              start(async () => {
                const type = file.type || "application/pdf";
                const up = await startProofUpload(id, file.name, file.size, type);
                if (!up.ok || !up.url || !up.key) return setMsg(up.error ?? "Couldn’t upload.");
                if (!(await putBlob(up.url, file))) return setMsg("Upload failed. Try again.");
                const r = await submitProof(
                  id,
                  { key: up.key, name: file.name, size: file.size, type },
                  note.trim(),
                );
                setMsg(r.ok ? (r.notice ?? "Sent.") : (r.error ?? "Couldn’t send."));
                if (r.ok) setTimeout(() => setOpen(false), 1200);
              });
            }}
          >
            <p className="pt-muted" style={{ margin: 0 }}>
              Upload the bank’s transfer receipt (PDF or a screenshot). We’ll check it and confirm
              by email.
            </p>
            <label className="pt-field">
              Transfer receipt (PDF or image, up to 10 MB)
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
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
              Send proof
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
