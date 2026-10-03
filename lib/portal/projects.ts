import type { SupabaseClient } from "@supabase/supabase-js";

/** Status keys per project type (database) and the labels clients see (CLIENT_PORTAL_GUIDE §4.1). */
export const PIPELINES = {
  shoot: ["requested", "confirmed", "shot", "editing", "delivered", "completed"],
  edit: ["submitted", "files_received", "in_editing", "delivered", "completed"],
  avatar: ["brief_received", "script_ready", "in_production", "delivered", "completed"],
} as const;
export type ProjectType = keyof typeof PIPELINES;

export const STATUS_LABEL: Record<string, string> = {
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
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const stepsFor = (type: ProjectType) => PIPELINES[type].map(statusLabel);
/** Statuses the admin can set for a type (On hold for batches and avatar videos). */
export const adminStatuses = (type: ProjectType): string[] =>
  type === "shoot"
    ? [...PIPELINES.shoot]
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

/** What an editing batch is (the New batch form, §5.3). */
export const EDIT_KINDS = [
  ["hdr_photos", "HDR photos"],
  ["short_form", "Short-form"],
  ["long_form", "Long-form"],
  ["avatar_edit", "Avatar edit"],
  ["other", "Other"],
] as const;
/** How long an avatar video is (the brief form, §5.4). */
export const AVATAR_LENGTHS = [
  ["30s", "Up to 30 seconds"],
  ["60s", "Up to 60 seconds"],
  ["90s", "Up to 90 seconds"],
  ["longer", "Longer"],
] as const;
export const briefKindLabel = (type: ProjectType, k?: string) =>
  (
    (type === "avatar" ? AVATAR_LENGTHS : EDIT_KINDS) as readonly (readonly [string, string])[]
  ).find((x) => x[0] === k)?.[1] ?? "";

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
  };
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
export function clientStatus(p: Project) {
  if (p.status === "on_hold") return "On hold";
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

/** A client's projects of one type (RLS decides what they see). */
export async function myProjects(db: SupabaseClient, accountId: string, type: ProjectType) {
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("account_id", accountId)
    .eq("type", type)
    .order("created_at", { ascending: false });
  if (error) console.error("[portal] projects:", error.message);
  return (data ?? []) as Project[];
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
