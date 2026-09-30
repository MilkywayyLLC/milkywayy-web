"use client";

import { useEffect, useState } from "react";

type Show = "both" | "dark" | "light";

/** Review aid: show both tones, or only one (handy on a phone). */
export function ToneToggle() {
  const [show, setShow] = useState<Show>("both");

  useEffect(() => {
    document.querySelector(".sg")?.setAttribute("data-show", show);
  }, [show]);

  return (
    <div className="chips" role="group" aria-label="Tones to show">
      {(["both", "dark", "light"] as const).map((s) => (
        <button
          key={s}
          type="button"
          className="chip"
          aria-pressed={show === s}
          onClick={() => setShow(s)}
        >
          {s === "both" ? "Both tones" : s === "dark" ? "Dark only" : "Light only"}
        </button>
      ))}
    </div>
  );
}
