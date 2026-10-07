import type { Media, PortfolioItem } from "@/content/types";
import { instagramShortcode, isInstagramUrl } from "@/lib/instagram-link";
import { isFileVideo, kindOf } from "@/lib/media-config";
import { tourEmbed } from "@/lib/tours";
import { embedUrl, VIDEO_REFUSED } from "@/lib/video";
import { getPath, setPath, type Field } from "./fields";

/**
 * Server-side check of everything an editor sends, field by field. Returns the cleaned value
 * (trimmed, typed, empties → null) or an error per field. The browser's checks are only a
 * convenience; this is the gate.
 */
export type Errors = Record<string, string>;

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;
const FOCUS = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;
/** A video file we host: r2:site/<folder>/<uuid>.<ext> (lib/admin/media-actions). */
const FILE_VIDEO = /^r2:site\/(reels|avatars|showreel)\/[0-9a-f-]{36}\.(mp4|mov|webm)$/;
const okVideo = (v: string) => (isFileVideo(v) ? FILE_VIDEO.test(v) : !!embedUrl(v));
const okImage = (src: string) => src.startsWith(STORAGE) || /^\/[\w./-]+$/.test(src);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;

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
  if (src && !okImage(src))
    return { error: "Upload the image here (outside links aren't allowed)." };
  const alt = String(m.alt ?? "").trim();
  if (!alt) return { error: "Describe the image (alt text) for people who can't see it." };
  if (alt.length > 160) return { error: "Keep the description under 160 characters." };
  if (m.focus && !FOCUS.test(String(m.focus))) return { error: "Focal point is invalid." };
  let video = typeof m.video === "string" ? m.video.trim() : "";
  const out: Record<string, unknown> = { ...m, alt };
  // An Instagram link pasted as the video belongs in the Instagram link instead.
  if (isInstagramUrl(video)) {
    out.instagramUrl = video;
    video = "";
  }
  if (video && !okVideo(video)) return { error: `Video ${VIDEO_REFUSED.toLowerCase()}` };
  if (src) {
    out.src = src;
    delete out.placeholder;
  }
  if (video) out.video = video;
  else delete out.video;
  if (!m.focus) delete out.focus;
  return { value: out as unknown as Media };
}

/**
 * A portfolio item's media for its format (owner, 7 Oct 2026). Keeps only what that format uses,
 * so switching format never leaves stale photos, links or files behind.
 */
export function portfolioMedia(
  v: unknown,
  row: Record<string, unknown>,
): { value?: Media; error?: string } {
  const m = (v && typeof v === "object" ? v : {}) as Media;
  const kind = kindOf({
    category: (row.category as PortfolioItem["category"]) ?? "property",
    format: (row.format as PortfolioItem["format"]) ?? "reel",
  });
  const out: Media = { alt: "" };
  let instagramUrl = typeof m.instagramUrl === "string" ? m.instagramUrl.trim() : "";

  if (kind === "photo") {
    const list = Array.isArray(m.photos) ? m.photos : m.src ? [{ src: m.src }] : [];
    if (!list.length) return { error: "Add the photos of this property." };
    if (list.length > 60) return { error: "Up to 60 photos per set." };
    const photos: NonNullable<Media["photos"]> = [];
    for (const [i, p] of list.entries()) {
      const src = typeof p?.src === "string" ? p.src.trim() : "";
      if (!src || !okImage(src)) return { error: `Photo ${i + 1}: upload it here.` };
      const alt = String(p.alt ?? "").trim();
      if (alt.length > 160)
        return { error: `Photo ${i + 1}: keep the alt text under 160 characters.` };
      if (p.focus && !FOCUS.test(String(p.focus)))
        return { error: `Photo ${i + 1}: focal point is invalid.` };
      photos.push({
        src,
        ...(alt ? { alt } : {}),
        ...(num(p.width) ? { width: num(p.width), height: num(p.height) } : {}),
        ...(p.focus ? { focus: p.focus } : {}),
      });
    }
    const cover = photos.find((p) => p.src === m.src) ?? photos[0];
    Object.assign(out, { src: cover.src, width: cover.width, height: cover.height, photos });
    if (m.focus) out.focus = m.focus;
  } else {
    const src = typeof m.src === "string" ? m.src.trim() : "";
    if (!src && !m.placeholder) return { error: "Add the cover image." };
    if (src && !okImage(src))
      return { error: "Upload the cover image here (outside links aren't allowed)." };
    if (src) Object.assign(out, { src, width: num(m.width), height: num(m.height) });
    else out.placeholder = m.placeholder;
    if (m.focus) out.focus = m.focus;
    if (m.bright) out.bright = true;

    if (kind === "reel" || kind === "ai-avatar") {
      const source =
        m.source === "upload"
          ? "upload"
          : m.source === "instagram" || m.instagram
            ? "instagram"
            : isFileVideo(m.video)
              ? "upload"
              : "instagram";
      out.source = source;
      if (source === "instagram") {
        const url = String(m.instagram?.url ?? "").trim();
        const shortcode = url ? instagramShortcode(url) : null;
        if (!url) {
          // Older items played a link; keep it until an Instagram link replaces it.
          const video = typeof m.video === "string" ? m.video.trim() : "";
          if (video && okVideo(video)) out.video = video;
          else return { error: "Paste the reel’s Instagram link, or choose “Upload video”." };
        } else if (!shortcode)
          return { error: "That isn’t an Instagram reel link (instagram.com/reel/…)." };
        else {
          const id =
            m.instagram?.id && /^\d{1,40}$/.test(m.instagram.id) ? m.instagram.id : undefined;
          out.instagram = { url, shortcode, ...(id ? { id } : {}) };
        }
      } else {
        const video = typeof m.video === "string" ? m.video.trim() : "";
        if (!video || !FILE_VIDEO.test(video)) return { error: "Upload the reel’s video." };
        out.video = video;
        if (m.file && typeof m.file === "object")
          out.file = {
            bytes: num(m.file.bytes),
            width: num(m.file.width),
            height: num(m.file.height),
            optimised: m.file.optimised !== false,
          };
      }
    } else if (kind === "long-form") {
      let video = typeof m.video === "string" ? m.video.trim() : "";
      if (isInstagramUrl(video)) {
        instagramUrl ||= video;
        video = "";
      }
      if (video && !okVideo(video)) return { error: VIDEO_REFUSED };
      if (video) out.video = video;
    } else if (kind === "360") {
      let tour = typeof m.tour === "string" ? m.tour.trim() : "";
      if (isInstagramUrl(tour)) {
        instagramUrl ||= tour;
        tour = "";
      }
      if (!tour) return { error: "Paste the 360 tour link (Matterport, Panoee or Kuula)." };
      if (!tourEmbed(tour))
        return { error: "Link not recognised. Use a Matterport, Panoee or Kuula link." };
      out.tour = tour;
    }
  }

  const alt = String(m.alt ?? "").trim();
  if (!alt) return { error: "Describe the cover image (alt text) for people who can't see it." };
  if (alt.length > 160) return { error: "Keep the description under 160 characters." };
  out.alt = alt;
  if (out.focus && !FOCUS.test(String(out.focus))) return { error: "Focal point is invalid." };
  if (instagramUrl) {
    if (!isInstagramUrl(instagramUrl))
      return { error: "The Instagram post link isn’t an Instagram link." };
    if (out.source !== "instagram") out.instagramUrl = instagramUrl;
  }
  for (const k of Object.keys(out) as (keyof Media)[]) if (out[k] === undefined) delete out[k];
  return { value: out };
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
        else if (!okVideo(v) || (isFileVideo(v) && !f.upload)) fail(VIDEO_REFUSED);
        else set(f, v);
        break;
      }
      case "portfolio-media": {
        const r = portfolioMedia(raw, input);
        if (r.error) fail(r.error);
        else set(f, r.value);
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
