"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { Badge } from "../ui";

/*
 * Home → Bookings (UI rebuild, 17 Oct 2026): every shoot as one row with a thumbnail, filtered by
 * our own statuses. The thumbnail is the service icon until something is delivered, then the first
 * delivered photo (or a video's poster). A price shows only for those who see prices, and only for
 * what isn't covered by their package (the row's `price` is empty then).
 */
export type BookingRow = {
  id: string;
  href: string;
  ref: string;
  title: string;
  when: string;
  service: string;
  /** The filter chip it belongs to. */
  chip: string;
  status: string;
  gold: boolean;
  price: string;
  cover: string | null;
  icon: "photo" | "video";
};

const CHIPS: [string, string][] = [
  ["requested", "Requested"],
  ["confirmed", "Confirmed"],
  ["shot", "Shot"],
  ["editing", "Editing"],
  ["delivered", "Delivered"],
  ["revision", "Revision"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];
const SHOWN = 8;

export function BookingsList({ rows }: { rows: BookingRow[] }) {
  const [chip, setChip] = useState("all");
  const [all, setAll] = useState(false);
  const count = (k: string) => rows.filter((r) => r.chip === k).length;
  const chips = [["all", "All"] as [string, string], ...CHIPS.filter(([k]) => count(k) > 0)];
  const list = chip === "all" ? rows : rows.filter((r) => r.chip === chip);
  const shown = all ? list : list.slice(0, SHOWN);

  return (
    <section className="pt-hm-bookings" aria-labelledby="bookings-h" data-testid="bookings">
      <div className="pt-hm-bhead">
        <h2 id="bookings-h" className="pt-h2">
          Bookings
        </h2>
        <p className="pt-meta">Every shoot, from request to final delivery.</p>
      </div>
      {rows.length > 0 && (
        <div className="pt-hm-chips" role="group" aria-label="Filter by status">
          {chips.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={chip === k}
              onClick={() => {
                setChip(k);
                setAll(false);
              }}
            >
              {label}
              {k !== "all" && <small>{count(k)}</small>}
            </button>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="pt-card pt-meta" style={{ margin: 0 }}>
          No bookings yet. Book your first shoot and follow it here.
        </p>
      ) : (
        <ul className="pt-hm-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={r.href} prefetch={false} className="pt-hm-row">
                <span className="pt-hm-thumb" aria-hidden="true">
                  {r.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover} alt="" loading="lazy" />
                  ) : (
                    <Icon name={r.icon} size={26} />
                  )}
                </span>
                <span className="pt-hm-body">
                  <span className="pt-hm-ref pt-mono">
                    {[r.ref, r.when].filter(Boolean).join(" · ")}
                  </span>
                  <b className="pt-title">{r.title}</b>
                  {r.service && <span className="pt-meta pt-hm-svc">{r.service}</span>}
                </span>
                <span className="pt-hm-side">
                  <Badge tone={r.gold ? "gold" : undefined}>{r.status}</Badge>
                  {r.price && <span className="pt-mono">{r.price}</span>}
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!all && list.length > SHOWN && (
        <button type="button" className="btn btn-g btn-s" onClick={() => setAll(true)}>
          Show all ({list.length})
        </button>
      )}
    </section>
  );
}
