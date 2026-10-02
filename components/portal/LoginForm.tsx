"use client";

import { useActionState, useState } from "react";
import {
  forgotPassword,
  resendConfirmation,
  signIn,
  signUp,
  type AuthState,
} from "@/lib/portal/actions";

type Mode = "signin" | "signup";

/** Email + password sign-in and sign-up. WhatsApp sign-in arrives with Twilio Verify (step 3). */
export function LoginForm({ next, startOn }: { next: string; startOn: Mode }) {
  const [mode, setMode] = useState<Mode>(startOn);
  const [inState, inAction, inPending] = useActionState(signIn, undefined);
  const [upState, upAction, upPending] = useActionState(signUp, undefined);
  const [fpState, fpAction, fpPending] = useActionState(forgotPassword, undefined);
  const [rsState, rsAction, rsPending] = useActionState(resendConfirmation, undefined);
  const [email, setEmail] = useState("");
  const [last, setLast] = useState<"in" | "up" | "fp" | "rs">(startOn === "signup" ? "up" : "in");
  const switchTo = (m: Mode) => {
    setMode(m);
    setLast(m === "signup" ? "up" : "in");
  };

  // The answer from whichever form was submitted last.
  const state: AuthState = { in: inState, up: upState, fp: fpState, rs: rsState }[last];
  const pending = inPending || upPending || fpPending || rsPending;
  const sentConfirm = mode === "signup" && upState?.confirm && !upState.error;

  return (
    <div className="pt-form">
      <div
        className="pt-seg"
        role="group"
        aria-label="Sign in or create an account"
        style={{ width: "100%", gridAutoColumns: "1fr" }}
      >
        <button type="button" aria-pressed={mode === "signin"} onClick={() => switchTo("signin")}>
          I have an account
        </button>
        <button type="button" aria-pressed={mode === "signup"} onClick={() => switchTo("signup")}>
          I’m new
        </button>
      </div>

      {sentConfirm ? (
        <div className="pt-form" role="status">
          <p className="pt-note">
            {last === "rs" ? (rsState?.error ?? rsState?.notice) : upState?.notice}
          </p>
          <form action={rsAction} onSubmit={() => setLast("rs")}>
            <input type="hidden" name="email" value={upState?.email ?? ""} />
            <button type="submit" className="lnk pt-small" disabled={pending}>
              {rsPending ? "Sending…" : "Didn’t get it? Send it again"}
            </button>
          </form>
        </div>
      ) : (
        <form
          action={mode === "signin" ? inAction : upAction}
          onSubmit={() => setLast(mode === "signin" ? "in" : "up")}
          className="pt-form"
          noValidate
        >
          <input type="hidden" name="next" value={next} />
          <label className="pt-field">
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={state?.field === "email" || undefined}
            />
          </label>
          <label className="pt-field">
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
              aria-invalid={state?.field === "password" || undefined}
              aria-describedby={mode === "signup" ? "pw-hint" : undefined}
            />
            {mode === "signup" && (
              <small id="pw-hint" className="pt-muted" style={{ fontWeight: 400 }}>
                At least 8 characters.
              </small>
            )}
          </label>
          {state?.error && (
            <p className="pt-error" role="alert">
              {state.error}
            </p>
          )}
          {state?.notice && !state.error && (
            <p className="pt-note" role="status">
              {state.notice}
            </p>
          )}
          <button type="submit" className="btn btn-p" disabled={pending}>
            {mode === "signin"
              ? inPending
                ? "Signing in…"
                : "Sign in"
              : upPending
                ? "Creating…"
                : "Create account"}
          </button>
        </form>
      )}

      {mode === "signin" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <form action={fpAction} onSubmit={() => setLast("fp")}>
            <input type="hidden" name="email" value={email} />
            <button type="submit" className="lnk pt-small" disabled={pending}>
              {fpPending ? "Sending…" : "Forgot password?"}
            </button>
          </form>
          {inState?.confirm && (
            <form action={rsAction} onSubmit={() => setLast("rs")}>
              <input type="hidden" name="email" value={email} />
              <button type="submit" className="lnk pt-small" disabled={pending}>
                {rsPending ? "Sending…" : "Send the confirmation link again"}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="pt-card" style={{ background: "var(--bg)", padding: 12, gap: 4 }}>
        <b className="pt-small">WhatsApp sign-in is coming</b>
        <span className="pt-meta">
          For now, use your email. Bookings you made on the website with the same email show up once
          it’s confirmed.
        </span>
      </div>
    </div>
  );
}
