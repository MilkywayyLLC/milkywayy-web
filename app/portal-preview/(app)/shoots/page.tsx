"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/portal-mock/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, NotFor, Ph, Sheet, Stepper, useToast } from "@/components/portal-mock/ui";
import { SHOOT_STEPS, SHOOTS, waChat, type Shoot } from "@/lib/portal-mock/data";

const B = "/portal-preview";

function ShootActions({ s, onCancel }: { s: Shoot; onCancel: () => void }) {
  if (s.status === "Requested" || s.status === "Confirmed")
    return (
      <div className="pt-btns">
        <a
          className="btn btn-g btn-s"
          href={waChat(`Hi, I'd like to reschedule ${s.ref} (${s.title}).`)}
          target="_blank"
          rel="noopener"
        >
          Reschedule
        </a>
        {s.status === "Requested" && (
          <button type="button" className="btn btn-g btn-s" onClick={onCancel}>
            Cancel request
          </button>
        )}
      </div>
    );
  return (
    <div className="pt-btns">
      <Link className="btn btn-p btn-s" href={`${B}/shoots/${s.ref}`}>
        {s.status === "Delivered" ? "Review and download" : "Files"}
      </Link>
    </div>
  );
}

export default function Shoots() {
  const { account } = usePersona();
  const [cancel, setCancel] = useState<Shoot | null>(null);
  const [toast, say] = useToast();
  if (!account.services.includes("shoots")) return <NotFor what="property shoots" />;
  const active = SHOOTS.filter((s) => s.status !== "Completed");
  const done = SHOOTS.filter((s) => s.status === "Completed");

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">{active.length} active</span>
          <h1 className="pt-h1">Shoots</h1>
        </div>
        <a href="/property-shoots" className="btn btn-p btn-s">
          <Icon name="plus" size={16} /> Book another shoot
        </a>
      </div>

      <div className="pt-grid2">
        {active.map((s) => (
          <article key={s.ref} className="pt-card">
            <div className="pt-row">
              <span className="pt-eb">{s.ref}</span>
              <Badge tone={s.status === "Delivered" ? "gold" : undefined}>{s.status}</Badge>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "88px 1fr",
                gap: 12,
                alignItems: "start",
              }}
            >
              <Ph k={s.photo} ratio="1" />
              <div style={{ display: "grid", gap: 2 }}>
                <b className="pt-title">{s.title}</b>
                <span className="pt-meta">
                  {s.date} · {s.slot}
                </span>
                <span className="pt-meta">{s.services.join(" · ")}</span>
              </div>
            </div>
            <Stepper steps={SHOOT_STEPS} now={s.status} />
            {s.status === "Requested" && (
              <span className="pt-meta">
                We’ll confirm the date and slot on WhatsApp, usually within a few hours.
              </span>
            )}
            <ShootActions s={s} onCancel={() => setCancel(s)} />
          </article>
        ))}
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 className="pt-h2">Completed</h2>
        <div className="pt-list">
          {done.map((s) => (
            <Link
              key={s.ref}
              href={`${B}/shoots/${s.ref}`}
              className="pt-row"
              style={{ textDecoration: "none" }}
            >
              <div>
                <b className="pt-title">{s.title}</b>
                <div className="pt-meta">
                  {s.ref} · {s.date} · files kept until Sep 2027
                </div>
              </div>
              <Icon name="chevron" size={16} />
            </Link>
          ))}
        </div>
      </section>

      {cancel && (
        <Sheet title="Cancel this request?" onClose={() => setCancel(null)}>
          <p>
            {cancel.ref} · {cancel.title}, {cancel.date}. Nothing is charged for a request we
            haven’t confirmed.
          </p>
          <div className="pt-btns">
            <button
              type="button"
              className="btn btn-p btn-s"
              onClick={() => {
                setCancel(null);
                say("Request cancelled (mockup: nothing saved)");
              }}
            >
              Cancel request
            </button>
            <button type="button" className="btn btn-g btn-s" onClick={() => setCancel(null)}>
              Keep it
            </button>
          </div>
        </Sheet>
      )}
      {toast}
    </>
  );
}
