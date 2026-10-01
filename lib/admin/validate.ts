import type { Media } from "@/content/types";
import { embedUrl } from "@/lib/video";
import { getPath, setPath, type Field } from "./fields";

/**
 * Server-side check of everything an editor sends, field by field. Returns the cleaned value
 * (trimmed, typed, empties → null) or an error per field. The browser's checks are only a
 * convenience; this is the gate.
 */
export type Errors = Record<string, string>;

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;
const FOCUS = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;

const isUrl = (v: string) => {
  try {
    return ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

function media(v: unknown, f: Field): { value?: Media; error?: string } {
  const m = (v && typeof v === "object" ? v : {}) as Media & Record<string, unknown>;
  const src = typeof m.src === "string" ? m.src.trim() : "";
  const hasImage = !!src || !!m.placeholder;
  if (!hasImage) return f.required ? { error: "Add an image." } : { value: undefined };
  if (src && !src.startsWith(STORAGE) && !/^\/[\w./-]+$/.test(src))
    return { error: "Upload the image here (outside links aren't allowed)." };
  const alt = String(m.alt ?? "").trim();
  if (!alt) return { error: "Describe the image (alt text) for people who can't see it." };
  if (alt.length > 160) return { error: "Keep the description under 160 characters." };
  if (m.focus && !FOCUS.test(String(m.focus))) return { error: "Focal point is invalid." };
  const video = typeof m.video === "string" ? m.video.trim() : "";
  if (video && !embedUrl(video))
    return { error: "Video link not recognised. Use a Bunny, Mux, YouTube or Vimeo link." };
  const out: Record<string, unknown> = { ...m, alt };
  if (src) {
    out.src = src;
    delete out.placeholder;
  }
  if (video) out.video = video;
  else delete out.video;
  if (!m.focus) delete out.focus;
  return { value: out as unknown as Media };
}

export function validate(
  fields: Field[],
  input: Record<string, unknown>,
  /** emptyAs: what an empty optional field becomes (default null; undefined drops the key). */
  opts: { emptyAs?: null | "" | undefined; isOwner?: boolean } = {},
): { value: Record<string, unknown>; errors: Errors } {
  const empty = "emptyAs" in opts ? opts.emptyAs : null;
  let out: Record<string, unknown> = structuredClone(input);
  const errors: Errors = {};
  const set = (f: Field, v: unknown) => (out = setPath(out, f.name, v));

  for (const f of fields) {
    if (f.ownerOnly && !opts.isOwner) continue;
    const raw = getPath(input, f.name);
    const fail = (msg: string) => (errors[f.name] = msg);
    switch (f.kind) {
      case "text":
      case "textarea": {
        const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
        if (!v) {
          if (f.required) fail("Required.");
          set(f, empty);
        } else if (f.max && v.length > f.max) fail(`Keep it under ${f.max} characters.`);
        else set(f, v);
        break;
      }
      case "number": {
        if (raw === "" || raw == null) {
          if (f.required) fail("Required.");
          set(f, null);
          break;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) fail("Enter a number.");
        else if (f.min !== undefined && n < f.min) fail(`At least ${f.min}.`);
        else if (f.max !== undefined && n > f.max) fail(`At most ${f.max}.`);
        else set(f, n);
        break;
      }
      case "url": {
        const v = typeof raw === "string" ? raw.trim() : "";
        if (!v) {
          if (f.required) fail("Required.");
          set(f, empty);
        } else if (!isUrl(v)) fail("Enter a full link starting with https://");
        else set(f, v);
        break;
      }
      case "slug": {
        const v = typeof raw === "string" ? raw.trim() : "";
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v))
          fail("Lowercase letters, numbers and single dashes only.");
        else if (v.length > 80) fail("Keep it under 80 characters.");
        else set(f, v);
        break;
      }
      case "select": {
        const v = raw == null ? "" : String(raw);
        if (!v) {
          if (f.required) fail("Choose one.");
          set(f, null);
        } else if (!f.options.some((o) => o.value === v)) fail("Choose one of the options.");
        else set(f, f.numeric ? Number(v) : v);
        break;
      }
      case "multi": {
        const v = (Array.isArray(raw) ? raw : []).map(String);
        if (v.some((x) => !f.options.some((o) => o.value === x))) fail("Unknown option.");
        else if (f.required && !v.length) fail("Choose at least one.");
        else
          set(
            f,
            [...new Set(v)].map((x) => (f.numeric ? Number(x) : x)),
          );
        break;
      }
      case "toggle":
        set(f, raw === true);
        break;
      case "lines": {
        const v = (Array.isArray(raw) ? raw : []).map((x) => String(x).trim()).filter(Boolean);
        if (f.required && !v.length) fail("Add at least one line.");
        else if (f.exactly && v.length && v.length !== f.exactly)
          fail(`Exactly ${f.exactly} lines, or leave it empty.`);
        else if (f.max && v.length > f.max) fail(`Up to ${f.max} lines.`);
        else if (f.maxLength && v.some((x) => x.length > f.maxLength!))
          fail(`Keep each line under ${f.maxLength} characters.`);
        else set(f, f.exactly && !v.length ? null : v);
        break;
      }
      case "pairs": {
        const v = (Array.isArray(raw) ? raw : [])
          .map((p) => ({
            value: String((p as Record<string, unknown>)?.value ?? "").trim(),
            label: String((p as Record<string, unknown>)?.label ?? "").trim(),
          }))
          .filter((p) => p.value || p.label);
        if (v.some((p) => !p.value || !p.label)) fail("Each result needs a value and a label.");
        else if (v.length > 6) fail("Up to 6 results.");
        else set(f, v);
        break;
      }
      case "image": {
        const r = media(raw, f);
        if (r.error) fail(r.error);
        else set(f, r.value ?? null);
        break;
      }
      case "gallery": {
        const list = Array.isArray(raw) ? raw : [];
        const cleaned: Media[] = [];
        for (const m of list) {
          const r = media(m, { ...f, required: true });
          if (r.error) {
            fail(`Image ${cleaned.length + 1}: ${r.error}`);
            break;
          }
          cleaned.push(r.value!);
        }
        if (cleaned.length > 12) fail("Up to 12 images.");
        else set(f, cleaned);
        break;
      }
      case "video": {
        const v = typeof raw === "string" ? raw.trim() : "";
        if (!v) set(f, empty);
        else if (!embedUrl(v))
          fail("Video link not recognised. Use a Bunny, Mux, YouTube or Vimeo link.");
        else set(f, v);
        break;
      }
      case "portfolio-picker": {
        const v = (Array.isArray(raw) ? raw : []).map(String).filter(Boolean);
        if (v.length > 6) fail("Up to 6 related items.");
        else set(f, [...new Set(v)]);
        break;
      }
    }
  }
  return { value: out, errors };
}
