"use client";

import { useActionState, useState } from "react";
import {
  saveCompany,
  saveNotifications,
  saveProfile,
  type Result,
} from "@/lib/portal/account-actions";
import type { Account } from "@/lib/portal/auth";
import { INDUSTRIES, NOTIFY_EVENTS, prefOf, type NotifyPrefs } from "@/lib/portal/options";

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

export function NotificationsForm({ prefs, manager }: { prefs: NotifyPrefs; manager: boolean }) {
  const [state, save, saving] = useActionState(saveNotifications, undefined);
  return (
    <form action={save} className="pt-form" style={{ gap: 6 }}>
      <div>
        {NOTIFY_EVENTS.filter((e) => manager || !e[4]).map(([key, label]) => {
          const p = prefOf(prefs, key);
          return (
            <div key={key} className="pt-switch-row">
              <span>{label}</span>
              <span className="pt-toggles">
                <label>
                  <input
                    type="checkbox"
                    name={`${key}.whatsapp`}
                    defaultChecked={p.whatsapp}
                    aria-label={`${label} by WhatsApp`}
                  />{" "}
                  WhatsApp
                </label>
                <label>
                  <input
                    type="checkbox"
                    name={`${key}.email`}
                    defaultChecked={p.email}
                    aria-label={`${label} by email`}
                  />{" "}
                  Email
                </label>
              </span>
            </div>
          );
        })}
      </div>
      <span className="pt-meta">
        Updates come from our notifications number. To chat with us, use the WhatsApp button on
        Home.
      </span>
      <Status state={state} />
      <button
        type="submit"
        className="btn btn-p btn-s"
        style={{ justifySelf: "start" }}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save notifications"}
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
