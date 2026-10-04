"use client";

import { useActionState, useState } from "react";
import { createClientAccount } from "@/lib/portal/admin-actions";
import { INDUSTRIES, SERVICES } from "@/lib/portal/options";

/** Create a client by hand (§7.1): the account, plus an Owner invite for its contact person. */
export function ClientCreateForm() {
  const [state, create, pending] = useActionState(createClientAccount, undefined);
  const [type, setType] = useState<"company" | "individual">("company");
  const [industry, setIndustry] = useState("");
  return (
    <form action={create} className="ad-card ad-form" noValidate>
      <fieldset className="ad-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Client type</legend>
        <div className="ad-checks">
          {(["company", "individual"] as const).map((t) => (
            <label key={t} className="ad-check">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
              />
              {t === "company" ? "Company" : "Individual"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ad-field">
        <label htmlFor="c-name">{type === "company" ? "Company name" : "Name"}</label>
        <input id="c-name" name="name" required maxLength={120} />
      </div>
      {type === "company" && (
        <div className="ad-field">
          <label htmlFor="c-industry">What they do</label>
          <select
            id="c-industry"
            name="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">Choose one</option>
            {INDUSTRIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}
      {type === "company" && industry === "other" && (
        <div className="ad-field">
          <label htmlFor="c-other">Industry</label>
          <input id="c-other" name="industry_other" maxLength={120} />
        </div>
      )}
      <div className="ad-field">
        <label htmlFor="c-currency">Billing currency</label>
        <select id="c-currency" name="currency" defaultValue="AED">
          <option value="AED">AED (UAE clients)</option>
          <option value="USD">USD (overseas clients)</option>
        </select>
      </div>
      <fieldset className="ad-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Services (sets their portal tabs)</legend>
        <div className="ad-checks">
          {SERVICES.map(([k, l]) => (
            <label key={k} className="ad-check">
              <input type="checkbox" name="services" value={k} defaultChecked={k === "shoots"} />{" "}
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <h2 className="ad-h2">Who gets the Owner invite</h2>
      {type === "company" && (
        <div className="ad-field">
          <label htmlFor="c-contact">Contact name</label>
          <input id="c-contact" name="contact_name" maxLength={120} />
        </div>
      )}
      <div className="ad-field">
        <label htmlFor="c-phone">WhatsApp number</label>
        <input
          id="c-phone"
          name="phone"
          type="tel"
          placeholder="050 123 4567, or +44 … for other countries"
        />
      </div>
      <div className="ad-field">
        <label htmlFor="c-email">Email</label>
        <input id="c-email" name="email" type="email" autoCapitalize="none" />
        <span className="ad-help">
          Either is enough. They join as Owner the first time they sign in with it.
        </span>
      </div>
      <label className="ad-check">
        <input type="checkbox" name="email_invite" defaultChecked />
        Email the contact “Your Milkywayy portal is ready” with a sign-in link
      </label>
      {state?.error && (
        <p className="ad-status error" role="alert">
          {state.error}
        </p>
      )}
      <div className="ad-btns">
        <button type="submit" className="ad-btn" disabled={pending}>
          {pending ? "Creating…" : "Create client"}
        </button>
      </div>
    </form>
  );
}
