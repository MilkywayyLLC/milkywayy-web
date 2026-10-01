"use client";

import { useState, useTransition } from "react";
import { setProofStrip } from "@/lib/admin/actions";
import { PAGES } from "@/lib/admin/sections";

/** Which pages show the client proof strip (live as soon as it's toggled). */
export function ProofStrip({ initial }: { initial: Record<string, boolean> }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string>();
  const [, start] = useTransition();
  return (
    <section className="ad-card" aria-label="Proof strip">
      <h2 className="ad-h2">Proof strip on</h2>
      <div className="ad-checks">
        {PAGES.filter((p) => p.value in on).map((p) => (
          <label key={p.value} className="ad-check">
            <input
              type="checkbox"
              checked={on[p.value]}
              onChange={(e) => {
                const enabled = e.target.checked;
                setOn((cur) => ({ ...cur, [p.value]: enabled }));
                start(async () => {
                  const r = await setProofStrip(p.value, enabled);
                  if (!r.ok) setOn((cur) => ({ ...cur, [p.value]: !enabled }));
                  setMsg(
                    r.ok
                      ? `${p.label}: ${enabled ? "shown" : "hidden"}. Live in a few seconds.`
                      : r.error,
                  );
                });
              }}
            />
            <span>{p.label}</span>
          </label>
        ))}
      </div>
      <p className="ad-status" role="status">
        {msg}
      </p>
    </section>
  );
}
