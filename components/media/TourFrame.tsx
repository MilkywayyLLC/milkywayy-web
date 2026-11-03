"use client";

import { useEffect, useState } from "react";

/** How long a tour gets before we offer the new tab. Cross-origin frames don't report errors. */
const GIVE_UP_MS = 20000;

/**
 * Every 360 tour embed: a loading state over the frame until it loads, and after 20 seconds a
 * failure message with "Open in new tab". A slow tour that loads after that still replaces it.
 */
export function TourFrame({
  src,
  href,
  title,
  allow,
  className,
}: {
  src: string;
  /** The tour's own link, for the new tab. */
  href: string;
  title: string;
  allow: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={className ? `tour-box ${className}` : "tour-box"}>
      <iframe
        src={src}
        title={title}
        allow={allow}
        allowFullScreen
        onLoad={() => setState("loaded")}
      />
      {state !== "loaded" && (
        <div className="tour-state" role="status">
          {state === "loading" ? (
            <>
              <span className="tour-spin" aria-hidden="true" />
              <span>Loading the 360 tour…</span>
            </>
          ) : (
            <>
              <span>This tour didn&apos;t load here.</span>
              <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-p">
                Open in new tab ↗
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
