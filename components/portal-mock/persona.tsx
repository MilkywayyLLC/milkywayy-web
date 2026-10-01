"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ACCOUNTS, type Persona } from "@/lib/portal-mock/data";

/** Which mock client the preview shows (all three services / shoots only / post-production only). */
const Ctx = createContext<{ persona: Persona; setPersona: (p: Persona) => void }>({
  persona: "all",
  setPersona: () => {},
});

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, set] = useState<Persona>("all");
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("as") as Persona | null;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("mw-portal-persona");
    } catch {}
    const p = (q ?? saved) as Persona | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL/storage after hydration
    if (p && p in ACCOUNTS) set(p);
  }, []);
  const setPersona = (p: Persona) => {
    set(p);
    try {
      localStorage.setItem("mw-portal-persona", p);
    } catch {}
  };
  return <Ctx.Provider value={{ persona, setPersona }}>{children}</Ctx.Provider>;
}

export const usePersona = () => {
  const { persona, setPersona } = useContext(Ctx);
  return { persona, setPersona, account: ACCOUNTS[persona] };
};
