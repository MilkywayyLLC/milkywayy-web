"use client";

/* eslint-disable @next/next/no-img-element -- QR code data URL */
import { useActionState, useEffect, useState } from "react";
import { signOut, startEnrollment, verifyCode, type Enrollment } from "@/lib/admin/auth-actions";

/**
 * Owner two-factor. First time: scan the QR code with an authenticator app (Google
 * Authenticator, 1Password, Authy…) and type the code. After that: just the code.
 */
export function TwoFactor({ mode }: { mode: "enroll" | "verify" }) {
  const [state, action, pending] = useActionState(verifyCode, undefined);
  const [setup, setSetup] = useState<Enrollment | null>(null);
  useEffect(() => {
    if (mode === "enroll") startEnrollment().then(setSetup);
  }, [mode]);

  return (
    <div className="ad-form">
      {mode === "enroll" && (
        <>
          <p>
            Two-factor protects prices and leads. Scan this with an authenticator app on your phone
            (Google Authenticator, 1Password, Authy), then type the six-digit code it shows.
          </p>
          {!setup && <p className="ad-muted">Preparing…</p>}
          {setup && "error" in setup && <p className="ad-status error">{setup.error}</p>}
          {setup && "qr" in setup && (
            <>
              <img className="ad-qr" src={setup.qr} alt="QR code for your authenticator app" />
              <details>
                <summary className="ad-small">Can’t scan? Enter this key instead</summary>
                <code
                  className="ad-mono"
                  data-testid="totp-secret"
                  style={{ wordBreak: "break-all" }}
                >
                  {setup.secret}
                </code>
              </details>
            </>
          )}
        </>
      )}
      {mode === "verify" && (
        <p>Open your authenticator app and type the six-digit code for Milkywayy admin.</p>
      )}
      <form action={action} className="ad-form">
        {setup && "factorId" in setup && (
          <input type="hidden" name="factorId" value={setup.factorId} />
        )}
        <div className="ad-field">
          <label htmlFor="code">Six-digit code</label>
          <input
            id="code"
            name="code"
            className="ad-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </div>
        {state?.error && (
          <p className="ad-status error" role="alert">
            {state.error}
          </p>
        )}
        <button
          className="ad-btn"
          type="submit"
          disabled={pending || (mode === "enroll" && !(setup && "factorId" in setup))}
        >
          {pending ? "Checking…" : mode === "enroll" ? "Turn on two-factor" : "Continue"}
        </button>
      </form>
      <form action={signOut}>
        <button className="ad-btn quiet small" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
