"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { Playable } from "@/lib/playable";

// The lightbox, players and tour frame load only when someone opens one.
const MediaViewer = dynamic(() => import("./MediaViewer").then((m) => m.MediaViewer), {
  ssr: false,
});

const ACTION: Record<Playable["type"], string> = {
  photos: "Open photos",
  file: "Play",
  embed: "Play",
  tour: "Open 360 tour",
};

/**
 * The control over a MediaFrame card: opens what the format opens (lib/media-config). Reels
 * from our own files may play a muted preview on hover on desktop, never with sound, never with
 * reduced motion. Render inside a MediaFrame.
 */
export function MediaOpen({ play, preview = false }: { play: Playable; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const canPreview = () =>
    preview &&
    play.type === "file" &&
    matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;

  const video = play.type === "file" || play.type === "embed";
  return (
    <>
      {hover && play.type === "file" && (
        <video
          className="fr-preview"
          src={play.src}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      <button
        ref={btn}
        type="button"
        className={video ? "fr-open play-btn" : "fr-open"}
        aria-label={`${ACTION[play.type]}: ${play.title}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onPointerEnter={(e) => e.pointerType === "mouse" && canPreview() && setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        {video && <span className="play" aria-hidden="true" />}
      </button>
      {open && (
        <MediaViewer
          play={play}
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}
