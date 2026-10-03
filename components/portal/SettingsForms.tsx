"use client";

import { useActionState, useState } from "react";
import {
  saveCompany,
  saveNotifications,
  saveProfile,
  saveRecipients,
  type Result,
} from "@/lib/portal/account-actions";
import { setPassword, type AuthState } from "@/lib/portal/actions";
import type { Account } from "@/lib/portal/auth";
import {
  INDUSTRIES,
  NOTIFY_CATEGORIES,
  NOTIFY_EVENTS,
  wantsEmail,
  type NotifyCc,
  type NotifyPrefs,
} from "@/lib/portal/options";

function Status({ state }: { state: Result | undefined }) {
  if (!state) return null;
  return state.ok ? (
    <p className="pt-note" role="status">
      {state.notice}
    </p>
  ) : (
    <p className="pt-error" role="alert">
      {state.error}
    </p>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const [state, save, saving] = useActionState(saveProfile, undefined);
  return (
    <form action={save} className="pt-form" style={{ gap: 10 }}>
      <label className="pt-field">
        Your name
        <input type="text" name="full_name" defaultValue={name} required autoComplete="name" />
      </label>
      <Status state={state} />
      <button
        type="submit"
        className="btn btn-g btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}

export function NotificationsForm({
  prefs,
  manager,
  email,
}: {
  prefs: NotifyPrefs;
  manager: boolean;
  email: string | null;
}) {
  const [state, save, saving] = useActionState(saveNotifications, undefined);
  return (
    <form action={save} className="pt-form" style={{ gap: 6 }}>
      <span className="pt-meta">
        Emails go to {email ?? "your email"}. Choose which updates you want:
      </span>
      <div>
        {NOTIFY_EVENTS.filter((e) => manager || !e[3]).map(([key, label]) => (
          <label key={key} className="pt-check" style={{ minHeight: 40 }}>
            <input type="checkbox" name={`${key}.email`} defaultChecked={wantsEmail(prefs, key)} />{" "}
            {label}
          </label>
        ))}
      </div>
      <Status state={state} />
      <button
        type="submit"
        className="btn btn-p btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save email settings"}
      </button>
    </form>
  );
}

/** Owner/Admins: extra people who get the account's emails, per category. */
export function RecipientsForm({ cc }: { cc: NotifyCc }) {
  const [state, save, saving] = useActionState(saveRecipients, undefined);
  return (
    <form action={save} className="pt-form" style={{ gap: 10 }}>
      {NOTIFY_CATEGORIES.map(([key, label, sub]) => (
        <label key={key} className="pt-field">
          {label}: also send to
          <input
            type="text"
            name={key}
            defaultValue={(cc[key] ?? []).join(", ")}
            placeholder={key === "billing" ? "accounts@your-company.com" : "name@your-company.com"}
            autoCapitalize="none"
            inputMode="email"
          />
          <small className="pt-muted" style={{ fontWeight: 400 }}>
            {sub}. Separate addresses with commas, up to 5.
          </small>
        </label>
      ))}
      <Status state={state} />
      <button
        type="submit"
        className="btn btn-g btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save recipients"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, save, saving] = useActionState<AuthState, FormData>(setPassword, undefined);
  return (
    <form action={save} className="pt-form" style={{ gap: 10 }} noValidate>
      <label className="pt-field">
        Password (optional)
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          aria-invalid={state?.field === "password" || undefined}
        />
        <small className="pt-muted" style={{ fontWeight: 400 }}>
          Set or change it here. At least 8 characters. You can always sign in with an email code
          instead.
        </small>
      </label>
      {state?.error && (
        <p className="pt-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p className="pt-note" role="status">
          {state.notice}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-g btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

export function CompanyForm({ account }: { account: Account }) {
  const [state, save, saving] = useActionState(saveCompany, undefined);
  const [industry, setIndustry] = useState(account.industry ?? "");
  const company = account.type === "company";
  return (
    <form action={save} className="pt-form" style={{ gap: 10 }}>
      <label className="pt-field">
        {company ? "Company name" : "Name on invoices"}
        <input
          type="text"
          name="name"
          defaultValue={account.name}
          required
          autoComplete="organization"
        />
      </label>
      {company && (
        <>
          <label className="pt-field">
            What the company does
            <select name="industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Choose one</option>
              {INDUSTRIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {industry === "other" && (
            <label className="pt-field">
              Tell us what you do
              <input
                type="text"
                name="industry_other"
                defaultValue={account.industry_other ?? ""}
              />
            </label>
          )}
          <label className="pt-field">
            Roughly how much you need a month
            <input type="text" name="volume_note" defaultValue={account.volume_note ?? ""} />
          </label>
        </>
      )}
      <label className="pt-field">
        TRN (optional)
        <input
          type="text"
          name="trn"
          inputMode="numeric"
          defaultValue={account.trn ?? ""}
          placeholder="15 digits"
        />
      </label>
      <label className="pt-field">
        Billing address (optional)
        <textarea name="billing_address" defaultValue={account.billing_address ?? ""} rows={3} />
      </label>
      <Status state={state} />
      <button
        type="submit"
        className="btn btn-p btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
