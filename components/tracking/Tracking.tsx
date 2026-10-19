"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { trackingConfig, type TrackingConfig } from "@/lib/tracking/config";
import { consent, dropQueue, markReady, track } from "@/lib/tracking/events";

/**
 * Meta Pixel, GA4 and Clarity (guide §13), loaded only after the page is interactive and the
 * browser is idle, and only with consent: visitors in the EU/EEA, UK and Switzerland choose in
 * a small banner first (opt-in); everyone else is tracked by default, with the privacy notice
 * linked in the footer. Nothing loads on staging or locally unless test mode is on.
 */
const SERVICE_PAGES: Record<string, string> = {
  "/production": "Production",
  "/property-shoots": "Property shoots",
  "/post-production": "Post-production",
  "/ai-avatars": "AI avatars",
};

type W = Window & Record<string, unknown>;

function script(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function load(c: TrackingConfig) {
  const w = window as unknown as W;
  if (w.__mwLoaded) return;
  w.__mwLoaded = true;
  if (c.pixel) {
    // Meta's standard stub: calls queue until fbevents.js arrives.
    const f = function (...args: unknown[]) {
      const fn = f as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
      if (fn.callMethod) fn.callMethod(...args);
      else fn.queue.push(args);
    } as unknown as Record<string, unknown> & ((...a: unknown[]) => void);
    Object.assign(f, { push: f, loaded: true, version: "2.0", queue: [] });
    w.fbq = f;
    w._fbq = f;
    script("https://connect.facebook.net/en_US/fbevents.js");
    f("init", c.pixel);
  }
  if (c.ga) {
    const dl = ((w.dataLayer as unknown[]) ??= []);
    w.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      dl.push(arguments);
    };
    const gtag = w.gtag as (...a: unknown[]) => void;
    gtag("js", new Date());
    gtag("config", c.ga, {
      send_page_view: false,
      ...(c.mode === "test" ? { debug_mode: true } : {}),
    });
    script(`https://www.googletagmanager.com/gtag/js?id=${c.ga}`);
  }
  if (c.clarity) {
    const cl = (w.clarity ??= function (...a: unknown[]) {
      ((cl as unknown as { q?: unknown[] }).q ??= []).push(a);
    }) as (...a: unknown[]) => void;
    script(`https://www.clarity.ms/tag/${c.clarity}`);
  }
  markReady();
}

async function needsConsent(): Promise<boolean> {
  try {
    const cached = sessionStorage.getItem("mw-geo");
    if (cached) return cached === "1";
  } catch {}
  const r = await fetch("/api/geo")
    .then((x) => x.json())
    .catch(() => ({ consentRequired: true }));
  try {
    sessionStorage.setItem("mw-geo", r.consentRequired ? "1" : "0");
  } catch {}
  return !!r.consentRequired;
}

/**
 * Not on listing share pages (/l/, /c/): those are the agents' pages, seen by their buyers. Our
 * tags stay off them, and a buyer's WhatsApp tap to an agent must never count as our Contact.
 */
export function Tracking() {
  const path = usePathname();
  return /^\/(l|c)\//.test(path) ? null : <SiteTracking path={path} />;
}

function SiteTracking({ path }: { path: string }) {
  const [cfg, setCfg] = useState<TrackingConfig | null>(null);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    const c = trackingConfig();
    if (!c) return;
    const start = async () => {
      setCfg(c);
      const stored = consent();
      if (stored === "denied") return dropQueue();
      if (stored === "granted" || !(await needsConsent())) return load(c);
      setBanner(true);
    };
    const idle = () =>
      "requestIdleCallback" in window
        ? requestIdleCallback(() => start(), { timeout: 3000 })
        : setTimeout(start, 1);
    if (document.readyState === "complete") idle();
    else addEventListener("load", idle, { once: true });
    const reopen = () => setBanner(true);
    addEventListener("mw:cookie-settings", reopen);
    return () => removeEventListener("mw:cookie-settings", reopen);
  }, []);

  // Page views on every route change; ViewContent on the four service pages.
  useEffect(() => {
    track("PageView");
    if (SERVICE_PAGES[path])
      track("ViewContent", { content_name: SERVICE_PAGES[path], content_category: "service" });
  }, [path]);

  // Contact: any WhatsApp, phone or email link, anywhere on the site.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a[href]")?.getAttribute("href") ?? "";
      const method = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)
        ? "whatsapp"
        : href.startsWith("tel:")
          ? "call"
          : href.startsWith("mailto:")
            ? "email"
            : null;
      if (method) track("Contact", { method, page: location.pathname });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!banner || !cfg) return null;
  const choose = (value: "granted" | "denied") => {
    try {
      localStorage.setItem("mw-consent", value);
    } catch {}
    setBanner(false);
    if (value === "granted") return load(cfg);
    dropQueue();
    // Already loaded (changed their mind from "Cookie settings"): tell each tag to stop.
    const w = window as unknown as Record<string, ((...a: unknown[]) => void) | undefined>;
    w.fbq?.("consent", "revoke");
    w.gtag?.("consent", "update", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    w.clarity?.("consent", false);
  };
  return (
    <div className="consent" role="dialog" aria-label="Cookie choice" aria-live="polite">
      <p>
        We&apos;d like to use cookies to measure visits and improve our ads.{" "}
        <a href="/privacy#cookies">Privacy notice</a>
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-p" onClick={() => choose("granted")}>
          Accept
        </button>
        <button type="button" className="btn btn-g" onClick={() => choose("denied")}>
          Reject
        </button>
      </div>
    </div>
  );
}
