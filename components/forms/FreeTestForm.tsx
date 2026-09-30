"use client";

import { Ctas } from "@/components/ui/Ctas";
import { useState } from "react";
import { Field, Option, OptionGroup, Select } from "@/components/ui/Field";

const COUNTRIES = ["United States", "Canada", "United Kingdom", "Europe", "Australia", "Other"];
const STEPS = ["Your volume", "Details", "Book"] as const;

/**
 * Post-production free test, 3 steps (guide §9.3): volume → details → 15-minute call.
 * Phase 1 wires the step switching only; saving the lead and the Cal.com embed land in Phase 6.
 * No package recommendations anywhere in this flow.
 */
export function FreeTestForm({ initialStep = 1 }: { initialStep?: 1 | 2 | 3 }) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => e.preventDefault()}
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
        <OptionGroup legend="What do you need edited?" cards>
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
        <Field label="How much per month?">
          <textarea
            name="volume"
            rows={2}
            style={{ minHeight: 64 }}
            placeholder="Around 100–200 listing photos + 30 reels + 10 long-form"
          />
        </Field>
        <OptionGroup legend="Who edits for you now?">
          <Option name="now" value="In-house" label="In-house" defaultChecked />
          <Option name="now" value="Freelancer" label="Freelancer" />
          <Option name="now" value="Nobody yet" label="Nobody yet" />
        </OptionGroup>
        <button className="btn btn-p" type="button" onClick={() => setStep(2)}>
          Continue
        </button>
      </div>

      <div className="stack" style={{ gap: 16 }} hidden={step !== 2}>
        <div className="row2">
          <Field label="Name">
            <input name="name" autoComplete="name" />
          </Field>
          <Field label="Company">
            <input name="company" autoComplete="organization" />
          </Field>
        </div>
        <div className="row2">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Country">
            <Select name="country" options={COUNTRIES} />
          </Field>
        </div>
        <Field label="Link to a recent listing or video">
          <input name="link" type="url" placeholder="https://" />
        </Field>
        <Ctas>
          <button className="btn btn-p" type="button" onClick={() => setStep(3)}>
            Choose a call time
          </button>
          <button className="btn btn-g" type="button" onClick={() => setStep(1)}>
            Back
          </button>
        </Ctas>
        <p className="fine">
          Prefer email?{" "}
          <button
            type="button"
            className="lnk"
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
          >
            Send your requirements instead
          </button>
        </p>
      </div>

      <div className="stack" style={{ gap: 16 }} hidden={step !== 3}>
        <div className="done" style={{ borderStyle: "dashed", borderColor: "var(--line)" }}>
          <span className="eb">Pick a 15-minute call · your time zone</span>
          <p className="muted" style={{ margin: 0 }}>
            The Cal.com booking calendar opens here (Phase 6).
          </p>
        </div>
        <button className="btn btn-g" type="button" onClick={() => setStep(2)}>
          Back
        </button>
      </div>
    </form>
  );
}
