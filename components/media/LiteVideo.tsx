"use client";

import { useState } from "react";
import { fileVideoUrl, isFileVideo } from "@/lib/media-ref";
import { embedUrl } from "@/lib/video";

/**
 * Plays in place (the showreel, the AI avatars hero): a square play button over the poster; the
 * player loads only on click (guide §2 "Video"), so the poster is all the page loads. Takes a
 * YouTube/Vimeo link or a file we host ("r2:<key>"). Render inside a MediaFrame. Without a
 * playable video it renders nothing interactive, so a placeholder never shows a dead button.
 */
export function LiteVideo({ video, title }: { video?: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const file = isFileVideo(video) ? fileVideoUrl(video!) : null;
  const src = file ?? (video ? embedUrl(video) : null);
  if (!src) return <span className="play" aria-hidden="true" style={{ opacity: 0.55 }} />;
  if (playing) {
    const fill = {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      border: 0,
      zIndex: 6,
      background: "#000",
    } as const;
    return file ? (
      <video src={file} title={title} controls autoPlay playsInline style={fill} />
    ) : (
      <iframe
        src={src}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        style={fill}
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
