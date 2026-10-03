"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 1800;
/** Strong ease-out: fast at first, then slows down and lands. */
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * One stat (site-refine, 3 Oct 2026). "1,000+" counts up from 0 over ~1.8s when the band scrolls
 * into view (once), then the "+" appears. A year ("2020") doesn't count; it fades in. The final
 * value holds the space from the start (an invisible copy underneath), so nothing shifts, and it's
 * what the server renders, screen readers read and reduced motion shows.
 */
export function StatValue({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  const m = /^([\d,]+)(.*)$/.exec(value.trim());
  const year = /^(19|20)\d{2}$/.test(value.trim());
  const target = m && !year ? Number(m[1].replace(/,/g, "")) : null;
  const suffix = m ? m[2] : "";
  // "idle": not started (server render shows the final value); "wait": below the fold, hidden
  // until it's in view; "run": counting; "done": landed.
  const [phase, setPhase] = useState<"idle" | "wait" | "run" | "done">("idle");
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || (target === null && !year)) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen when the page became interactive: leave it, don't replay.
    if (el.getBoundingClientRect().top < innerHeight) return;
    setPhase("wait");
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (year || target === null) return setPhase("done");
        setPhase("run");
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION);
          setN(Math.round(ease(t) * target));
          if (t < 1) requestAnimationFrame(tick);
          else setPhase("done");
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, year]);

  const counting = phase === "wait" || phase === "run";
  return (
    <b ref={ref} className={year ? "stat-v yr" : "stat-v"} data-phase={phase} aria-label={value}>
      <span className="stat-ghost" aria-hidden="true">
        {value}
      </span>
      <span className="stat-live" aria-hidden="true">
        {year || !counting ? (
          value
        ) : (
          <>
            {n.toLocaleString("en-US")}
            <span className="stat-suffix">{suffix}</span>
          </>
        )}
      </span>
    </b>
  );
}
