import { shortTitle } from "./projects";

/**
 * What the admin does next on a project (admin redesign, 27 Oct 2026). Pure: only fields the
 * project list already returns, no new data. `who` says whose move it is; `rank` sorts the list
 * (lower = more urgent).
 */
export type NextRow = {
  type: "shoot" | "edit" | "avatar";
  title: string;
  status: string;
  status_note: string | null;
  shoot_date: string | null;
  due_at: string | null;
  delivered_at: string | null;
  files_in: number;
  script_status: string | null;
  revision_state: string | null;
  meta: {
    area?: string;
    building?: string;
    proposal?: { date: string; start_time: string } | null;
    paid_at?: string;
    booking?: { location?: { community?: string; building?: string } | null } | null;
  };
};
export type NextAction = { text: string; who: "me" | "client" | "none"; rank: number };

const DAY = 864e5;
/** Today in Dubai as YYYY-MM-DD. */
export const dubaiDay = (now = new Date()) =>
  new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Where a shoot is: the area or community, else the short title. */
export function areaOf(r: Pick<NextRow, "meta" | "title" | "type">) {
  if (r.type !== "shoot") return "";
  const loc = r.meta.booking?.location;
  return r.meta.area || loc?.community || r.meta.building || loc?.building || shortTitle(r.title);
}

const daysSince = (t: string | null, now: Date) =>
  t ? Math.max(0, Math.floor((now.getTime() - Date.parse(t)) / DAY)) : 0;

export function nextAction(r: NextRow, now = new Date()): NextAction {
  const today = dubaiDay(now);
  if (r.status === "cancelled" || r.status === "completed")
    return { text: "—", who: "none", rank: 9 };
  if (r.revision_state === "requested") return { text: "Start the revision", who: "me", rank: 1 };
  if (r.revision_state === "in_progress")
    return { text: "Deliver the revision", who: "me", rank: 2 };
  if (r.status === "on_hold")
    return { text: `Waiting: ${r.status_note || "on hold"}`, who: "client", rank: 7 };
  if (r.type === "shoot") {
    if (r.status === "requested")
      return r.meta.proposal
        ? { text: "Waiting on client (new time)", who: "client", rank: 6 }
        : {
            text: r.meta.paid_at ? "Paid · confirm or propose" : "Confirm or propose time",
            who: "me",
            rank: 0,
          };
    if (r.status === "confirmed") {
      if (r.shoot_date === today) return { text: "Shoot today", who: "me", rank: 1 };
      if (r.shoot_date && r.shoot_date < today) return { text: "Mark as shot", who: "me", rank: 2 };
      return { text: "Shoot booked", who: "none", rank: 5 };
    }
    if (r.status === "shot" || r.status === "editing")
      return { text: "Edit + deliver", who: "me", rank: 3 };
  }
  if (r.type === "edit") {
    if (r.status === "submitted")
      return r.files_in
        ? { text: "Check the files", who: "me", rank: 2 }
        : { text: "Waiting on files", who: "client", rank: 6 };
    if (r.status === "files_received" || r.status === "in_editing")
      return { text: "Edit + deliver", who: "me", rank: 3 };
  }
  if (r.type === "avatar") {
    if (r.script_status === "changes_requested")
      return { text: "Revise the script", who: "me", rank: 1 };
    if (r.script_status === "pending")
      return { text: "Script with client", who: "client", rank: 6 };
    if (r.status === "brief_received") return { text: "Write the script", who: "me", rank: 2 };
    if (r.status === "script_ready" || r.status === "in_production")
      return { text: "Produce + deliver", who: "me", rank: 3 };
  }
  if (r.status === "delivered") {
    const d = daysSince(r.delivered_at, now);
    return { text: `Client approval · ${d} day${d === 1 ? "" : "s"}`, who: "client", rank: 6 };
  }
  return { text: "—", who: "none", rank: 8 };
}

/** The date that matters for the list: shoot date, else due date. */
export const whenOf = (r: Pick<NextRow, "type" | "shoot_date" | "due_at">) =>
  r.type === "shoot" ? r.shoot_date : (r.due_at?.slice(0, 10) ?? null);

export { daysSince };

/** The status dialog's target for a project list row (Projects and Today). */
export function toStatusTarget(
  r: import("./admin").ProjectListRow,
): import("@/components/admin/ProjectStatus").StatusTarget {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    type: r.type,
    status: r.status,
    status_note: r.status_note,
    shoot_date: r.shoot_date,
    slot: r.slot,
    meta: r.meta,
    inPortal: !!r.account_id,
    phone: r.lead_phone || null,
    name: r.client_name,
  };
}
