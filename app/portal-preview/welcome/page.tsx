"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePersona } from "@/components/portal-mock/persona";
import type { Persona } from "@/lib/portal-mock/data";

const SERVICES = [
  ["shoots", "Property shoots", "Photos, video, 360 tours in Dubai"],
  ["production", "Production", "Brand and commercial content"],
  ["post", "Post-production", "Send us footage, we edit"],
  ["avatars", "AI avatars", "Videos with an AI presenter"],
] as const;

export default function Welcome() {
  const router = useRouter();
  const { setPersona } = usePersona();
  const [kind, setKind] = useState<"individual" | "company" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (s: string) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const finish = () => {
    // Mockup: pick the closest sample client so the tabs match what was chosen.
    const p: Persona =
      picked.length === 1 && picked[0] === "post"
        ? "post"
        : picked.every((x) => x === "shoots" || x === "production")
          ? "shoots"
          : "all";
    setPersona(p);
    router.push("/portal-preview/home");
  };

  return (
    <main className="pt-auth" id="main">
      <div className="pt-card" style={{ width: "min(560px, 100%)" }}>
        <span className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </span>
        <div>
          <span className="pt-eb">Welcome · 3 quick questions</span>
          <h1 className="pt-h1">Set up your portal</h1>
        </div>
        <div className="pt-card" style={{ background: "var(--bg)", padding: 12 }}>
          <b className="pt-small">We found 2 earlier bookings with this number.</b>
          <span className="pt-meta">They’ll be in Shoots when you’re done.</span>
        </div>

        <form className="pt-form" onSubmit={(e) => (e.preventDefault(), finish())}>
          <div className="pt-field">
            1. Are you booking as an individual or a company?
            <div className="pt-choice two">
              <button
                type="button"
                aria-pressed={kind === "individual"}
                onClick={() => setKind("individual")}
              >
                Individual
                <small>Just me</small>
              </button>
              <button
                type="button"
                aria-pressed={kind === "company"}
                onClick={() => setKind("company")}
              >
                Company
                <small>A brokerage, agency or brand, with a team</small>
              </button>
            </div>
          </div>

          {kind && (
            <div className="pt-field">
              2. {kind === "company" ? "About the company" : "Your name"}
              {kind === "company" ? (
                <div className="pt-form" style={{ gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Company name"
                    aria-label="Company name"
                    required
                  />
                  <select aria-label="What you do" defaultValue="">
                    <option value="" disabled>
                      What you do
                    </option>
                    {[
                      "Real estate brokerage",
                      "Developer",
                      "Holiday homes",
                      "Agency",
                      "Brand",
                      "Creator",
                      "Other",
                    ].map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Roughly how much do you need a month? e.g. 6 shoots"
                    aria-label="Monthly volume"
                  />
                </div>
              ) : (
                <input type="text" placeholder="Full name" aria-label="Full name" required />
              )}
            </div>
          )}

          {kind && (
            <div className="pt-field">
              3. What are you here for? (pick any)
              <div className="pt-choice two">
                {SERVICES.map(([id, label, sub]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={picked.includes(id)}
                    onClick={() => toggle(id)}
                  >
                    {label}
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-p" disabled={!kind || picked.length === 0}>
            Go to my portal
          </button>
        </form>
      </div>
    </main>
  );
}
