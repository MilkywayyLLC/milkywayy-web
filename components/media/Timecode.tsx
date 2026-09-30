"use client";

import { useEffect, useRef } from "react";

const FPS = 25;
const pad = (n: number) => String(n).padStart(2, "0");
const format = (frame: number) => {
  const s = Math.floor(frame / FPS);
  return `REC 00:${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(frame % FPS)}`;
};

/**
 * Running REC timecode (home hero). Writes straight to the DOM (no React re-render per frame) and
 * starts only once the page is idle, so it never competes with first paint. Static when reduced
 * motion is on or `running` is false.
 */
export function Timecode({
  start = "00:14:08",
  running = true,
}: {
  start?: string;
  running?: boolean;
}) {
  const [m, s, f] = start.split(":").map(Number);
  const first = (m * 60 + s) * FPS + f;
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = first;
    let timer = 0;
    const tick = () => {
      frame = (frame + 1) % (3600 * FPS);
      if (el.current) el.current.textContent = format(frame);
    };
    const begin = () => {
      timer = window.setInterval(tick, 1000 / FPS);
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(begin, { timeout: 2500 })
      : window.setTimeout(begin, 1500);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      window.clearInterval(timer);
    };
  }, [first, running]);

  // aria-hidden: a counter ticking 25 times a second is noise for screen readers.
  return (
    <span ref={el} aria-hidden="true">
      {format(first)}
    </span>
  );
}
