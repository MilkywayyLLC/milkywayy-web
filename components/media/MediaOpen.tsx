"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Playable } from "@/lib/playable";
import { isLocked, setSoundOn, useSound } from "./sound";

// The lightbox and the modal player load only when someone opens one.
const MediaViewer = dynamic(() => import("./MediaViewer").then((m) => m.MediaViewer), {
  ssr: false,
});

/** Inline players below this card width open in the modal instead. */
const INLINE_MIN = 480;

const LABEL: Record<Playable["type"], string> = {
  photos: "Open photos",
  file: "Play",
  embed: "Play",
  tour: "Open 360 tour",
};

/** Only one card plays at a time: a new one pauses the last. */
let stopLast: (() => void) | null = null;

/**
 * The control over a MediaFrame card, the one player for the whole site. Our own videos play in
 * the card: hover plays and leaving pauses (mouse), a tap plays or pauses (touch). They start
 * muted and play with sound once the visitor has clicked anywhere (components/media/sound); the
 * speaker button on the playing card flips sound for every video. YouTube/Vimeo load their
 * iframe in the card on click (modal when the card is under 480px wide). 360 tours load in the
 * card, or full screen on phones. Photo sets open the zoom viewer. Render inside a MediaFrame.
 */
export function MediaOpen({ play }: { play: Playable }) {
  const [modal, setModal] = useState(false);
  const [inline, setInline] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [want, setWant] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const pointer = useRef("");
  const wasLocked = useRef(false);
  const sound = useSound();
  const audible = sound.unlocked && sound.on;

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (!want) return void v.pause();
    stopLast?.();
    const mine = () => setWant(false);
    stopLast = mine;
    v.muted = !audible;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => setWant(false));
    });
    return () => {
      if (stopLast === mine) stopLast = null;
    };
    // `audible` is applied by the next effect so a sound change never restarts playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, mounted]);

  useEffect(() => {
    if (vid.current) vid.current.muted = !audible;
  }, [audible]);

  const toggle = () => {
    setMounted(true);
    setWant((w) => !w);
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const open = () => {
    const width = btn.current?.parentElement?.clientWidth ?? 0;
    if (play.type === "photos") return setModal(true);
    if (play.type === "file") {
      // A mouse hover already plays it; a tap or key press toggles.
      if (pointer.current !== "mouse" || reduced()) toggle();
      return;
    }
    if (play.type === "tour" && matchMedia("(max-width: 767px)").matches) return setModal(true);
    if (width < INLINE_MIN) return setModal(true);
    setInline(true);
  };

  if (inline && (play.type === "embed" || play.type === "tour"))
    return (
      <iframe
        className="fr-inline"
        src={play.src}
        title={play.title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; xr-spatial-tracking; gyroscope; accelerometer"
        allowFullScreen
      />
    );

  return (
    <>
      {play.type === "file" && mounted && (
        <video
          ref={vid}
          className="fr-preview"
          src={play.src}
          poster={play.poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onPause={() => setWant(false)}
        />
      )}
      <div
        className="fr-hit"
        onPointerEnter={(e) => {
          if (play.type === "file" && e.pointerType === "mouse" && !reduced()) {
            pointer.current = "mouse";
            setMounted(true);
            setWant(true);
          }
        }}
        onPointerLeave={(e) => play.type === "file" && e.pointerType === "mouse" && setWant(false)}
      >
        <button
          ref={btn}
          type="button"
          className={play.type === "photos" ? "fr-open" : "fr-open play-btn"}
          aria-label={`${LABEL[play.type]}: ${play.title}`}
          aria-haspopup={play.type === "file" ? undefined : "dialog"}
          aria-pressed={play.type === "file" ? want : undefined}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onClick={open}
        />
        {play.type === "file" && want && (
          <button
            type="button"
            className="fr-snd"
            aria-label={audible ? "Turn sound off" : "Turn sound on"}
            aria-pressed={audible}
            onPointerDown={() => (wasLocked.current = isLocked())}
            onClick={() => {
              // The first click unlocks sound; it should turn it on, not flip it off again.
              setSoundOn(wasLocked.current ? true : !sound.on);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
              {audible ? (
                <path
                  d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="m16 9.5 5 5m0-5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        )}
      </div>
      {modal && (
        <MediaViewer
          play={play}
          origin={() => btn.current?.parentElement?.querySelector("img")}
          onClose={() => {
            setModal(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}
