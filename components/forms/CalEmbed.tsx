"use client";

import { useEffect } from "react";
import { calUrl } from "@/lib/leads/client";

/**
 * The 15-minute call calendar (Cal.com, NEXT_PUBLIC_CAL_LINK), prefilled with the visitor's name,
 * email and lead ref. When Cal.com reports a booking, the lead is marked "call booked".
 */
export function CalEmbed({
  link,
  name,
  email,
  reference,
  onBooked,
}: {
  link: string;
  name?: string;
  email?: string;
  reference: string;
  onBooked?: () => void;
}) {
  const src = calUrl(link, { name, email, notes: `Ref ${reference}` });
  const origin = new URL(src).origin;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin && !/(^|\.)cal\.com$/.test(new URL(e.origin).hostname)) return;
      if (!JSON.stringify(e.data ?? "").includes("bookingSuccessful")) return;
      fetch("/api/lead/booked", { method: "POST", body: JSON.stringify({ ref: reference }) }).catch(
        () => {},
      );
      onBooked?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, reference, onBooked]);
  return (
    <iframe
      className="cal-frame"
      src={src}
      title="Pick a time for a 15-minute call"
      loading="lazy"
    />
  );
}
