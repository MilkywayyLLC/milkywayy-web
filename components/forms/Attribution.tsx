"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/leads/client";

/** Remembers where this visit came from (UTM, referrer, landing page) for any lead sent later. */
export function Attribution() {
  useEffect(captureAttribution, []);
  return null;
}
