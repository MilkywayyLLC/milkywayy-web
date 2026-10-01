/**
 * Tracking switches (guide §13). NEXT_PUBLIC_TRACKING: "on" (production default), "test" (loads
 * the tags in debug/test mode, for checking events before launch) or "off" (staging and local
 * default: nothing loads). A tag whose ID is missing never loads.
 *
 * Outside production, a `mw-tracking-test` cookie can supply IDs for automated tests (they stub
 * the third-party scripts), so tracking can be tested without rebuilding. Ignored in production.
 */
export type TrackingConfig = { mode: "on" | "test"; pixel?: string; ga?: string; clarity?: string };

const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
const mode = (process.env.NEXT_PUBLIC_TRACKING || (isProd ? "on" : "off")) as "on" | "test" | "off";

export function trackingConfig(): TrackingConfig | null {
  if (!isProd && typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|; )mw-tracking-test=([^;]+)/);
    if (m)
      try {
        return { mode: "test", ...JSON.parse(decodeURIComponent(m[1])) };
      } catch {}
  }
  if (mode === "off") return null;
  const cfg = {
    mode,
    pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID || undefined,
    ga: process.env.NEXT_PUBLIC_GA4_ID || undefined,
    clarity: process.env.NEXT_PUBLIC_CLARITY_ID || undefined,
  };
  return cfg.pixel || cfg.ga || cfg.clarity ? cfg : null;
}

/** EU/EEA, UK and Switzerland: opt-in consent banner (owner, 2 Oct 2026). */
export const CONSENT_REGIONS = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(
    " ",
  ),
);
