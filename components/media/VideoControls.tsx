"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { setSoundOn, useSound } from "./sound";

/** Controls hide after this long without pointer movement. */
const HIDE_MS = 2000;
const STEP = 5;

// Plain functions, so the DOM element is written outside React's render analysis.
const seekTo = (v: HTMLVideoElement, t: number) => void (v.currentTime = t);
const muteTo = (v: HTMLVideoElement, m: boolean) => void (v.muted = m);

const clock = (t: number) => {
  const s = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The one set of controls for every uploaded video on the site: a speaker (shared mute state, see
 * ./sound) and a slim scrubbable progress bar with elapsed time. They show on hover and while the
 * video plays, and fade out after 2s without pointer movement. Render inside the card or stage
 * that holds the <video>; its parent element is the area whose pointer movement keeps them up.
 */
export function VideoControls({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [shown, setShown] = useState(true);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [muted, setMuted] = useState(true);
  const sound = useSound();

  useEffect(() => {
    const v = video.current;
    const host = box.current?.parentElement;
    if (!v || !host) return;
    const wake = () => {
      setShown(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShown(false), HIDE_MS);
    };
    const time = () => {
      setT(v.currentTime);
      setD(v.duration);
    };
    const vol = () => setMuted(v.muted);
    time();
    vol();
    wake();
    const on: [EventTarget, string, () => void][] = [
      [v, "timeupdate", time],
      [v, "loadedmetadata", time],
      [v, "durationchange", time],
      [v, "volumechange", vol],
      [v, "play", wake],
      [host, "pointermove", wake],
      [host, "pointerdown", wake],
      [host, "focusin", wake],
    ];
    for (const [el, ev, fn] of on) el.addEventListener(ev, fn);
    return () => {
      for (const [el, ev, fn] of on) el.removeEventListener(ev, fn);
      window.clearTimeout(timer.current);
    };
  }, [video]);

  // The shared state follows the speaker anywhere on the site.
  useEffect(() => {
    if (video.current) muteTo(video.current, !sound.on);
  }, [sound.on, video]);

  const seek = (clientX: number) => {
    const v = video.current;
    const r = track.current?.getBoundingClientRect();
    if (!v || !r || !Number.isFinite(v.duration)) return;
    seekTo(v, Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * v.duration);
  };
  const pct = d > 0 ? Math.min(100, (t / d) * 100) : 0;

  return (
    <div
      ref={box}
      className="vc"
      data-show={shown ? "" : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="vc-snd"
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        aria-pressed={!muted}
        onClick={() => {
          const v = video.current;
          if (!v) return;
          muteTo(v, !v.muted);
          setSoundOn(!v.muted);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
          {muted ? (
            <path
              d="m16 9.5 5 5m0-5-5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      <div className="vc-bar">
        <span className="vc-time">{clock(t)}</span>
        <div
          ref={track}
          className="vc-track"
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(d) || 0}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${clock(t)} of ${clock(d)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seek(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && seek(e.clientX)}
          onKeyDown={(e) => {
            const v = video.current;
            if (!v || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
            e.preventDefault();
            seekTo(v, Math.max(0, v.currentTime + (e.key === "ArrowRight" ? STEP : -STEP)));
          }}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
