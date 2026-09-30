"use client";

import { useEffect, useState } from "react";

const FPS = 25;
const pad = (n: number) => String(n).padStart(2, "0");
const format = (frame: number) => {
  const s = Math.floor(frame / FPS);
  return `REC 00:${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(frame % FPS)}`;
};

/** Running REC timecode (home hero). Static when reduced motion is on or `running` is false. */
export function Timecode({
  start = "00:14:08",
  running = true,
}: {
  start?: string;
  running?: boolean;
}) {
  const [m, s, f] = start.split(":").map(Number);
  const first = (m * 60 + s) * FPS + f;
  const [frame, setFrame] = useState(first);

  useEffect(() => {
    if (!running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((x) => (x + 1) % (3600 * FPS)), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [running]);

  // aria-hidden: a counter ticking 25 times a second is noise for screen readers.
  return <span aria-hidden="true">{format(frame)}</span>;
}
