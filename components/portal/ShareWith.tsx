"use client";

import { useState, useTransition } from "react";
import { setShareWith } from "@/lib/portal/account-actions";
import type { Teammate } from "@/lib/portal/agents";
import { useToast } from "./ui";

/** "Share with" (Owner/Admins): teammates who can view, download and share this item. */
export function ShareWith({
  kind,
  id,
  team,
  chosen,
}: {
  kind: "p" | "l";
  id: string;
  team: Teammate[];
  chosen: string[];
}) {
  const [picked, setPicked] = useState<string[]>(chosen);
  const [pending, start] = useTransition();
  const [toast, say] = useToast();
  const toggle = (u: string) =>
    setPicked((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]));
  return (
    <details className="pt-card" data-testid="share-with">
      <summary>
        <b>Share with</b>{" "}
        <span className="pt-meta">
          {picked.length ? `Shared with ${picked.length}` : "Only people who already see it"}
        </span>
      </summary>
      <div
        className="pt-form"
        style={{ gap: 4, marginTop: 8 }}
        role="group"
        aria-label="Share with"
      >
        {team.map((t) => (
          <label key={t.id} className="pt-check">
            <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />{" "}
            {t.name}
          </label>
        ))}
        <span className="pt-meta">They can view, download and create or copy share links.</span>
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setShareWith(kind, id, picked);
              say(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
            })
          }
        >
          Save
        </button>
      </div>
      {toast}
    </details>
  );
}
