/**
 * Form fields shared by every admin editor. A field's `name` is a column (list sections) or a
 * dotted path into a JSON document (settings, other prices, the AI avatar hero), e.g.
 * "whatsapp.number" or "postProduction.rates.0.amount".
 */
import type { MediaKind } from "@/lib/media-config";
import type { UsageItem } from "@/lib/used-on";

export type Option = { value: string; label: string };

/** What the editor knows about the rest of the content, for "Used on" (owner, 7 Oct 2026). */
export type AdminCtx = {
  /** Every portfolio item, light (lib/used-on). */
  portfolio: UsageItem[];
  /** Published AI avatar example ids, in site order. */
  avatarOrder: string[];
};
export type UsedOn = (row: Record<string, unknown>, ctx: AdminCtx) => string[];
/** Where uploaded video files go in R2 (site/<folder>/…). */
export type VideoFolder = "reels" | "avatars" | "showreel";

type Base = {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  /** Owner-only fields are hidden from Editors. */
  ownerOnly?: boolean;
  /** Show the field only when this is true for the current values (e.g. one format's fields). */
  when?: (row: Record<string, unknown>) => boolean;
};

export type Field = Base &
  (
    | { kind: "text"; max?: number; placeholder?: string }
    | { kind: "textarea"; max?: number; rows?: number }
    | { kind: "number"; min?: number; max?: number; step?: number; unit?: string }
    | { kind: "url" }
    | { kind: "slug" }
    | { kind: "select"; options: Option[]; numeric?: boolean }
    | { kind: "multi"; options: Option[]; numeric?: boolean }
    | { kind: "toggle" }
    /** One entry per line → string[]. `max` limits the number of lines, `maxLength` each line. */
    | { kind: "lines"; max?: number; maxLength?: number; exactly?: number }
    /** Label/value pairs → { value, label }[]. */
    | { kind: "pairs" }
    /**
     * Image (Media JSON: src, alt, focus). `media` is its format (lib/media-config): the crop
     * preview, "Shown at" and "Recommended export" come from it. `video` also asks for the
     * video (a link, or an upload to R2 when `upload` names the folder).
     */
    | {
        kind: "image";
        media: MediaKind;
        usedOn?: UsedOn;
        video?: boolean;
        upload?: VideoFolder;
        bright?: boolean;
      }
    /** Several images → Media[]. */
    | { kind: "gallery"; media: MediaKind; usedOn?: UsedOn }
    /** A YouTube or Vimeo link (string); with `upload`, or a video file in R2 ("r2:<key>"). */
    | { kind: "video"; media?: MediaKind; upload?: VideoFolder }
    /** The portfolio item's media, by format: photo set, reel, long-form video or 360 tour. */
    | { kind: "portfolio-media" }
    /** Portfolio item ids, picked from a list. */
    | { kind: "portfolio-picker" }
  );

/* ---------- dotted paths ---------- */

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const clone = (o: unknown): Record<string, unknown> | unknown[] =>
    Array.isArray(o) ? [...o] : { ...(o as Record<string, unknown>) };
  const root = clone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else {
      cur[k] = clone(cur[k] ?? (/^\d+$/.test(keys[i + 1]) ? [] : {}));
      cur = cur[k] as Record<string, unknown>;
    }
  });
  return root as T;
}

/* ---------- change summaries (old → new) ---------- */

export type Change = { label: string; old: string; new: string };

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v))
    return v.map((x) => (typeof x === "object" ? show(x) : String(x))).join(", ");
  if (typeof v === "object") {
    const m = v as Record<string, unknown>;
    if ("src" in m || "placeholder" in m) return String(m.src ?? `placeholder (${m.placeholder})`);
    if ("value" in m && "label" in m) return `${m.value} ${m.label}`;
    return JSON.stringify(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

/** What changed between two versions, labelled the way the form labels it. */
export function diff(fields: Field[], before: unknown, after: unknown): Change[] {
  const out: Change[] = [];
  // Missing, null and "" are all "empty": an untouched optional field is not a change.
  const norm = (v: unknown) => JSON.stringify(v === "" || v === undefined ? null : v);
  for (const f of fields) {
    const a = getPath(before, f.name);
    const b = getPath(after, f.name);
    if (norm(a) !== norm(b)) out.push({ label: f.label, old: show(a), new: show(b) });
  }
  return out;
}
