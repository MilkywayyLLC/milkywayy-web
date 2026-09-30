"use client";

import { useState } from "react";

/**
 * Turn a stored video reference into an embeddable player URL that autoplays after the click.
 * Accepts YouTube and Vimeo links, Bunny Stream embed URLs, or "bunny:<libraryId>/<videoId>".
 */
export function embedUrl(video: string): string | null {
  const yt = video.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1`;
  const vimeo = video.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&dnt=1`;
  const bunny = video.match(/^bunny:(\d+)\/([\w-]+)$/);
  if (bunny) return `https://iframe.mediadelivery.net/embed/${bunny[1]}/${bunny[2]}?autoplay=true`;
  if (video.startsWith("https://iframe.mediadelivery.net/embed/")) return video;
  return null;
}

/**
 * Click-to-play: renders a square play button over the poster; the player loads only on click
 * (guide §2 "Video"). Render inside a ViewfinderFrame. Without a playable video it renders
 * nothing interactive, so a placeholder never shows a dead button.
 */
export function LiteVideo({ video, title }: { video?: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const src = video ? embedUrl(video) : null;
  if (!src) return <span className="play" aria-hidden="true" style={{ opacity: 0.55 }} />;
  if (playing) {
    return (
      <iframe
        src={src}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          zIndex: 6,
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="play"
      aria-label={`Play ${title}`}
      onClick={() => setPlaying(true)}
    />
  );
}
