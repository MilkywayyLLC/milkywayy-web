import type { SupabaseClient } from "@supabase/supabase-js";

/** Status keys per project type (database) and the labels clients see (CLIENT_PORTAL_GUIDE §4.1). */
export const PIPELINES = {
  shoot: ["requested", "confirmed", "shot", "editing", "delivered", "completed"],
  edit: ["submitted", "files_received", "in_editing", "delivered", "completed"],
  avatar: ["brief_received", "script_ready", "in_production", "delivered", "completed"],
} as const;
export type ProjectType = keyof typeof PIPELINES;

export const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Draft · payment pending",
  requested: "Requested",
  confirmed: "Confirmed",
  shot: "Shot",
  editing: "Editing",
  delivered: "Delivered",
  completed: "Completed",
  submitted: "Submitted",
  files_received: "Files received",
  in_editing: "In editing",
  on_hold: "On hold",
  brief_received: "Brief received",
  script_ready: "Script ready",
  in_production: "In production",
  cancelled: "Cancelled",
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const stepsFor = (type: ProjectType) => PIPELINES[type].map(statusLabel);
/** Statuses the admin can set for a type (On hold for batches and avatar videos). */
export const adminStatuses = (type: ProjectType): string[] =>
  type === "shoot"
    ? [...PIPELINES.shoot, "cancelled"]
    : [...PIPELINES[type].slice(0, -2), "on_hold", ...PIPELINES[type].slice(-2)];

export const TYPE_LABEL: Record<ProjectType, string> = {
  shoot: "Shoot",
  edit: "Editing batch",
  avatar: "Avatar video",
};
/** Where a project lives in the portal. */
export const TYPE_PATH: Record<ProjectType, string> = {
  shoot: "/portal/shoots",
  edit: "/portal/editing",
  avatar: "/portal/avatars",
};

/** What an editing batch is (the "Edit my files" form; owner, 10 Oct 2026). */
export const EDIT_KINDS = [
  ["hdr_photos", "HDR photos"],
  ["short_form", "Short form (vertical reels)"],
  ["long_form", "Long form (horizontal YouTube videos)"],
  ["other", "Other"],
] as const;
/** How long an avatar video is (stored kind; the form picks a format and a length). The price
 *  list's lengths (17 Oct 2026): up to 30 seconds, or long form priced per minute. 60s and 90s
 *  are older briefs, shown in 30-second blocks. */
export const AVATAR_LENGTHS = [
  ["30s", "Up to 30 seconds"],
  ["longer", "Long form · per minute"],
  ["60s", "60 seconds (2 × 30 seconds)"],
  ["90s", "90 seconds (3 × 30 seconds)"],
] as const;
/** The lengths a new brief can have. */
export const AVATAR_LENGTHS_NEW = AVATAR_LENGTHS.slice(0, 2);
const OLD_KINDS = [["avatar_edit", "Avatar edit"]] as const;
export const briefKindLabel = (type: ProjectType, k?: string) =>
  (
    (type === "avatar" ? AVATAR_LENGTHS : [...EDIT_KINDS, ...OLD_KINDS]) as readonly (readonly [
      string,
      string,
    ])[]
  ).find((x) => x[0] === k)?.[1] ?? "";

/** An avatar video's client action by status (owner, 17 Oct 2026): edit the brief before we
 *  start, else a revision (none while a delivered video's revision is under way). */
export function avatarAction(status: string, revisionBusy: boolean): "edit" | "revise" | null {
  if (status === "brief_received") return "edit";
  if (["script_ready", "in_production", "on_hold"].includes(status)) return "revise";
  if (status === "delivered" && !revisionBusy) return "revise";
  return null;
}

export const REVISION_LABEL: Record<string, string> = {
  requested: "Revision requested",
  in_progress: "Revision in progress",
  delivered: "Revision delivered",
};

export const FILE_KINDS = [
  ["photos", "Photos"],
  ["reel", "Reel"],
  ["long_form", "Long-form video"],
  ["tour", "360 tour"],
  ["zip", "Full set (zip)"],
  ["other", "Other"],
] as const;
const KIND_EXTRA: Record<string, string> = { raw: "Raw files" };
export const kindLabel = (k: string) =>
  FILE_KINDS.find((f) => f[0] === k)?.[1] ?? KIND_EXTRA[k] ?? k;

export type Project = {
  id: string;
  account_id: string | null;
  type: ProjectType;
  ref: string;
  title: string;
  status: string;
  status_note: string | null;
  meta: {
    area?: string;
    building?: string;
    unit?: string;
    services?: string[];
    size?: string;
    property_type?: string;
    lighting?: string;
    kind?: string;
    quantity?: number;
    notes?: string;
    references?: string[];
    script_by?: "milkywayy" | "client";
    /** Booked with this account's email while signed out (owner, 3 Oct 2026). */
    attached_by_email?: boolean;
    /** Added by hand from before the portal (owner, 4 Oct 2026), with its original date. */
    past?: boolean;
    original_date?: string;
    /** Booked in the portal (owner, 10 Oct 2026): location, services, estimate. */
    source?: "portal";
    booking?: import("./booking").PortalBooking;
    /** Start time set by the admin on a shoot without a portal booking (phase 1). */
    start_time?: string | null;
    /** Phase 1 (27 Oct 2026): a time Milkywayy proposed, waiting for the client's answer. */
    proposal?: {
      date: string;
      start_time: string;
      note?: string | null;
      was_date?: string | null;
      was_start?: string | null;
    };
    /** A teammate sent the booking to the company for payment. */
    pay_by?: "company";
    /** When the booking invoice was paid (waiting for confirmation). */
    paid_at?: string;
    /** Owner, 27 Oct 2026: an unpaid 100% / 50% upfront draft, since when (expires after 7 days). */
    awaiting_since?: string;
    /** A draft the booker discarded, or one that expired: hidden everywhere. */
    discarded?: boolean;
    /** Confirm what we shot (28 Oct 2026): the client's note on what changed after the shoot. */
    shot_update?: {
      note: string | null;
      at: string;
      diff: number;
      outcome: string;
      currency: string;
    };
  };
  created_by?: string | null;
  requested_by?: string | null;
  /** Agency teams: the Agent (contact) and teammates it's shared with. */
  agent_contact_id?: string | null;
  shared_with?: string[];
  due_at: string | null;
  shoot_date: string | null;
  slot: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  revision_rounds_allowed: number;
  revision_rounds_used: number;
  revision_state: "requested" | "in_progress" | "delivered" | null;
  created_at: string;
  updated_at: string;
};
export type ProjectFile = {
  id: string;
  project_id: string;
  direction: "in" | "out";
  delivery_no: number | null;
  delivery_label: string | null;
  kind: string;
  source: "link" | "r2";
  url: string | null;
  r2_key: string | null;
  thumb_key?: string | null;
  /** Share pages (Phase 13): photo WebP / video MP4, preview JPEG, video poster. */
  web_key?: string | null;
  og_key?: string | null;
  poster_key?: string | null;
  web_bytes?: number | null;
  label: string;
  bytes: number | null;
  content_type: string | null;
  published: boolean;
  created_at: string;
  expires_at: string | null;
};
export type ProjectEvent = {
  id: number;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_name: string | null;
  by_admin: boolean;
  at: string;
};
export type ProjectScript = {
  id: string;
  version: number;
  body: string;
  length_note: string | null;
  status: "pending" | "approved" | "changes_requested" | "replaced";
  client_comment: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
};
export type ProjectMessage = {
  id: string;
  author_name: string | null;
  is_admin: boolean;
  body: string;
  at: string;
};

/** What the client is waiting on, in one line. */
export function clientStatus(
  p: Project,
  pay?: { invoices: { stage: string | null; status: string }[] | null } | null,
) {
  if (p.status === "on_hold") return "On hold";
  // Phase 1 (27 Oct 2026): a requested shoot says what it's waiting for.
  if (p.type === "shoot" && p.status === "requested") {
    const m = p.meta as { proposal?: unknown; pay_by?: string; paid_at?: string };
    if (m.proposal) return "New time proposed";
    if (m.pay_by === "company") return "Awaiting company payment";
    const stage = (pay?.invoices ?? []).filter((i) => i.stage === "full" || i.stage === "deposit");
    if (m.paid_at || stage.some((i) => i.status === "paid")) return "Pending confirmation";
    if (stage.some((i) => i.status === "due" || i.status === "overdue")) return "Awaiting payment";
  }
  // Booked with their email while signed out: we confirm it with them first.
  if (p.status === "requested" && p.meta.attached_by_email)
    return "Requested — we’ll confirm on WhatsApp";
  if (p.revision_state && p.revision_state !== "delivered") return REVISION_LABEL[p.revision_state];
  if (p.status === "delivered" && p.revision_state === "delivered") return "Revision delivered";
  return statusLabel(p.status);
}

/** Deliveries grouped by number, newest first. */
export function deliveries(files: ProjectFile[]) {
  const out = files.filter((f) => f.direction === "out" && f.delivery_no != null);
  const nos = [...new Set(out.map((f) => f.delivery_no!))].sort((a, b) => b - a);
  return nos.map((no) => {
    const fs = out.filter((f) => f.delivery_no === no);
    return {
      no,
      label: fs[0].delivery_label ?? `Delivery ${no}`,
      files: fs,
      published: fs.every((f) => f.published),
    };
  });
}

export const bytes = (n: number | null) =>
  n == null
    ? ""
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} GB`
      : n >= 1e6
        ? `${Math.round(n / 1e6)} MB`
        : `${Math.max(1, Math.round(n / 1e3))} KB`;

/**
 * Who sees a project in lists (owner, 27 Oct 2026): an "Awaiting payment" draft only its booker, a
 * discarded / expired draft nobody.
 */
export const visibleTo = (p: Project, userId: string) =>
  !p.meta?.discarded &&
  (p.status !== "awaiting_payment" || (p.requested_by ?? p.created_by) === userId);

/** A client's projects of one type (RLS decides what they see; drafts only their booker). */
export async function myProjects(
  db: SupabaseClient,
  accountId: string,
  type: ProjectType,
  userId: string,
) {
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("account_id", accountId)
    .eq("type", type)
    .order("created_at", { ascending: false });
  if (error) console.error("[portal] projects:", error.message);
  return ((data ?? []) as Project[]).filter((p) => visibleTo(p, userId));
}

export const SHOOT_SERVICE_LABEL: Record<string, string> = {
  photo: "Photography",
  short: "Short-form video",
  long: "Long-form video",
  tour: "360 tour",
};
export const shootDay = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "";

export const day = (iso: string | null | undefined, year = false) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        ...(year ? { year: "numeric" } : {}),
        timeZone: "Asia/Dubai",
      })
    : "";

/** "deletes on 2 Nov 2026" while it's ahead, "deleted 2 Nov 2026" once it's past. */
export const expiry = (iso: string) =>
  `${new Date(iso).getTime() > Date.now() ? "deletes on" : "deleted"} ${day(iso, true)}`;

/** Words that only lengthen an address in a list: the city and the country. */
const PLACE_NOISE = /^(dubai|united arab emirates|uae|u\.a\.e\.?|sharjah emirate)$/i;

/**
 * A project's title for lists and cards (owner, 25 Oct 2026): "Shoot · Marina Heights Tower - Dubai
 * Marina - Dubai - United Arab Emirates" → "Marina Heights Tower, Dubai Marina". The full address
 * stays on the detail page. Titles without an address come back as they are.
 */
export function shortTitle(title: string | null | undefined): string {
  const t = (title ?? "").replace(/^\s*(shoot|booking)\s*·\s*/i, "").trim();
  if (!t) return title ?? "";
  const parts = t
    .split(/\s+-\s+|,\s*/)
    .map((x) => x.trim())
    .filter((x) => x && !PLACE_NOISE.test(x));
  if (parts.length < 2) return parts[0] ?? t;
  return parts.slice(0, 2).join(", ");
}
