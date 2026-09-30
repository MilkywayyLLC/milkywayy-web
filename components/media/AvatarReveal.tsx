"use client";

import { useState } from "react";
import type { Media } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { ViewfinderFrame } from "./ViewfinderFrame";

/**
 * AI avatars hero: the Adam frame plus the "Show me the reveal" overlay (guide §6.5).
 * Phase 4 lifts the toggle into the hero CTA row; for now it sits under the frame.
 */
export function AvatarReveal({
  media,
  captionLead,
  captionHighlight,
  revealTitle = "100% AI",
  revealText = "Face, voice and gestures generated · edited by Milkywayy",
}: {
  media: Media;
  captionLead: string;
  captionHighlight: string;
  revealTitle?: string;
  revealText?: string;
}) {
  const [on, setOn] = useState(false);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="av-stage">
        <ViewfinderFrame media={media} clean timecode="REC 00:00:07:12">
          <p className="caption">
            “{captionLead} <b>{captionHighlight}</b>”
          </p>
        </ViewfinderFrame>
        <div className={on ? "reveal on" : "reveal"} aria-live="polite">
          <div aria-hidden={!on}>
            <b>{revealTitle}</b>
            <span>{revealText}</span>
          </div>
        </div>
      </div>
      <div className="ctas">
        <Button variant="ghost" aria-pressed={on} onClick={() => setOn((v) => !v)}>
          {on ? "Hide the reveal" : "Show me the reveal"}
        </Button>
      </div>
    </div>
  );
}
