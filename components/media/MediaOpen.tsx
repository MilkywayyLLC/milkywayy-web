"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const CALM = "(prefers-reduced-motion: reduce)";
const onCalm = (cb: () => void) => {
  const q = matchMedia(CALM);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
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
 *
 * `ambient` (our own files only, e.g. the home hero): after the page loads the video plays muted
 * on a loop over the poster, with no controls, unless the visitor prefers reduced motion. A
 * click then takes over as above: from the start, with sound, and the controls appear.
 */
export function MediaOpen({ play, ambient }: { play: Playable; ambient?: boolean }) {
  const [modal, setModal] = useState(false);
  const [inline, setInline] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [want, setWant] = useState(false);
  /** Ambient only: the visitor has clicked, so it behaves like any other card from now on. */
  const [engaged, setEngaged] = useState(false);
  const background = !!ambient && play.type === "file" && !engaged;
  // False on the server and in the first paint, so the poster always shows first.
  const motionOk = useSyncExternalStore(
    onCalm,
    () => !matchMedia(CALM).matches,
    () => false,
  );
  const live = mounted || (background && motionOk);
  const btn = useRef<HTMLButtonElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const sound = useSound();
  const soundOn = useRef(sound.on);
  useEffect(() => {
    soundOn.current = sound.on;
  }, [sound.on]);

  // Ambient: once hydrated, the video plays muted over the poster.
  useEffect(() => {
    const v = vid.current;
    if (!v || !background) return;
    v.muted = true;
    v.play().catch(() => undefined);
  }, [background, live]);

  useEffect(() => {
    const v = vid.current;
    if (!v || background) return;
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
  }, [want, mounted, background]);

  const toggle = () => {
    if (background) {
      // First click on an ambient video: restart it, now with sound.
      if (vid.current) vid.current.currentTime = 0;
      setEngaged(true);
      setMounted(true);
      return setWant(true);
    }
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
      {play.type === "file" && live && (
        <video
          ref={vid}
          className="fr-preview"
          src={play.src}
          poster={play.poster}
          loop
          muted={background}
          playsInline
          preload="metadata"
          tabIndex={-1}
          onPlay={() => !background && setWant(true)}
          onPause={() => !background && setWant(false)}
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
        {play.type === "file" && mounted && !background && <VideoControls video={vid} />}
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
