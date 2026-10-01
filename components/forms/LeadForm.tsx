"use client";

import { useState, type FormEvent } from "react";
import { Field, Option, OptionGroup } from "@/components/ui/Field";
import { env } from "@/lib/env";
import { readForm } from "@/lib/leads/client";
import { whatsappLink } from "@/lib/whatsapp";
import { FormDone, FormError } from "./FormDone";
import { Honeypot } from "./Honeypot";
import { PhoneField } from "./PhoneField";
import { useLeadForm } from "./useLeadForm";

export { FormDone } from "./FormDone";

export type LeadService = "production" | "post-production" | "ai-avatars";

const SERVICES: { value: LeadService; label: string; sub: string }[] = [
  { value: "production", label: "Production", sub: "UAE shoots and packages" },
  { value: "post-production", label: "Post-production", sub: "Editing, anywhere" },
  { value: "ai-avatars", label: "AI avatars", sub: "Custom presenter" },
];

/**
 * LeadForm (guide §9.1): Production, and Contact with service cards (`showServices`).
 * Saves the lead, then hands off by the chosen reply: WhatsApp opens with a message that starts
 * with the ref; Email and Call show a confirmation.
 */
export function LeadForm({
  service = "production",
  showServices,
  briefLabel = "What do you need?",
  briefPlaceholder,
  whatsappNumber = env.whatsappNumber,
  email = "hello@milkywayy.com",
}: {
  service?: LeadService;
  showServices?: boolean;
  briefLabel?: string;
  briefPlaceholder?: string;
  whatsappNumber?: string;
  email?: string;
}) {
  const { errors, status, send, onInput } = useLeadForm(
    showServices ? "contact" : "production",
    whatsappNumber,
  );
  const [pref, setPref] = useState("WhatsApp");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const { values, hp } = readForm(form);
    if (!showServices) values.fields.service = service;
    await send(form, values, hp, { whatsapp: values.preferred_reply === "WhatsApp" });
  }

  if (status.kind === "done") {
    const { ref, waUrl, values } = status.sent;
    return (
      <FormDone
        reference={ref}
        waUrl={waUrl}
        title={waUrl ? "Saved. WhatsApp is open." : "Request sent."}
        text={
          waUrl
            ? "Send the message there (it starts with your reference) and we'll reply in the chat."
            : values.preferred_reply === "Call"
              ? `We'll call you on ${values.phone}. No payment now: we confirm scope and price first.`
              : `We'll reply to ${values.email}. No payment now: we confirm scope and price first.`
        }
      />
    );
  }

  const sending = status.kind === "sending";
  return (
    <form
      className="form"
      noValidate
      onSubmit={onSubmit}
      onInput={onInput}
      aria-label="Send a request"
    >
      {showServices && (
        <OptionGroup legend="Which service?" cards error={errors.service}>
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
      <div className="row2">
        <Field label="Name" error={errors.name}>
          <input
            name="name"
            autoComplete="name"
            required
            aria-invalid={!!errors.name || undefined}
          />
        </Field>
        <Field label="Company" error={errors.company}>
          <input name="company" autoComplete="organization" />
        </Field>
      </div>
      <div className="row2">
        <PhoneField
          label={pref === "Call" ? "Phone" : "Phone (or email)"}
          error={errors.phone}
          invalid={!!errors.phone}
        />
        <Field label={pref === "Email" ? "Email" : "Email (or phone)"} error={errors.email}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email || undefined}
          />
        </Field>
      </div>
      <Field label={briefLabel} error={errors.brief}>
        <textarea name="brief" placeholder={briefPlaceholder} maxLength={2000} />
      </Field>
      <OptionGroup legend="How should we reply?" error={errors.preferred_reply}>
        {["WhatsApp", "Email", "Call"].map((r) => (
          <Option
            key={r}
            name="pref"
            value={r}
            label={r}
            checked={pref === r}
            onChange={() => setPref(r)}
          />
        ))}
      </OptionGroup>
      <Honeypot />
      {status.kind === "error" && (
        <FormError
          message={status.message}
          email={email}
          waUrl={whatsappLink(
            "Hi Milkywayy, I tried to send a request on your website.",
            whatsappNumber,
          )}
        />
      )}
      <button className="btn btn-p" type="submit" disabled={sending}>
        {sending ? "Sending…" : pref === "WhatsApp" ? "Send and open WhatsApp" : "Send request"}
      </button>
      <p className="fine">No payment now. We confirm scope and price first.</p>
    </form>
  );
}
