/**
 * Activity rows (phase 1 part 8): one compact line each, icon · text · "27 Oct, 05:19", on the
 * shoot page and Home.
 */
export type ActivityIcon =
  | "download"
  | "calendar"
  | "upload"
  | "check"
  | "revise"
  | "shoots"
  | "editing"
  | "avatars"
  | "card";

export function activityIcon(
  e: { kind: string; to_status?: string | null; note?: string | null },
  type = "shoot",
): ActivityIcon {
  if (e.kind === "delivery" || e.kind === "revision_delivered" || e.to_status === "delivered")
    return "download";
  if (e.kind === "created" || e.to_status === "confirmed") return "calendar";
  if (e.kind === "files_added") return "upload";
  if (e.kind === "approved" || e.kind === "auto_completed" || e.to_status === "completed")
    return "check";
  if (e.kind.startsWith("revision")) return "revise";
  if (e.kind === "note" && /\bpaid\b|payment/i.test(e.note ?? "")) return "card";
  return type === "avatar" ? "avatars" : type === "edit" ? "editing" : "shoots";
}

/** "Delivery 1 published (10 items)" → "Delivery 1 published · 10 items". */
export const tidyNote = (s: string) => s.replace(/\s*\((\d+ items?)\)\s*$/, " · $1");

/** "27 Oct, 05:19" in Dubai time. */
export const activityTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Dubai",
  });
