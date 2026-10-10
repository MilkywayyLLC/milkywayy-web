"use client";

import { useEffect, useState, useTransition } from "react";
import { shareSelected } from "@/lib/portal/listing-actions";
import { ShareDone } from "./ListingParts";

const picked = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[name="pick"]:checked')].map(
    (i) => i.value,
  );

/**
 * Listings: tick several, then "Share selected" makes one collection link (owner, 10 Oct 2026).
 * The checkboxes live on the cards (name="pick"); this bar reads them.
 */
export function ShareSelectedBar() {
  const [n, setN] = useState(0);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ slug: string; title: string } | null>(null);
  const [pending, start] = useTransition();
  // The checkboxes are on the cards, outside this bar: count them on any change.
  useEffect(() => {
    const f = () => setN(picked().length);
    document.addEventListener("change", f);
    return () => document.removeEventListener("change", f);
  }, []);
  if (done) return <ShareDone kind="c" slug={done.slug} title={done.title} edited={false} />;
  return (
    <div className="pt-row pt-card" style={{ flexWrap: "wrap", background: "var(--bg)" }}>
      <span className="pt-meta">
        {n ? `${n} selected` : "Tick listings to share several on one link."}
      </span>
      <button
        type="button"
        className="btn btn-p btn-s"
        disabled={n < 2 || pending}
        onClick={() =>
          start(async () => {
            setErr("");
            const ids = picked();
            const r = await shareSelected(ids);
            if (!r.ok) return setErr(r.error ?? "Couldn’t make the link.");
            setDone({ slug: r.slug!, title: `${ids.length} homes picked for you` });
          })
        }
      >
        {pending ? "Making the link…" : `Share selected${n ? ` (${n})` : ""}`}
      </button>
      {err && (
        <p className="pt-error" role="alert" style={{ width: "100%" }}>
          {err}
        </p>
      )}
    </div>
  );
}
