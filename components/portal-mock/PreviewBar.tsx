"use client";

import Link from "next/link";
import type { Persona } from "@/lib/portal-mock/data";
import { usePersona } from "./persona";

const OPTIONS: [Persona, string][] = [
  ["all", "All three services"],
  ["shoots", "Shoots only"],
  ["post", "Post-production only"],
];

/** Mockup controls (not part of the portal): which client you're viewing as, and the screen list. */
export function PreviewBar() {
  const { persona, setPersona } = usePersona();
  return (
    <div className="pt-mock" role="region" aria-label="Mockup controls">
      <Link href="/portal-preview" className="pt-mock-tag">
        Screens
      </Link>
      <label className="pt-mock-as">
        <span>View as</span>
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value as Persona)}
          aria-label="View the portal as"
        >
          {OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
