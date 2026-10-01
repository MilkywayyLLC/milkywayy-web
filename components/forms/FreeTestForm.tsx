"use client";

import { useRef, useState } from "react";
import { Ctas } from "@/components/ui/Ctas";
import { Field, Option, OptionGroup, Select } from "@/components/ui/Field";
import { env } from "@/lib/env";
import { readForm } from "@/lib/leads/client";
import { checkLead } from "@/lib/leads/rules";
import { whatsappLink } from "@/lib/whatsapp";
import { CalEmbed } from "./CalEmbed";
import { FormDone, FormError } from "./FormDone";
import { Honeypot } from "./Honeypot";
import { useLeadForm } from "./useLeadForm";

const COUNTRIES = ["United States", "Canada", "United Kingdom", "Europe", "Australia", "Other"];
const STEPS = ["Your volume", "Details", "Book"] as const;
const STEP1 = ["what", "volume", "now"];

/**
 * Post-production free test, 3 steps (guide §9.3): volume → details → 15-minute call.
 * "Choose a call time" saves the lead, then shows the calendar; "Send your requirements instead"
 * saves it and confirms by email. No package recommendations anywhere in this flow.
 */
export function FreeTestForm({
  initialStep = 1,
  whatsappNumber = env.whatsappNumber,
  email = "hello@milkywayy.com",
}: {
  initialStep?: 1 | 2 | 3;
  whatsappNumber?: string;
  email?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [booked, setBooked] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { errors, status, send, onInput } = useLeadForm("free-test", whatsappNumber);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const err = (k: string) => stepErrors[k] ?? errors[k];

  function next() {
    const { values } = readForm(form.current!, ["what"]);
    const found = Object.fromEntries(
      Object.entries(checkLead("free-test", values)).filter(([k]) => STEP1.includes(k)),
    ) as Record<string, string>;
    setStepErrors(found);
    if (Object.keys(found).length) return;
    setStep(2);
  }

  async function submit(path: "calendar" | "email") {
    const f = form.current!;
    const { values, hp } = readForm(f, ["what"]);
    values.fields.path = path;
    values.preferred_reply = "Email";
    const found = checkLead("free-test", values);
    if (Object.keys(found).some((k) => STEP1.includes(k))) {
      setStepErrors(found as Record<string, string>);
      return setStep(1);
    }
    const sent = await send(f, values, hp);
    if (sent && path === "calendar") setStep(3);
  }

  const done = status.kind === "done" ? status.sent : null;
  if (done && (done.values.fields.path === "email" || !env.calLink))
    return (
      <FormDone
        reference={done.ref}
        title="Got it. We'll be in touch."
        text={
          done.values.fields.path === "email"
            ? `We'll reply to ${done.values.email} with what we need for your free test.`
            : `We'll email ${done.values.email} to set a time for the 15-minute call.`
        }
      />
    );

  const sending = status.kind === "sending";
  return (
    <form
      ref={form}
      className="form"
      noValidate
      onSubmit={(e) => e.preventDefault()}
      onInput={(e) => {
        onInput(e);
        setStepErrors({});
      }}
      aria-label="Book a free test edit"
    >
      <ol className="qsteps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1} · {s}
            {i < STEPS.length - 1 && <span aria-hidden="true"> &nbsp;/</span>}
          </li>
        ))}
      </ol>

      <div className="stack" style={{ gap: 16 }} hidden={step !== 1}>
        <OptionGroup legend="What do you need edited?" cards error={err("what")}>
          <Option
            type="checkbox"
            name="what"
            value="photo"
            label="Photo edits"
            sub="Listing and property photos"
            defaultChecked
          />
          <Option
            type="checkbox"
            name="what"
            value="short"
            label="Short-form"
            sub="Social media reels"
          />
          <Option type="checkbox" name="what" value="long" label="Long-form" sub="YouTube videos" />
        </OptionGroup>
        <Field label="How much per month?" error={err("volume")}>
          <textarea
            name="volume"
            rows={2}
            maxLength={1000}
            style={{ minHeight: 64 }}
            placeholder="Around 100–200 listing photos + 30 reels + 10 long-form"
          />
        </Field>
        <OptionGroup legend="Who edits for you now?" error={err("now")}>
          <Option name="now" value="In-house" label="In-house" defaultChecked />
          <Option name="now" value="Freelancer" label="Freelancer" />
          <Option name="now" value="Nobody yet" label="Nobody yet" />
        </OptionGroup>
        <button className="btn btn-p" type="button" onClick={next}>
          Continue
        </button>
      </div>

      <div className="stack" style={{ gap: 16 }} hidden={step !== 2}>
        <div className="row2">
          <Field label="Name" error={err("name")}>
            <input name="name" autoComplete="name" />
          </Field>
          <Field label="Company" error={err("company")}>
            <input name="company" autoComplete="organization" />
          </Field>
        </div>
        <div className="row2">
          <Field label="Email" error={err("email")}>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={!!err("email") || undefined}
            />
          </Field>
          <Field label="Country">
            <Select name="country" options={COUNTRIES} />
          </Field>
        </div>
        <Field label="Link to a recent listing or video" error={err("link")}>
          <input
            name="link"
            type="url"
            placeholder="https://"
            aria-invalid={!!err("link") || undefined}
          />
        </Field>
        <Honeypot />
        {status.kind === "error" && (
          <FormError
            message={status.message}
            email={email}
            waUrl={whatsappLink("Hi Milkywayy, I'd like a free test edit.", whatsappNumber)}
          />
        )}
        <Ctas>
          <button
            className="btn btn-p"
            type="button"
            disabled={sending}
            onClick={() => submit("calendar")}
          >
            {sending ? "Sending…" : "Choose a call time"}
          </button>
          <button className="btn btn-g" type="button" disabled={sending} onClick={() => setStep(1)}>
            Back
          </button>
        </Ctas>
        <p className="fine">
          Prefer email?{" "}
          <button
            type="button"
            className="lnk"
            disabled={sending}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onClick={() => submit("email")}
          >
            Send your requirements instead
          </button>
        </p>
      </div>

      <div className="stack" style={{ gap: 16 }} hidden={step !== 3}>
        {done && env.calLink ? (
          <FormDone
            reference={done.ref}
            title={booked ? "Call booked." : "Saved. Now pick a time."}
            text={
              booked
                ? "The invite is in your inbox. Talk soon."
                : "Pick a 15-minute call in your time zone."
            }
          >
            {!booked && (
              <CalEmbed
                link={env.calLink}
                name={done.values.name}
                email={done.values.email}
                reference={done.ref}
                onBooked={() => setBooked(true)}
              />
            )}
          </FormDone>
        ) : (
          <div className="done" style={{ borderStyle: "dashed", borderColor: "var(--line)" }}>
            <span className="eb">Pick a 15-minute call · your time zone</span>
            <p className="muted" style={{ margin: 0 }}>
              The booking calendar opens here once your details are in.
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
