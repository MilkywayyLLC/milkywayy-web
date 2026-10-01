"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/leads/client";

/** Remembers where this visit came from (UTM, referrer, landing page) for any lead sent later. */
export function Attribution() {
  useEffect(captureAttribution, []);
  // Report errors from our own scripts (not extensions) so they reach the owner as alerts.
  useEffect(() => {
    let sent = 0;
    const report = (message: string, source?: string) => {
      if (sent++ > 2 || !source?.startsWith(location.origin)) return;
      navigator.sendBeacon?.(
        "/api/client-error",
        new Blob(
          [JSON.stringify({ message: message.slice(0, 400), source, page: location.pathname })],
          { type: "application/json" },
        ),
      );
    };
    const onError = (e: ErrorEvent) => report(e.message, e.filename);
    const onRejection = (e: PromiseRejectionEvent) => {
      const stack = String((e.reason as Error)?.stack ?? "");
      const src = stack.match(/https?:\/\/[^\s)]+\/_next\/[^\s):]+/)?.[0];
      report(String((e.reason as Error)?.message ?? e.reason), src);
    };
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      removeEventListener("error", onError);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
