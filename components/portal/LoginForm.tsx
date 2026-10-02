"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  forgotPassword,
  sendEmailCode,
  signIn,
  verifyEmailCode,
  type AuthState,
} from "@/lib/portal/actions";

/** Seconds before "Send a new code" appears (Supabase also spaces emails to one address). */
const RESEND_AFTER = 30;

/**
 * Email sign-in (owner, 3 Oct 2026): a 6-digit code by email is the main way in and creates the
 * account the first time; a password is optional ("Sign in with a password instead").
 */
export function LoginForm({ next, startOn }: { next: string; startOn: "code" | "password" }) {
  const [mode, setMode] = useState(startOn);
  const [email, setEmail] = useState("");
  return mode === "code" ? (
    <CodeSignIn next={next} email={email} setEmail={setEmail} usePassword={() => setMode("password")} />
  ) : (
    <PasswordSignIn next={next} email={email} setEmail={setEmail} useCode={() => setMode("code")} />
  );
}

type Shared = { next: string; email: string; setEmail: (e: string) => void };

function EmailField({ email, setEmail, invalid }: { email: string; setEmail: (e: string) => void; invalid?: boolean }) {
  return (
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
        aria-invalid={invalid || undefined}
      />
    </label>
  );
}

function Message({ state }: { state: AuthState }) {
  if (state?.error)
    return (
      <p className="pt-error" role="alert">
        {state.error}
      </p>
    );
  if (state?.notice)
    return (
      <p className="pt-note" role="status">
        {state.notice}
      </p>
    );
  return null;
}

function CodeSignIn({ next, email, setEmail, usePassword }: Shared & { usePassword: () => void }) {
  const [sent, send, sending] = useActionState(sendEmailCode, undefined);
  const [checked, verify, verifying] = useActionState(verifyEmailCode, undefined);
  const [editing, setEditing] = useState(false);
  const [left, setLeft] = useState(RESEND_AFTER);
  const codeInput = useRef<HTMLInputElement>(null);
  const onCode = !!sent?.code && !editing;
  const sentAt = sent?.sentAt;

  useEffect(() => {
    if (!onCode || !sentAt) return;
    codeInput.current?.focus();
    const tick = () => setLeft(Math.max(0, RESEND_AFTER - Math.floor((Date.now() - sentAt) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [onCode, sentAt]);

  if (!onCode)
    return (
      <div className="pt-form">
        <form
          action={(f) => {
            setEditing(false);
            return send(f);
          }}
          className="pt-form"
          noValidate
        >
          <EmailField email={email} setEmail={setEmail} invalid={sent?.field === "email"} />
          {sent?.error && (
            <p className="pt-error" role="alert">
              {sent.error}
            </p>
          )}
          <button type="submit" className="btn btn-p" disabled={sending}>
            {sending ? "Sending…" : "Email me a sign-in code"}
          </button>
        </form>
        <button type="button" className="lnk pt-small" style={{ justifySelf: "start" }} onClick={usePassword}>
          Sign in with a password instead
        </button>
      </div>
    );

  // Whichever answered last: a new code clears an old "wrong code", and the other way round.
  const latest: AuthState = checked && !sending ? checked : sent;
  return (
    <div className="pt-form">
      <p style={{ margin: 0 }}>
        We sent a sign-in code to <b>{sent!.email}</b>. Enter it below.{" "}
        <button type="button" className="lnk" onClick={() => setEditing(true)}>
          Use a different email
        </button>
      </p>
      <form action={verify} className="pt-form" noValidate>
        <input type="hidden" name="email" value={sent!.email} />
        <input type="hidden" name="next" value={next} />
        <label className="pt-field">
          Code
          <input
            ref={codeInput}
            className="pt-code"
            type="text"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            aria-invalid={latest === checked && checked?.field === "password" ? true : undefined}
          />
        </label>
        {!verifying && <Message state={latest} />}
        <button type="submit" className="btn btn-p" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </button>
      </form>
      <div className="pt-small pt-muted">
        {left > 0 ? (
          <span aria-live="polite">
            No email? Check spam, or ask for a new code in 0:{String(left).padStart(2, "0")}.
          </span>
        ) : (
          <form action={send}>
            <input type="hidden" name="email" value={sent!.email} />
            <button type="submit" className="lnk" disabled={sending}>
              {sending ? "Sending…" : "Send a new code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PasswordSignIn({ next, email, setEmail, useCode }: Shared & { useCode: () => void }) {
  const [inState, signInAction, signingIn] = useActionState(signIn, undefined);
  const [fpState, forgot, forgetting] = useActionState(forgotPassword, undefined);
  const [last, setLast] = useState<"in" | "fp">("in");
  const state = last === "in" ? inState : fpState;
  return (
    <div className="pt-form">
      <form action={signInAction} onSubmit={() => setLast("in")} className="pt-form" noValidate>
        <input type="hidden" name="next" value={next} />
        <EmailField email={email} setEmail={setEmail} invalid={state?.field === "email"} />
        <label className="pt-field">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={state?.field === "password" || undefined}
          />
        </label>
        <Message state={state} />
        <button type="submit" className="btn btn-p" disabled={signingIn || forgetting}>
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <form action={forgot} onSubmit={() => setLast("fp")}>
          <input type="hidden" name="email" value={email} />
          <button type="submit" className="lnk pt-small" disabled={signingIn || forgetting}>
            {forgetting ? "Sending…" : "Forgot password?"}
          </button>
        </form>
        <button type="button" className="lnk pt-small" onClick={useCode}>
          Sign in with a code instead
        </button>
      </div>
    </div>
  );
}
