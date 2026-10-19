"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PhoneField } from "@/components/forms/PhoneField";
import { sendPhoneCode, verifyPhoneCode, type PhoneState } from "@/lib/portal/phone-actions";

/** Seconds before "Resend" and "Send by SMS instead" appear (Supabase also enforces a minimum). */
const RESEND_AFTER = 30;

/** Pretty +971 50 123 4567 for UAE numbers; other countries as +<code> <rest>. */
const pretty = (e164: string) =>
  e164.startsWith("+971") && e164.length === 13
    ? `+971 ${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
    : e164;

export function PhoneLogin({ next }: { next: string }) {
  const [sent, send, sending] = useActionState(sendPhoneCode, undefined);
  const [checked, verify, verifying] = useActionState(verifyPhoneCode, undefined);
  const [editing, setEditing] = useState(false);
  const [left, setLeft] = useState(RESEND_AFTER);
  const codeInput = useRef<HTMLInputElement>(null);

  const onCode = sent?.step === "code" && !editing;
  const sentAt = sent?.sentAt;

  // Countdown from the latest send; focus the code field when it appears.
  useEffect(() => {
    if (!onCode || !sentAt) return;
    codeInput.current?.focus();
    const tick = () =>
      setLeft(Math.max(0, RESEND_AFTER - Math.floor((Date.now() - sentAt) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [onCode, sentAt]);

  if (!onCode)
    return (
      <form
        action={(f) => {
          setEditing(false);
          return send(f);
        }}
        className="pt-form"
        noValidate
      >
        <PhoneField label="Your WhatsApp number" invalid={!!sent?.error} />
        <input type="hidden" name="channel" value="whatsapp" />
        {sent?.error && (
          <p className="pt-error" role="alert">
            {sent.error}
          </p>
        )}
        <button type="submit" className="btn btn-p" disabled={sending}>
          {sending ? "Sending…" : "Send code on WhatsApp"}
        </button>
      </form>
    );

  // Whichever answered last (a resend clears an old "wrong code", and the other way round).
  const state: PhoneState = checked && checked.at > sent.at ? checked : sent;
  const error = sending || verifying ? undefined : state?.error;
  return (
    <div className="pt-form">
      <p style={{ margin: 0 }}>
        Enter the 6-digit code we sent by {sent.channel === "sms" ? "SMS" : "WhatsApp"} to{" "}
        <b>{pretty(sent.phone!)}</b>.{" "}
        <button type="button" className="lnk" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
      <form action={verify} className="pt-form" noValidate>
        <input type="hidden" name="e164" value={sent.phone} />
        <input type="hidden" name="next" value={next} />
        <label className="pt-field">
          Code
          <input
            ref={codeInput}
            className="pt-code"
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            aria-invalid={state === checked && !!checked?.error ? true : undefined}
          />
        </label>
        {error && (
          <p className="pt-error" role="alert">
            {error}
          </p>
        )}
        {!error && state?.notice && (
          <p className="pt-note" role="status">
            {state.notice}
          </p>
        )}
        <button type="submit" className="btn btn-p" disabled={verifying}>
          {verifying ? "Checking…" : "Verify and sign in"}
        </button>
      </form>
      <div className="pt-small pt-muted">
        {left > 0 ? (
          <span aria-live="polite">
            Didn’t get it? You can ask again in 0:{String(left).padStart(2, "0")}.
          </span>
        ) : (
          <form action={send} style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <input type="hidden" name="e164" value={sent.phone} />
            <button
              type="submit"
              name="channel"
              value="whatsapp"
              className="lnk"
              disabled={sending}
            >
              Resend on WhatsApp
            </button>
            <button type="submit" name="channel" value="sms" className="lnk" disabled={sending}>
              Send by SMS instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
