"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/admin/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="ad-form">
      <div className="ad-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoCapitalize="none"
        />
      </div>
      <div className="ad-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && (
        <p className="ad-status error" role="alert">
          {state.error}
        </p>
      )}
      <button className="ad-btn" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
