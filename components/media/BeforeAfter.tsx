"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { BeforeAfterPair, Media } from "@/content/types";
import { cx } from "@/lib/cx";

function Layer({ media, filter }: { media: Media; filter?: string }) {
  const ph = !media.src && media.placeholder ? `ph-${media.placeholder}` : undefined;
  return (
    <div className={cx("lyr", ph)} style={filter ? { filter } : undefined}>
      {media.src && (
        <Image src={media.src} alt={media.alt} fill sizes="(max-width: 900px) 100vw, 60vw" />
      )}
    </div>
  );
}

/**
 * Drag-to-compare slider. A full-size transparent range input drives it, so pointer, touch and
 * keyboard (arrow keys, Home/End) all work natively. "After" is revealed from the left.
 */
export function BeforeAfter({ pair, className }: { pair: BeforeAfterPair; className?: string }) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <div className={cx("ba", className)} style={{ ["--pos" as string]: `${pos}%` }}>
      <Layer media={pair.before} filter={pair.placeholderBeforeFilter} />
      <div className="clip">
        <Layer media={pair.after} />
      </div>
      <span className="handle" aria-hidden="true" />
      <span className="knob" aria-hidden="true">
        ↔
      </span>
      <span className="lab l" aria-hidden="true">
        After
      </span>
      <span className="lab r" aria-hidden="true">
        Before
      </span>
      <label className="sr" htmlFor={id}>
        {`Compare before and after: ${pair.title}`}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-valuetext={`${pos}% after`}
        onChange={(e) => setPos(Number(e.target.value))}
      />
    </div>
  );
}
