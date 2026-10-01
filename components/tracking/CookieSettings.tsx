"use client";

import { useSyncExternalStore } from "react";
import { trackingConfig } from "@/lib/tracking/config";

const noop = () => () => {};

/** Footer link that reopens the cookie choice (only when tracking is active on this site). */
export function CookieSettings() {
  const on = useSyncExternalStore(
    noop,
    () => !!trackingConfig(),
    () => false,
  );
  if (!on) return null;
  return (
    <button
      type="button"
      className="lnk-btn"
      onClick={() => dispatchEvent(new Event("mw:cookie-settings"))}
    >
      Cookie settings
    </button>
  );
}
