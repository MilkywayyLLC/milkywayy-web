/**
 * Events to Meta Pixel and GA4 (guide §13). Calls made before the tags have loaded (or before
 * consent) wait in a queue; if consent is refused, the queue is dropped. Lead and Schedule carry
 * the lead's MW reference as the event id, so Meta de-duplicates them with the server's
 * Conversions API events.
 */
export type TrackEvent = "PageView" | "ViewContent" | "Lead" | "Contact" | "Schedule";
type Call = [TrackEvent, Record<string, unknown>, string | undefined];

type W = Window & {
  fbq?: (...a: unknown[]) => void;
  gtag?: (...a: unknown[]) => void;
  __mwTrack?: { ready: boolean; queue: Call[] };
};
const state = () => {
  const w = window as W;
  return (w.__mwTrack ??= { ready: false, queue: [] });
};

const GA_NAME: Record<TrackEvent, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Lead: "generate_lead",
  Contact: "contact",
  Schedule: "schedule",
};

function send([event, params, eventId]: Call) {
  const w = window as W;
  w.fbq?.("track", event, params, eventId ? { eventID: eventId } : undefined);
  w.gtag?.("event", GA_NAME[event], {
    ...params,
    ...(event === "PageView" ? { page_location: location.href, page_title: document.title } : {}),
    ...(eventId ? { event_id: eventId, lead_ref: eventId } : {}),
  });
}

export function track(event: TrackEvent, params: Record<string, unknown> = {}, eventId?: string) {
  if (typeof window === "undefined") return;
  const s = state();
  if (s.ready) send([event, params, eventId]);
  else if (s.queue.length < 50) s.queue.push([event, params, eventId]);
}

/** Tags loaded with consent: send what was queued (always including this page's view). */
export function markReady() {
  const s = state();
  s.ready = true;
  const queued = s.queue.splice(0);
  if (!queued.some((c) => c[0] === "PageView")) queued.unshift(["PageView", {}, undefined]);
  queued.forEach(send);
}

export function dropQueue() {
  state().queue.length = 0;
}

/** Consent: "granted" | "denied", or null when not asked yet. */
export function consent(): "granted" | "denied" | null {
  try {
    return (localStorage.getItem("mw-consent") as "granted" | "denied" | null) ?? null;
  } catch {
    return null;
  }
}

/** What the server needs for the Conversions API (only when the visitor allows tracking). */
export function capiContext() {
  const c = consent();
  const allowed = c === "granted" || (c === null && (window as W).__mwTrack?.ready === true);
  if (!allowed) return { consent: false };
  const cookie = (n: string) => document.cookie.match(new RegExp(`(?:^|; )${n}=([^;]+)`))?.[1];
  return { consent: true, fbp: cookie("_fbp"), fbc: cookie("_fbc") };
}
