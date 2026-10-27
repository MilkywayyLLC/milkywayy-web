import { cx } from "@/lib/cx";

/**
 * One status pill (admin redesign, 27 Oct 2026). Fixed colour per meaning: neutral = waiting on
 * nobody yet, info = in progress, warn = needs a look, danger = late or cancelled, ok = done,
 * accent = needs you now. Roles and refs use `.ad-tag`, never a pill.
 */
export type Tone = "neutral" | "info" | "warn" | "danger" | "ok" | "accent";

export const STATUS_TONE: Record<string, Tone> = {
  // projects
  requested: "accent",
  confirmed: "info",
  shot: "info",
  editing: "info",
  submitted: "neutral",
  files_received: "info",
  in_editing: "info",
  brief_received: "neutral",
  script_ready: "info",
  in_production: "info",
  delivered: "ok",
  completed: "ok",
  on_hold: "warn",
  cancelled: "danger",
  // invoices
  draft: "neutral",
  approved: "info",
  due: "info",
  overdue: "danger",
  paid: "ok",
  void: "danger",
  receipt: "warn",
  // leads
  new: "accent",
  contacted: "info",
  quoted: "info",
  won: "ok",
  lost: "neutral",
};

export function Pill({
  tone,
  status,
  children,
}: {
  tone?: Tone;
  /** A status key: picks the tone from STATUS_TONE. */
  status?: string;
  children: React.ReactNode;
}) {
  const t = tone ?? (status ? (STATUS_TONE[status] ?? "neutral") : "neutral");
  return <span className={cx("ad-pill", `t-${t}`)}>{children}</span>;
}
