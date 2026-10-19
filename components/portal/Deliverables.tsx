"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DELIVERABLE_STATUS, type Deliverable } from "@/lib/portal/booking";
import {
  approveDeliverable,
  requestDeliverableRevision,
  type DeliverableResult,
} from "@/lib/portal/deliverable-actions";
import type { Playable } from "@/lib/playable";
import { tourEmbed } from "@/lib/tours";
import { embedUrl } from "@/lib/video";
import { Badge } from "./ui";

const MediaViewer = dynamic(
  () => import("@/components/media/MediaViewer").then((m) => m.MediaViewer),
  {
    ssr: false,
  },
);

/** A deliverable's link as something our viewer opens (360 tour, YouTube/Vimeo), else null. */
function playableFor(d: Deliverable): Playable | null {
  if (!d.link_url) return null;
  if (d.kind === "tour") {
    const t = tourEmbed(d.link_url);
    return t ? { type: "tour", title: d.label, src: t.embed, href: d.link_url } : null;
  }
  const v = embedUrl(d.link_url);
  return v ? { type: "embed", title: d.label, src: v, ratio: "16 / 9" } : null;
}

const TONE: Record<Deliverable["status"], "gold" | "ok" | undefined> = {
  editing: undefined,
  delivered: "gold",
  in_revision: undefined,
  approved: "ok",
};

/**
 * What we're making for this shoot (owner, 10 Oct 2026), live: each item's status (Editing →
 * Delivered → In revision → Delivered → Approved), its link (a 360 tour opens in the tour window),
 * and its own revision rounds. Pick an item, say what should change; Milkywayy is told.
 */
export function Deliverables({ items }: { items: Deliverable[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Playable | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [r, setR] = useState<{ id: string; res: DeliverableResult }>();
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <section className="pt-card" aria-labelledby="deliv-h" data-testid="deliverables">
      <h2 id="deliv-h" className="pt-h2">
        Deliverables
      </h2>
      <ul className="pt-deliv">
        {items.map((d) => {
          const play = playableFor(d);
          const left = d.rounds_allowed - d.rounds_used;
          return (
            <li key={d.id} data-testid="deliverable" aria-label={d.label}>
              <div className="pt-row">
                <b>{d.label}</b>
                <Badge tone={TONE[d.status]}>{DELIVERABLE_STATUS[d.status]}</Badge>
              </div>
              <span className="pt-meta">
                {left > 0
                  ? `${left} revision round${left === 1 ? "" : "s"} left`
                  : "No revision rounds left"}
              </span>
              <div className="pt-btns">
                {d.link_url &&
                  (play ? (
                    <button type="button" className="btn btn-g btn-s" onClick={() => setOpen(play)}>
                      {d.kind === "tour" ? "Open 360 tour" : "Watch"}
                    </button>
                  ) : (
                    <a
                      className="btn btn-g btn-s"
                      href={d.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {d.kind === "tour" ? "Open 360 tour ↗" : "Open link ↗"}
                    </a>
                  ))}
                {d.status === "delivered" && left > 0 && asking !== d.id && (
                  <button
                    type="button"
                    className="btn btn-g btn-s"
                    onClick={() => {
                      setAsking(d.id);
                      setNote("");
                    }}
                  >
                    Ask for a revision
                  </button>
                )}
                {d.status === "delivered" && (
                  <button
                    type="button"
                    className="btn btn-g btn-s"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await approveDeliverable(d.id);
                        setR({ id: d.id, res });
                        if (res.ok) router.refresh();
                      })
                    }
                  >
                    Approve
                  </button>
                )}
              </div>
              {asking === d.id && (
                <form
                  className="pt-form"
                  aria-label={`Revision for ${d.label}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const res = await requestDeliverableRevision(d.id, note);
                      setR({ id: d.id, res });
                      if (res.ok) {
                        setAsking(null);
                        router.refresh();
                      }
                    });
                  }}
                >
                  <label className="pt-field">
                    What should change? (round {d.rounds_used + 1} of {d.rounds_allowed})
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={note}
                      placeholder="e.g. 0:12 swap the music; photo 7 brighter"
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <div className="pt-btns">
                    <button type="submit" className="btn btn-p btn-s" disabled={pending}>
                      Send revision request
                    </button>
                    <button
                      type="button"
                      className="btn btn-g btn-s"
                      onClick={() => setAsking(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {r?.id === d.id && (
                <p
                  className={r.res.ok ? "pt-meta" : "pt-error"}
                  role={r.res.ok ? "status" : "alert"}
                >
                  {r.res.ok ? r.res.notice : r.res.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {open && <MediaViewer play={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
