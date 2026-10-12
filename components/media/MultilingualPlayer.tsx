"use client";

import { useRef, useState } from "react";

/**
 * AI avatars → Multilingual: one video, a language pill per version. Switching swaps the source
 * and carries on from the same second (and keeps playing if it was).
 */
export function MultilingualPlayer({
  versions,
  poster,
  title,
}: {
  versions: { language: string; src: string }[];
  poster?: string;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [lang, setLang] = useState(0);

  const pick = (i: number) => {
    const v = ref.current;
    if (!v || i === lang) return;
    const at = v.currentTime;
    const wasPlaying = !v.paused;
    setLang(i);
    v.src = versions[i].src;
    const resume = () => {
      v.currentTime = Math.min(at, v.duration || at);
      if (wasPlaying) v.play().catch(() => {});
    };
    v.addEventListener("loadedmetadata", resume, { once: true });
  };

  return (
    <div className="ml-player">
      <video
        ref={ref}
        src={versions[0].src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        aria-label={`${title}, ${versions[lang].language}`}
      />
      <div className="ml-pills" role="group" aria-label="Language">
        {versions.map((v, i) => (
          <button
            key={v.language}
            type="button"
            className="ml-pill"
            aria-pressed={i === lang}
            onClick={() => pick(i)}
          >
            {v.language}
          </button>
        ))}
      </div>
    </div>
  );
}
