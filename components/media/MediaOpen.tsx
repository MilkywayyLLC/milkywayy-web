"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Playable } from "@/lib/playable";
import { useSound } from "./sound";
import { VideoControls } from "./VideoControls";

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
 * the card: a click or tap plays and pauses (no hover-play). Started by a click they play with
 * sound unless the visitor turned it off with the speaker (shared state, ./sound); the controls
 * (speaker, scrubbable progress bar, elapsed time) are VideoControls. YouTube/Vimeo load their
 * iframe in the card on click (modal when the card is under 480px wide) and keep their own UI.
 * 360 tours load in the card, or full screen on phones. Photo sets open the zoom viewer. Render
 * inside a MediaFrame.
 */
export function MediaOpen({ play }: { play: Playable }) {
  const [modal, setModal] = useState(false);
  const [inline, setInline] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [want, setWant] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const sound = useSound();
  const soundOn = useRef(sound.on);
  useEffect(() => {
    soundOn.current = sound.on;
  }, [sound.on]);

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (!want) return void v.pause();
    stopLast?.();
    const mine = () => setWant(false);
    stopLast = mine;
    // Started by a click, so browsers allow sound; fall back to muted if they refuse.
    v.muted = !soundOn.current;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => setWant(false));
    });
    return () => {
      if (stopLast === mine) stopLast = null;
    };
  }, [want, mounted]);

  const toggle = () => {
    setMounted(true);
    setWant((w) => !w);
  };

  const open = () => {
    const width = btn.current?.parentElement?.clientWidth ?? 0;
    if (play.type === "photos") return setModal(true);
    if (play.type === "file") return toggle();
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
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          onPlay={() => setWant(true)}
          onPause={() => setWant(false)}
        />
      )}
      <div className="fr-hit">
        <button
          ref={btn}
          type="button"
          className={play.type === "photos" ? "fr-open" : "fr-open play-btn"}
          aria-label={`${LABEL[play.type]}: ${play.title}`}
          aria-haspopup={play.type === "file" ? undefined : "dialog"}
          aria-pressed={play.type === "file" ? want : undefined}
          onClick={open}
        />
        {play.type === "file" && mounted && <VideoControls video={vid} />}
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
