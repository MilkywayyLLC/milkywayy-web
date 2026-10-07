"use client";

import Image, { getImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { Playable } from "@/lib/playable";

const STAGE_SIZES = "(max-width: 900px) 100vw, 80vw";

/**
 * The one modal behind every card (owner, 7 Oct 2026): the photo lightbox, the 9:16 / 16:9 video
 * player and the 360 tour. A native modal <dialog>: the rest of the page is inert while it's open
 * (focus stays inside), Esc closes it, the page doesn't scroll behind it, and focus goes back to
 * the card that opened it (MediaOpen). Loaded only when someone opens a card.
 */
export function MediaViewer({ play, onClose }: { play: Playable; onClose: () => void }) {
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

  const label = play.type === "photos" ? `${play.title}: photos` : play.title;
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
      {play.type === "photos" ? (
        <Lightbox photos={play.photos} title={play.title} />
      ) : play.type === "file" ? (
        <div className="mv-stage" style={{ aspectRatio: play.ratio }} data-ratio={play.ratio}>
          {/* Opened by a click, so it may start with sound; controls let people mute. */}
          <video src={play.src} poster={play.poster} controls autoPlay playsInline />
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

function Lightbox({ photos, title }: { photos: { src: string; alt: string }[]; title: string }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const strip = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  // Keyboard: ← → move (Esc is the dialog's own).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);

  // Only the neighbours are fetched ahead, at the size the stage will ask for.
  useEffect(() => {
    if (n < 2) return;
    for (const j of new Set([(i + 1) % n, (i - 1 + n) % n])) {
      const { props } = getImageProps({
        src: photos[j].src,
        alt: "",
        fill: true,
        sizes: STAGE_SIZES,
      });
      const img = new window.Image();
      img.sizes = STAGE_SIZES;
      if (props.srcSet) img.srcset = props.srcSet;
      img.src = props.src;
    }
    strip.current
      ?.querySelector<HTMLElement>(`[data-i="${i}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [i, n, photos]);

  const start = (e: PointerEvent) => (down.current = { x: e.clientX, y: e.clientY });
  const end = (e: PointerEvent) => {
    const s = down.current;
    down.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  };

  const p = photos[i];
  return (
    <div className="lb">
      <div
        className="mv-stage lb-stage"
        style={{ aspectRatio: "3 / 2" }}
        data-ratio="3 / 2"
        onPointerDown={start}
        onPointerUp={end}
        onPointerCancel={() => (down.current = null)}
      >
        <Image
          key={p.src}
          src={p.src}
          alt={p.alt}
          fill
          sizes={STAGE_SIZES}
          style={{ objectFit: "contain" }}
          priority
          draggable={false}
        />
        {n > 1 && (
          <>
            <button
              type="button"
              className="lb-nav prev"
              aria-label="Previous photo"
              onClick={() => go(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="lb-nav next"
              aria-label="Next photo"
              onClick={() => go(1)}
            >
              ›
            </button>
          </>
        )}
      </div>
      <p className="lb-count" aria-live="polite">
        <span className="sr">{title}, photo </span>
        {i + 1} / {n}
      </p>
      {n > 1 && (
        <div className="lb-thumbs" ref={strip} role="group" aria-label="All photos">
          {photos.map((t, j) => (
            <button
              type="button"
              key={t.src + j}
              data-i={j}
              aria-label={`Photo ${j + 1} of ${n}`}
              aria-current={j === i ? "true" : undefined}
              onClick={() => setI(j)}
            >
              <Image src={t.src} alt="" width={96} height={64} sizes="96px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
