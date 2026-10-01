"use client";

import { useState } from "react";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, NotFor, Ph, Stepper, useToast } from "@/components/portal-mock/ui";
import { AVATAR_STEPS, AVATAR_VIDEOS, waChat } from "@/lib/portal-mock/data";

export default function Avatars() {
  const { account } = usePersona();
  const [state, setState] = useState<"review" | "changes" | "approved" | "sent">("review");
  const [toast, say] = useToast();
  if (!account.services.includes("avatars")) return <NotFor what="AI avatars" />;
  const [script, ...rest] = AVATAR_VIDEOS;

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">AI avatars · presenter Adam</span>
          <h1 className="pt-h1">Avatars</h1>
        </div>
        <a
          href={waChat("Hi, I'd like a new AI avatar video.")}
          className="btn btn-p btn-s"
          target="_blank"
          rel="noopener"
        >
          Request a new video
        </a>
      </div>

      <section className="pt-card pt-suggest">
        <div className="pt-row">
          <span className="pt-eb">{script.ref} · needs your approval</span>
          <Badge tone={state === "approved" ? "ok" : "gold"}>
            {state === "approved" ? "In production" : script.status}
          </Badge>
        </div>
        <b className="pt-title" style={{ fontSize: 18 }}>
          {script.title}
        </b>
        <Stepper
          steps={AVATAR_STEPS}
          now={state === "approved" ? "In production" : script.status}
        />
        <span className="pt-eb">Script · v1 · about 55 seconds</span>
        <div className="pt-script">{script.script}</div>
        {state === "review" && (
          <>
            <p className="pt-meta" style={{ margin: 0 }}>
              Production starts once you approve. {script.due}.
            </p>
            <div className="pt-btns">
              <button
                type="button"
                className="btn btn-p"
                onClick={() => {
                  setState("approved");
                  say("Script approved. Production started (mockup)");
                }}
              >
                Approve script
              </button>
              <button type="button" className="btn btn-g" onClick={() => setState("changes")}>
                Ask for changes
              </button>
            </div>
          </>
        )}
        {state === "changes" && (
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setState("sent");
              say("Changes sent. We’ll post v2 (mockup)");
            }}
          >
            <label className="pt-field">
              What should change?
              <textarea
                required
                placeholder="e.g. Mention JVC first, and end with our phone number instead of the website."
              />
            </label>
            <div className="pt-btns">
              <button type="submit" className="btn btn-p btn-s">
                Send changes
              </button>
              <button type="button" className="btn btn-g btn-s" onClick={() => setState("review")}>
                Back
              </button>
            </div>
          </form>
        )}
        {state === "sent" && (
          <p className="pt-meta">Changes sent. You’ll get a WhatsApp when v2 is ready.</p>
        )}
      </section>

      <div className="pt-grid2">
        {rest.map((v) => (
          <article key={v.ref} className="pt-card">
            <div className="pt-row">
              <span className="pt-eb">{v.ref}</span>
              <Badge tone={v.status === "Delivered" ? "gold" : undefined}>{v.status}</Badge>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              <Ph k="adam" ratio="9 / 16" />
              <div style={{ display: "grid", gap: 2 }}>
                <b>{v.title}</b>
                <span className="pt-meta">{v.due}</span>
              </div>
            </div>
            <Stepper steps={AVATAR_STEPS} now={v.status} />
            {v.status === "Delivered" && (
              <div className="pt-btns">
                <button
                  type="button"
                  className="btn btn-p btn-s"
                  onClick={() => say("Download started (mockup)")}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={() => say("Revision 1 of 2: opens the request form (mockup)")}
                >
                  Request revision (1 of 2)
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {toast}
    </>
  );
}
