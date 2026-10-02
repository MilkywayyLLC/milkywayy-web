"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { ShareSheet } from "@/components/portal-mock/ShareSheet";
import { Back, Badge, NotFor, Ph, Sheet, Stepper, useToast } from "@/components/portal/ui";
import { SHOOT_STEPS, SHOOTS, waChat } from "@/lib/portal-mock/data";
import type { PlaceholderKey } from "@/content/types";

const GRID: PlaceholderKey[] = [
  "night",
  "interior",
  "kitchen",
  "bath",
  "dusk",
  "aerial",
  "interior",
  "kitchen",
];

export default function ShootPage() {
  const { ref } = useParams<{ ref: string }>();
  const { account } = usePersona();
  const s = SHOOTS.find((x) => x.ref === ref) ?? SHOOTS[2];
  const [sheet, setSheet] = useState<null | "revision" | "share" | "approve">(null);
  const [toast, say] = useToast();
  if (!account.services.includes("shoots")) return <NotFor what="property shoots" />;
  const delivered = s.status === "Delivered" || s.status === "Completed";
  const rev = s.revision ?? { used: 0, of: 2 };

  return (
    <>
      <Back href="/portal-preview/shoots" label="Shoots" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {s.ref} · {s.date} · {s.slot}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {s.title}
          </h1>
        </div>
        <Badge tone={s.status === "Delivered" ? "gold" : undefined}>{s.status}</Badge>
      </div>
      <Stepper steps={SHOOT_STEPS} now={s.status} />

      {delivered && (
        <>
          {s.status === "Delivered" && (
            <p className="pt-meta" style={{ margin: 0 }}>
              Happy with it? Approve to complete. Otherwise it completes on its own on Mon 5 Oct.
            </p>
          )}
          <div className="pt-btns">
            <button
              type="button"
              className="btn btn-p"
              onClick={() => say("Download started: MW-1176.zip, 598 MB (mockup)")}
            >
              <Icon name="download" size={18} /> Download all
            </button>
            <button type="button" className="btn btn-g" onClick={() => setSheet("share")}>
              <Icon name="link" size={18} /> Create share link
            </button>
          </div>
          <div className="pt-btns">
            <button
              type="button"
              className="btn btn-g btn-s"
              disabled={rev.used >= rev.of}
              onClick={() => setSheet("revision")}
            >
              Request revision ({rev.used + 1} of {rev.of})
            </button>
            {s.status === "Delivered" && (
              <button type="button" className="btn btn-g btn-s" onClick={() => setSheet("approve")}>
                <Icon name="check" size={16} /> Approve
              </button>
            )}
          </div>

          <section className="pt-card">
            <div className="pt-row">
              <h2 className="pt-h2">{s.deliveries?.[0].name}</h2>
              <span className="pt-meta pt-mono">{s.deliveries?.[0].at}</span>
            </div>
            <div className="pt-photos">
              {GRID.map((k, i) => (
                <Ph key={i} k={k} ratio="1" />
              ))}
            </div>
            <div className="pt-list">
              {s.deliveries?.[0].items.map((it) => (
                <div key={it.kind} className="pt-file">
                  <div>
                    <b>{it.kind}</b>
                    <div className="pt-meta">
                      {it.count}
                      {it.size && ` · ${it.size}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-g btn-s pt-btn-sm"
                    onClick={() => say(`${it.kind}: download started (mockup)`)}
                  >
                    {it.kind === "360 tour" ? (
                      "Open"
                    ) : (
                      <Icon name="download" size={16} title={`Download ${it.kind}`} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Details</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            {[
              ["Address", s.address],
              ["Property", `${s.property.type} · ${s.property.beds}`],
              ["Services", s.services.join(", ")],
              ["When", `${s.date} · ${s.slot}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gap: 2 }}>
                <dt className="pt-eb">{k}</dt>
                <dd style={{ margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
          {!delivered && (
            <a
              className="btn btn-g btn-s"
              href={waChat(`Hi, I'd like to reschedule ${s.ref}.`)}
              target="_blank"
              rel="noopener"
            >
              Reschedule on WhatsApp
            </a>
          )}
        </section>

        <section className="pt-card">
          <h2 className="pt-h2">Activity</h2>
          <ul className="pt-timeline">
            {(
              [
                [4, "Mon 28 Sep, 10:42", "Delivered · Delivery 1 (Milkywayy)"],
                [2, "Sat 26 Sep, 17:05", "Shot · now editing"],
                [1, "Wed 23 Sep, 12:10", `Confirmed for ${s.date}, ${s.slot.toLowerCase()}`],
                [0, "Tue 22 Sep, 21:48", "Requested on milkywayy.com"],
              ] as const
            )
              .filter(([i]) => i <= SHOOT_STEPS.indexOf(s.status))
              .map(([, at, body]) => (
                <li key={at}>
                  <div style={{ display: "grid" }}>
                    <span>{body}</span>
                    <span className="pt-meta pt-mono">{at}</span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className="pt-card">
        <h2 className="pt-h2">Messages about this shoot</h2>
        {delivered ? (
          <>
            <div className="pt-msg">
              <span className="pt-eb">You · Mon 28 Sep</span>
              Could we also get 5 photos in square format for Instagram?
            </div>
            <div className="pt-msg admin">
              <span className="pt-eb">Milkywayy · Mon 28 Sep</span>
              Sure, adding them to Delivery 1 by tomorrow.
            </div>
          </>
        ) : (
          <p className="pt-meta" style={{ margin: 0 }}>
            No messages yet. Questions about access, parking or the brief go here.
          </p>
        )}
        <form
          className="pt-form"
          onSubmit={(e) => (e.preventDefault(), say("Message sent (mockup)"))}
        >
          <textarea placeholder="Write a message" aria-label="Message" />
          <button type="submit" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
            Send
          </button>
        </form>
      </section>

      {sheet === "share" && <ShareSheet shoot={s} onClose={() => setSheet(null)} />}
      {sheet === "revision" && (
        <Sheet title={`Revision ${rev.used + 1} of ${rev.of}`} onClose={() => setSheet(null)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSheet(null);
              say("Revision requested (mockup)");
            }}
          >
            <label className="pt-field">
              What should change? *
              <textarea
                required
                placeholder="e.g. Photo 12: brighten the kitchen. Reel at 0:18: swap the music."
              />
            </label>
            <label className="pt-field">
              Screenshots (optional)
              <input type="url" placeholder="Paste a link, or attach below" />
            </label>
            <button type="button" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
              Attach screenshots
            </button>
            <p className="pt-meta" style={{ margin: 0 }}>
              2 revision rounds are included per shoot.
            </p>
            <button type="submit" className="btn btn-p">
              Send revision request
            </button>
          </form>
        </Sheet>
      )}
      {sheet === "approve" && (
        <Sheet title="Approve this delivery?" onClose={() => setSheet(null)}>
          <p>
            The shoot moves to Completed. Files stay downloadable for 12 months, and you can still
            message us about it.
          </p>
          <button
            type="button"
            className="btn btn-p"
            onClick={() => {
              setSheet(null);
              say("Approved (mockup: nothing saved)");
            }}
          >
            Approve
          </button>
        </Sheet>
      )}
      {toast}
    </>
  );
}
