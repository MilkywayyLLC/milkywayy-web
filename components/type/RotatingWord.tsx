"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Home hero's rotating word as a combination-lock dial (13 Oct 2026). The words are rows of a
 * list, one line tall each; a window shows three rows (previous faint above, current sharp in
 * the centre, next faint below) and the whole list moves up exactly one row every 1.0s with a
 * snap. The list is [last, ...words, first, second], so when the dial lands on the repeated first
 * word it jumps back to the original one without a transition: the same three rows, so the jump
 * doesn't show. Row looks come from each row's distance to the centre (CSS, data-d).
 * The list is as wide as its longest row, so the line always reserves the longest word.
 * `children` is that longest word, for HeroTitle's server-side width estimate (not rendered).
 * Server and first paint: words[0] centred, no animation. Paused while the tab is hidden; with
 * reduced motion, words[0] alone (CSS). aria-hidden: the heading carries the full sentence.
 */
export function RotatingWord({ words }: { words: string[]; children?: ReactNode }) {
  const rows = [words[words.length - 1], ...words, words[0], words[1]];
  const loop = words.length + 1; // index of the repeated first word
  const [c, setC] = useState(1);
  const [instant, setInstant] = useState(false);
  const at = useRef(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let jump = 0;
    const tick = () => {
      at.current += 1;
      setC(at.current);
      if (at.current === loop)
        jump = window.setTimeout(() => {
          at.current = 1;
          setInstant(true);
          setC(1);
        }, 440);
    };
    const start = () => {
      window.clearInterval(timer);
      if (!document.hidden) timer = window.setInterval(tick, 1000);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(jump);
      document.removeEventListener("visibilitychange", start);
    };
  }, [loop]);

  // Transitions back on once the instant jump has painted.
  useEffect(() => {
    if (!instant) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setInstant(false));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [instant]);

  return (
    <span className="rot" aria-hidden="true">
      <span
        className="rot-list"
        data-instant={instant || undefined}
        style={{ transform: `translateY(calc(var(--rot-peek) - ${c}em))` }}
      >
        {rows.map((w, i) => (
          <span key={i} className="rot-row" data-d={Math.max(-2, Math.min(2, i - c))}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}
