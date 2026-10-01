"use client";

import { useState, type FormEvent } from "react";
import { Field, Option, OptionGroup } from "@/components/ui/Field";
import { env } from "@/lib/env";
import { readForm } from "@/lib/leads/client";
import { AVATAR_USES } from "@/lib/leads/rules";
import { whatsappLink } from "@/lib/whatsapp";
import { CalEmbed } from "./CalEmbed";
import { FormDone, FormError } from "./FormDone";
import { Honeypot } from "./Honeypot";
import { useLeadForm } from "./useLeadForm";

/**
 * AI avatars demo form (guide §9.2). "Other" reveals a required text field. "Book a call" (the
 * default) shows the call calendar after saving; WhatsApp and Email hand off like the LeadForm.
 */
export function DemoForm({
  whatsappNumber = env.whatsappNumber,
  email = "hello@milkywayy.com",
}: {
  whatsappNumber?: string;
  email?: string;
}) {
  const [use, setUse] = useState<(typeof AVATAR_USES)[number]>("Real estate");
  const [pref, setPref] = useState("Call");
  const [booked, setBooked] = useState(false);
  const { errors, status, send, onInput } = useLeadForm("avatars", whatsappNumber);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const { values, hp } = readForm(form);
    await send(form, values, hp, { whatsapp: values.preferred_reply === "WhatsApp" });
  }

  if (status.kind === "done") {
    const { ref, waUrl, values } = status.sent;
    if (values.preferred_reply === "Call" && env.calLink)
      return (
        <FormDone
          reference={ref}
          title={booked ? "Demo call booked." : "Saved. Now pick a time."}
          text={
            booked
              ? "The invite is in your inbox. See you on the call."
              : "Choose a 15-minute slot for your demo call below."
          }
        >
          {!booked && (
            <CalEmbed
              link={env.calLink}
              name={values.name}
              email={values.email}
              reference={ref}
              onBooked={() => setBooked(true)}
            />
          )}
        </FormDone>
      );
    return (
      <FormDone
        reference={ref}
        waUrl={waUrl}
        title={waUrl ? "Saved. WhatsApp is open." : "Demo request sent."}
        text={
          waUrl
            ? "Send the message there (it starts with your reference) and we'll set up the demo in the chat."
            : values.preferred_reply === "Call"
              ? `We'll be in touch on ${values.email || values.phone} to set a time for the demo call.`
              : `We'll reply to ${values.email} to set up the demo.`
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
      aria-label="Book a demo"
    >
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
        <Field label={pref === "Email" ? "Email" : "Email (or phone)"} error={errors.email}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email || undefined}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+971"
            aria-invalid={!!errors.phone || undefined}
          />
        </Field>
      </div>
      <OptionGroup legend="What's it for?" error={errors.use}>
        {AVATAR_USES.map((u) => (
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
        <Field label="Tell us what it's for" error={errors.use_other}>
          <input
            name="use_other"
            required
            autoFocus
            maxLength={200}
            placeholder="e.g. a hotel concierge avatar for our website"
            aria-invalid={!!errors.use_other || undefined}
          />
        </Field>
      )}
      <OptionGroup legend="How should we reply?" error={errors.preferred_reply}>
        {[
          ["Call", "Book a call"],
          ["WhatsApp", "WhatsApp"],
          ["Email", "Email"],
        ].map(([v, l]) => (
          <Option
            key={v}
            name="pref"
            value={v}
            label={l}
            checked={pref === v}
            onChange={() => setPref(v)}
          />
        ))}
      </OptionGroup>
      <Honeypot />
      {status.kind === "error" && (
        <FormError
          message={status.message}
          email={email}
          waUrl={whatsappLink("Hi Milkywayy, I'd like an AI avatar demo.", whatsappNumber)}
        />
      )}
      <button className="btn btn-p" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Book my demo"}
      </button>
    </form>
  );
}
