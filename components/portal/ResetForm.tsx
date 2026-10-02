"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/portal/actions";

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="pt-form">
      <label className="pt-field">
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={!!state?.error || undefined}
        />
        <small className="pt-muted" style={{ fontWeight: 400 }}>
          At least 8 characters.
        </small>
      </label>
      {state?.error && (
        <p className="pt-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-p" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
