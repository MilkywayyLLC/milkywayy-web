"use client";

import { useState, type FormEvent } from "react";
import { Field, Option, OptionGroup } from "@/components/ui/Field";

const USES = ["Real estate", "Clinic", "Personal brand", "Other"] as const;

/** AI avatars demo form UI (guide §9.2). "Other" reveals a required text field. Submission: Phase 6. */
export function DemoForm() {
  const [use, setUse] = useState<(typeof USES)[number]>("Real estate");
  const onSubmit = (e: FormEvent) => e.preventDefault(); // Phase 6

  return (
    <form className="form" noValidate onSubmit={onSubmit} aria-label="Book a demo">
      <div className="row2">
        <Field label="Name">
          <input name="name" autoComplete="name" required />
        </Field>
        <Field label="Company">
          <input name="company" autoComplete="organization" />
        </Field>
      </div>
      <div className="row2">
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" autoComplete="tel" placeholder="+971" />
        </Field>
      </div>
      <OptionGroup legend="What's it for?">
        {USES.map((u) => (
          <Option
            key={u}
            name="use"
            value={u}
            label={u}
            checked={use === u}
            onChange={() => setUse(u)}
          />
        ))}
      </OptionGroup>
      {use === "Other" && (
        <Field label="Tell us what it's for">
          <input
            name="use_other"
            required
            autoFocus
            placeholder="e.g. a hotel concierge avatar for our website"
          />
        </Field>
      )}
      <OptionGroup legend="How should we reply?">
        <Option name="pref" value="Call" label="Book a call" defaultChecked />
        <Option name="pref" value="WhatsApp" label="WhatsApp" />
        <Option name="pref" value="Email" label="Email" />
      </OptionGroup>
      <button className="btn btn-p" type="submit">
        Book my demo
      </button>
    </form>
  );
}
