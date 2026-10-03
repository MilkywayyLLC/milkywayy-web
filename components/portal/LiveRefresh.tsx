"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const url =
  process.env.NEXT_PUBLIC_PORTAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/**
 * Live updates (CLIENT_PORTAL_GUIDE §4.3): when Milkywayy changes a status, publishes a delivery or
 * replies, the page refreshes itself. Supabase Realtime only streams rows this client may read
 * (row-level security applies to the stream too).
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    if (!url || !key) return;
    const db = createBrowserClient(url, key);
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 400);
    };
    const channel = db.channel("portal-live");
    for (const table of [
      "projects",
      "project_events",
      "project_messages",
      "project_files",
      "project_scripts",
    ])
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    return () => {
      clearTimeout(t);
      db.removeChannel(channel);
    };
  }, [router]);
  return null;
}
