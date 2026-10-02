"use client";

import { useActionState, useState } from "react";
import { createAccount } from "@/lib/portal/actions";
import { INDUSTRIES, SERVICES } from "@/lib/portal/options";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createAccount, undefined);
  const [type, setType] = useState<"individual" | "company" | "">("");
  const [industry, setIndustry] = useState("");
  const err = (k: string) =>
    state?.errors?.[k] ? (
      <span className="pt-field-error" id={`${k}-error`}>
        {state.errors[k]}
      </span>
    ) : null;
  const inv = (k: string) =>
    state?.errors?.[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {};

  return (
    <form action={action} className="pt-form" noValidate>
      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>
          1. Are you booking as an individual or a company?
        </legend>
        <div className="pt-choice two">
          <label>
            <input
              type="radio"
              name="type"
              value="individual"
              checked={type === "individual"}
              onChange={() => setType("individual")}
            />
            Individual
            <small>Just me</small>
          </label>
          <label>
            <input
              type="radio"
              name="type"
              value="company"
              checked={type === "company"}
              onChange={() => setType("company")}
            />
            Company
            <small>A brokerage, agency or brand, with a team</small>
          </label>
        </div>
        {err("type")}
      </fieldset>

      {type && (
        <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 6 }}>
            2. {type === "company" ? "About the company" : "Your name"}
          </legend>
          <div className="pt-form" style={{ gap: 10 }}>
            <label className="pt-field">
              Your name
              <input
                type="text"
                name="fullName"
                autoComplete="name"
                required
                {...inv("fullName")}
              />
              {err("fullName")}
            </label>
            {type === "company" && (
              <>
                <label className="pt-field">
                  Company name
                  <input
                    type="text"
                    name="company"
                    autoComplete="organization"
                    required
                    {...inv("company")}
                  />
                  {err("company")}
                </label>
                <label className="pt-field">
                  What the company does
                  <select
                    name="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    required
                    {...inv("industry")}
                  >
                    <option value="" disabled>
                      Choose one
                    </option>
                    {INDUSTRIES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {err("industry")}
                </label>
                {industry === "other" && (
                  <label className="pt-field">
                    Tell us what you do
                    <input type="text" name="industryOther" required {...inv("industryOther")} />
                    {err("industryOther")}
                  </label>
                )}
                <label className="pt-field">
                  Roughly how much do you need a month? (optional)
                  <input type="text" name="volume" placeholder="e.g. 6 shoots, 20 reels" />
                </label>
              </>
            )}
          </div>
        </fieldset>
      )}

      {type && (
        <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 6 }}>3. What are you here for? (pick any)</legend>
          <div className="pt-choice two">
            {SERVICES.map(([k, l, sub]) => (
              <label key={k}>
                <input type="checkbox" name="services" value={k} />
                {l}
                <small>{sub}</small>
              </label>
            ))}
          </div>
          {err("services")}
        </fieldset>
      )}

      {state?.error && (
        <p className="pt-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-p" disabled={!type || pending}>
        {pending ? "Setting up…" : "Go to my portal"}
      </button>
    </form>
  );
}
