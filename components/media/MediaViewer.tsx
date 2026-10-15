"use client";

import dynamic from "next/dynamic";
import { getImageProps } from "next/image";
import { useEffect, useRef } from "react";
import type { Playable } from "@/lib/playable";
import { useSound } from "./sound";
import { VideoControls } from "./VideoControls";

// Photos open the zoom viewer, loaded on its own so opening a video never fetches Motion.
const ZoomGallery = dynamic(() => import("./ZoomGallery").then((m) => m.ZoomGallery), {
  ssr: false,
});

/**
 * The one modal behind every card (owner, 7 Oct 2026): the 9:16 / 16:9 video player and the 360
 * tour in a native modal <dialog> (the page is inert while it's open, Esc closes it, the page
 * doesn't scroll behind it, focus goes back to the card), and photo sets in the zoom viewer
 * (components/media/ZoomGallery, 13 Oct 2026), flying out of `origin`. Loaded only when someone
 * opens a card.
 */
export function MediaViewer({
  play,
  onClose,
  origin,
}: {
  play: Playable;
  onClose: () => void;
  /** The thumbnail the first photo flies out of. */
  origin?: () => HTMLElement | null | undefined;
}) {
  if (play.type === "photos")
    return (
      <ZoomGallery
        photos={play.photos.map((p) => ({ ...p, ...sized(p.src) }))}
        title={play.title}
        onClose={onClose}
        originFor={(i) => (i === 0 ? origin?.() : null)}
      />
    );
  return <Player play={play} onClose={onClose} />;
}

/** Optimised sizes: about 1920px wide for the stage, 96px for the strip (next/image). */
function sized(src: string) {
  const at = (width: number) =>
    getImageProps({ src, alt: "", width, height: Math.round(width / 1.5) }).props.src;
  return { src: at(960), thumb: at(48) };
}

function Player({
  play,
  onClose,
}: {
  play: Exclude<Playable, { type: "photos" }>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Close the modal first: while it's open the page is inert and can't take focus back.
  const close = () => {
    ref.current?.close();
    onClose();
  };

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = was;
    };
  }, []);

  const label = play.title;
  return (
    <dialog
      ref={ref}
      className={`mv mv-${play.type}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="mv-bar">
        <span className="mv-title">{play.title}</span>
        <button type="button" className="mv-close" onClick={close} aria-label="Close">
          ×
        </button>
      </div>
      {play.type === "file" ? (
        <div className="mv-stage" style={{ aspectRatio: play.ratio }} data-ratio={play.ratio}>
          <ModalVideo src={play.src} poster={play.poster} />
        </div>
      ) : play.type === "embed" ? (
        <div className="mv-stage" style={{ aspectRatio: play.ratio }} data-ratio={play.ratio}>
          <iframe
            src={play.src}
            title={play.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
          />
        </div>
      ) : (
        <>
          <div className="mv-stage" style={{ aspectRatio: "16 / 9" }} data-ratio="16 / 9">
            <iframe
              src={play.src}
              title={`${play.title}, 360 tour`}
              allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; magnetometer"
              allowFullScreen
            />
          </div>
          <a className="mv-out" href={play.href} target="_blank" rel="noopener noreferrer">
            Open full screen ↗
          </a>
        </>
      )}
    </dialog>
  );
}

/** Opened by a click, so it starts with sound (unless turned off); same controls as the cards. */
function ModalVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const sound = useSound();
  const on = useRef(sound.on);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !on.current;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, []);
  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        loop
        onClick={(e) => {
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
          else v.pause();
        }}
      />
      <VideoControls video={ref} />
    </>
  );
}
