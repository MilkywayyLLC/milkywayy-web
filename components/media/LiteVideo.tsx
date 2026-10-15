"use client";

import { fileVideoUrl, isFileVideo } from "@/lib/media-ref";
import type { Playable } from "@/lib/playable";
import { embedUrl } from "@/lib/video";
import { MediaOpen } from "./MediaOpen";

/**
 * A video that plays in its own frame (the showreel, the AI avatars hero): the shared player
 * (MediaOpen) over the poster. Takes a YouTube/Vimeo link or a file we host ("r2:<key>").
 * Renders nothing when there is no playable video. Render inside a MediaFrame.
 */
export function LiteVideo({
  video,
  title,
  ratio = "16 / 9",
  poster,
}: {
  video?: string;
  title: string;
  ratio?: string;
  poster?: string;
}) {
  if (!video) return null;
  let play: Playable | undefined;
  if (isFileVideo(video)) play = { type: "file", title, src: fileVideoUrl(video), ratio, poster };
  else {
    const src = embedUrl(video);
    if (src) play = { type: "embed", title, src, ratio };
  }
  return play ? <MediaOpen play={play} /> : null;
}
