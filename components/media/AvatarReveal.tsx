"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import type { AvatarHero } from "@/content/types";
import { LiteVideo } from "./LiteVideo";
import { MediaFrame } from "./MediaFrame";

/**
 * AI avatars hero reveal (guide §6.5): "Show me the reveal" overlays "100% AI" on the Adam frame.
 * The button sits in the hero's CTA row and the frame in the other column, so they share state
 * through a small context: wrap the hero in <RevealProvider>, then place <RevealButton> and
 * <AvatarStage> wherever they belong.
 */
const RevealContext = createContext<{ on: boolean; toggle: () => void; id: string }>({
  on: false,
  toggle: () => {},
  id: "avatar-reveal",
});

export function RevealProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  const id = useId();
  return (
    <RevealContext.Provider value={{ on, toggle: () => setOn((v) => !v), id }}>
      {children}
    </RevealContext.Provider>
  );
}

export function RevealButton() {
  const { on, toggle, id } = useContext(RevealContext);
  return (
    <button
      type="button"
      className="btn btn-g"
      aria-pressed={on}
      aria-controls={id}
      onClick={toggle}
    >
      {on ? "Hide the reveal" : "Show me the reveal"}
    </button>
  );
}

export function AvatarStage({ hero, priority }: { hero: AvatarHero; priority?: boolean }) {
  const { on, id } = useContext(RevealContext);
  return (
    <div className="av-stage">
      <MediaFrame
        media={hero.poster}
        timecode={hero.timecode}
        priority={priority}
        sizes="(max-width: 860px) 100vw, 50vw"
      >
        <p className="caption">
          “{hero.captionLead} <b>{hero.captionHighlight}</b>”
        </p>
        {hero.clip && <LiteVideo video={hero.clip} title={`${hero.name}, AI presenter`} />}
      </MediaFrame>
      <div className={on ? "reveal on" : "reveal"} id={id} aria-live="polite">
        <div aria-hidden={!on}>
          <b>{hero.revealTitle}</b>
          <span>{hero.revealText}</span>
        </div>
      </div>
    </div>
  );
}
