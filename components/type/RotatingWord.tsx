"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A word that cycles through `words` every 3s with a short slide + fade (home hero, 13 Oct 2026).
 * `children` is the longest word: it sits invisibly in the same grid cell, so the line keeps its
 * width and height whatever word shows (no layout shift), and HeroTitle fits the line to it.
 * The server and first paint show words[0]. Paused while the tab is hidden; with reduced motion
 * it stays on words[0]. aria-hidden: the heading carries the full sentence as its label.
 */
export function RotatingWord({ words, children }: { words: string[]; children: ReactNode }) {
  // `n` counts changes; only changes animate, so the first paint is still.
  const [n, setN] = useState(0);
  const i = n % words.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const start = () => {
      window.clearInterval(timer);
      if (!document.hidden) timer = window.setInterval(() => setN((c) => c + 1), 3000);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return (
    <span className="rot" aria-hidden="true">
      <span className="rot-size">{children}</span>
      <span className="rot-word" key={n} data-moved={n > 0 || undefined}>
        {words[i]}
      </span>
    </span>
  );
}
