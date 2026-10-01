"use client";

import { useState } from "react";
import { embedUrl } from "@/lib/video";

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
