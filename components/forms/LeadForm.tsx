"use client";

import type { FormEvent } from "react";
import { Field, Option, OptionGroup } from "@/components/ui/Field";

export type LeadService = "production" | "post-production" | "ai-avatars";

const SERVICES: { value: LeadService; label: string; sub: string }[] = [
  { value: "production", label: "Production", sub: "UAE shoots and packages" },
  { value: "post-production", label: "Post-production", sub: "Editing, anywhere" },
  { value: "ai-avatars", label: "AI avatars", sub: "Custom presenter" },
];

/**
 * LeadForm UI (guide §9.1): Production and Contact. `showServices` adds the service cards used on
 * Contact. Validation, /api/lead and the WhatsApp / email / calendar hand-off arrive in Phase 6.
 */
export function LeadForm({
  service = "production",
  showServices,
  briefLabel = "What do you need?",
  briefPlaceholder,
}: {
  service?: LeadService;
  showServices?: boolean;
  briefLabel?: string;
  briefPlaceholder?: string;
}) {
  const onSubmit = (e: FormEvent) => e.preventDefault(); // Phase 6

  return (
    <form className="form" noValidate onSubmit={onSubmit} aria-label="Send a request">
      {showServices && (
        <OptionGroup legend="Which service?" cards>
          {SERVICES.map((s) => (
            <Option
              key={s.value}
              name="service"
              value={s.value}
              label={s.label}
              sub={s.sub}
              defaultChecked={s.value === service}
            />
          ))}
        </OptionGroup>
      )}
      {!showServices && <input type="hidden" name="service" value={service} />}
      <div className="row2">
        <Field label="Name">
          <input name="name" autoComplete="name" required />
        </Field>
        <Field label="Company">
          <input name="company" autoComplete="organization" />
        </Field>
      </div>
      <div className="row2">
        <Field label="Phone">
          <input name="phone" type="tel" autoComplete="tel" placeholder="+971" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" />
        </Field>
      </div>
      <Field label={briefLabel}>
        <textarea name="brief" placeholder={briefPlaceholder} />
      </Field>
      <OptionGroup legend="How should we reply?">
        <Option name="pref" value="WhatsApp" label="WhatsApp" defaultChecked />
        <Option name="pref" value="Email" label="Email" />
        <Option name="pref" value="Call" label="Call" />
      </OptionGroup>
      <button className="btn btn-p" type="submit">
        Send request
      </button>
      <p className="fine">No payment now. We confirm scope and price first.</p>
    </form>
  );
}

/** On-page confirmation shown after any form saves a lead (guide §9.4). */
export function FormDone({
  title,
  text,
  reference,
}: {
  title: string;
  text: string;
  reference: string;
}) {
  return (
    <div className="done" role="status">
      <b>{title}</b>
      <p className="muted" style={{ margin: 0 }}>
        {text}
      </p>
      <p className="fine">Ref #{reference}</p>
    </div>
  );
}
