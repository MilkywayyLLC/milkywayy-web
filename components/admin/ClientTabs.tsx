"use client";

import { useState } from "react";

/**
 * The client page's tabs (admin redesign, 27 Oct 2026). Every panel is rendered once and only
 * hidden, so unsaved edits survive a tab switch; `?tab=` keeps the place on reload.
 */
export function ClientTabs({
  initial,
  tabs,
}: {
  initial: string;
  tabs: { key: string; label: string; node: React.ReactNode }[];
}) {
  const [tab, setTab] = useState(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);
  const go = (k: string) => {
    setTab(k);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u);
  };
  return (
    <>
      <div className="ad-tabs" role="tablist" aria-label="Client sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-controls={`panel-${t.key}`}
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`panel-${t.key}`}
          aria-labelledby={`tab-${t.key}`}
          hidden={tab !== t.key}
          className="ad-stack-16"
        >
          {t.node}
        </div>
      ))}
    </>
  );
}
