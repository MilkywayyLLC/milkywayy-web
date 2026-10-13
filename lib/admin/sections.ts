import type { Tag } from "@/lib/data/tags";
import type { Media } from "@/content/types";
import { MEDIA } from "@/lib/media-config";
import {
  ALL_PLACEMENTS,
  detectOrientation,
  legacyFields,
  libFields,
  MEDIA_TYPES,
  ORIENTATIONS,
  placementByKey,
  typeLabel,
  whereItShows,
  type MediaType,
  type Orientation,
} from "@/lib/placements";
import { VIDEO_HINT } from "@/lib/video";
import type { AdminCtx, Field, Option } from "./fields";

/** Where a portfolio item shows, worked out from the editor's current values (lib/placements). */
export function appearsOn(row: Record<string, unknown>, ctx: AdminCtx): string[] {
  const id = String(row.id || "new");
  const saved = ctx.portfolio.find((p) => p.id === id);
  const me = {
    ...(saved ?? { sortOrder: Number(row.sort_order ?? 1e6), createdAt: new Date().toISOString() }),
    ...libFields({ ...row, created_at: saved?.createdAt ?? new Date().toISOString() }),
    id,
    published: true,
    sortOrder: saved?.sortOrder ?? Number(row.sort_order ?? 1e6),
  };
  const all = [...ctx.portfolio.filter((p) => p.id !== id), me];
  return whereItShows(id, all, ctx.placements).map((w) => w.label);
}

/**
 * Every list the admin edits (guide §18.2). One config per table drives the list screen, the
 * editor, server-side validation and saving. Rows are edited as their database columns.
 */
export type Row = Record<string, unknown> & { id: string; published: boolean; sort_order: number };

export interface Section {
  key: string;
  table: string;
  title: string;
  singular: string;
  /** Cache tags refreshed after a save. */
  tags: Tag[];
  fields: Field[];
  /** Short prefix for new ids, e.g. "faq" → "faq-k3x9q2". */
  idPrefix: string;
  /** New-item values. */
  defaults: Record<string, unknown>;
  /** List line: title, small meta and an optional thumbnail column. */
  title_of: (r: Row) => string;
  meta_of?: (r: Row) => string;
  thumb?: string;
  /** Lists that can be filtered (and ordered) per placement or page. */
  filter?: {
    label: string;
    options: Option[];
    /** How a row matches the filter value. */
    match: (r: Row, value: string) => boolean;
    /** Per-placement order (portfolio_placements / stats.placement_order); else sort_order. */
    orderPerValue?: boolean;
  };
  /** Follow-on changes when a field changes (e.g. a new upload's shape sets the format). */
  derive?: (name: string, next: unknown, prev: Row) => Partial<Row>;
  /** Page to open for Preview. */
  preview: (r?: Row) => string;
  help?: string;
}

export const PAGES: Option[] = [
  { value: "home", label: "Home" },
  { value: "production", label: "Production" },
  { value: "property-shoots", label: "Property shoots" },
  { value: "post-production", label: "Post-production" },
  { value: "ai-avatars", label: "AI avatars" },
  { value: "contact", label: "Contact" },
  { value: "work", label: "Work" },
  { value: "about", label: "About" },
];
export const pagePath = (page: string) => (page === "home" ? "/" : `/${page}`);

const CATEGORIES: Option[] = [
  { value: "property", label: "Property" },
  { value: "brand", label: "Brand" },
  { value: "ai-avatar", label: "AI avatar" },
  { value: "editing", label: "Editing" },
];

const sample: Field = {
  name: "sample",
  kind: "toggle",
  label: "Sample",
  help: "Shows a small “sample” label on the site until you replace it with real work.",
};

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const label = (opts: Option[], v: unknown) =>
  opts.find((o) => o.value === v)?.label ?? String(v ?? "");

/** Portfolio format from an image's shape: wide → long-form 16:9, tall → reel 9:16, else photo 3:2. */
export function formatFromSize(width: number, height: number) {
  const r = width / height;
  return r >= 1.6 ? "long-form" : r <= 0.8 ? "reel" : "photo";
}

export const SECTIONS: Section[] = [
  {
    key: "portfolio",
    table: "portfolio_items",
    title: "Portfolio",
    singular: "portfolio item",
    tags: ["portfolio", "case-studies"],
    idPrefix: "item",
    defaults: {
      media_type: "photo",
      category: "property",
      category_id: "property",
      format: "photo",
      media: { alt: "" },
      featured: false,
      sample: false,
      show_on_work: true,
      placements: [],
    },
    title_of: (r) => String(r.title ?? ""),
    meta_of: (r) =>
      [
        typeLabel(String(r.media_type ?? "")),
        r.media_type === "video" || r.media_type === "avatar" ? r.orientation : "",
        r.category_label,
      ]
        .filter(Boolean)
        .join(" · "),
    thumb: "media",
    // "Where it shows" is worked out from lib/placements (rules + pins), set on each row by the
    // list page as `placements`. Order lives on Admin → Placements now, so no per-value order.
    filter: {
      label: "Where it shows",
      options: ALL_PLACEMENTS.map((p) => ({
        value: p.key,
        label: `${p.page.split(",")[0]} · ${p.title}`,
      })),
      match: (r, v) => list(r.placements).includes(v),
    },
    preview: (r) => placementByKey(list(r?.placements)[0] ?? "work")?.path ?? "/work",
    // Media type first (owner, 24 Oct 2026): it decides the fields. Orientation is preselected
    // from the file or link (derive below) for the owner to confirm.
    derive: (name, next, prev) => {
      const type = (name === "media_type" ? next : prev.media_type) as MediaType;
      let orientation = (name === "orientation" ? next : prev.orientation) as
        Orientation | undefined;
      const patch: Partial<Row> = {};
      if (name === "media" && (type === "video" || type === "avatar")) {
        const seen = detectOrientation(next as Media);
        if (seen && seen !== orientation) orientation = patch.orientation = seen;
      }
      if (name === "media_type" && (type === "video" || type === "avatar") && !orientation)
        orientation = patch.orientation = "9:16";
      const legacy = legacyFields(
        type,
        type === "video" || type === "avatar" ? orientation : undefined,
        String((name === "category_id" ? next : prev.category_id) ?? ""),
      );
      return { ...patch, ...legacy };
    },
    fields: [
      {
        name: "media_type",
        kind: "select",
        label: "Media type",
        required: true,
        options: MEDIA_TYPES,
        help: "Choose this first: it decides the fields below.",
      },
      {
        name: "orientation",
        kind: "select",
        label: "Orientation",
        options: ORIENTATIONS,
        when: (r) => r.media_type === "video" || r.media_type === "avatar",
        help: "Preselected from the file or link once it’s added. Confirm it.",
      },
      {
        name: "category_id",
        kind: "category",
        label: "Category",
        required: true,
        help: "Pick one, or type a new name to save it as a category for future uploads.",
        // Plain answer, right under Type / Orientation / Category (owner, 13 Oct 2026).
        line: (r, ctx) => {
          const on = appearsOn(r, ctx);
          return on.length
            ? `This will appear on: ${on.join(", ")}`
            : "This won’t appear anywhere yet. Change the type or category, or turn on “Show on Work page”.";
        },
      },
      { name: "title", kind: "text", label: "Title", required: true, max: 80 },
      { name: "client", kind: "text", label: "Client (optional)", max: 80 },
      { name: "media", kind: "portfolio-media", label: "Media", required: true },
      {
        name: "duration",
        kind: "text",
        label: "Duration label",
        placeholder: "0:30",
        max: 8,
        when: (r) => r.media_type === "video" || r.media_type === "avatar",
      },
      { name: "tag", kind: "text", label: "Tag in the frame", placeholder: "Marina 2BR", max: 28 },
      { name: "meta", kind: "text", label: "Caption", placeholder: "Property", max: 28 },
      {
        name: "show_on_work",
        kind: "toggle",
        label: "Show on Work page",
        help: "Off keeps it in the library to pin elsewhere (Admin → Placements).",
      },
      { name: "featured", kind: "toggle", label: "Featured" },
      sample,
    ],
  },
  {
    key: "case-studies",
    table: "case_studies",
    title: "Case studies",
    singular: "case study",
    tags: ["case-studies"],
    idPrefix: "case",
    defaults: {
      category: "property",
      what_we_did: [],
      results: [],
      gallery: [],
      related: [],
      cover: { alt: "" },
      sample: false,
    },
    title_of: (r) => String(r.title ?? ""),
    meta_of: (r) => `${r.client ?? ""} · /work/${r.slug ?? ""}`,
    thumb: "cover",
    preview: (r) => (r?.slug ? `/work/${r.slug}` : "/work"),
    fields: [
      { name: "client", kind: "text", label: "Client", required: true, max: 80 },
      { name: "title", kind: "text", label: "Title", required: true, max: 90 },
      {
        name: "slug",
        kind: "slug",
        label: "Web address",
        required: true,
        help: "milkywayy.com/work/… Lowercase letters, numbers and dashes.",
      },
      {
        name: "hero_lines",
        kind: "lines",
        label: "Page headline (two lines)",
        exactly: 2,
        maxLength: 18,
        help: "Exactly two short lines, up to 18 characters each, so it fits a phone. Leave empty to use the title.",
      },
      {
        name: "summary",
        kind: "text",
        label: "One-line summary (cards)",
        required: true,
        max: 140,
      },
      { name: "brief", kind: "textarea", label: "The brief", required: true, max: 900 },
      { name: "what_we_did", kind: "lines", label: "What we did (one per line)", max: 8 },
      { name: "results", kind: "pairs", label: "Results" },
      {
        name: "cover",
        kind: "image",
        label: "Cover image",
        required: true,
        media: "case-cover",
        usedOn: (r) => ["/work → Case studies", `/work/${r.slug || "…"} → Top image`],
      },
      {
        name: "gallery",
        kind: "gallery",
        label: "Gallery",
        media: "photo",
        usedOn: (r) => [`/work/${r.slug || "…"} → Project media`],
      },
      { name: "related", kind: "portfolio-picker", label: "Related portfolio items" },
      { name: "category", kind: "select", label: "Category", required: true, options: CATEGORIES },
      sample,
    ],
  },
  {
    key: "before-after",
    table: "before_after",
    title: "Before / after",
    singular: "before / after pair",
    tags: ["before-after"],
    idPrefix: "pair",
    defaults: { before: { alt: "" }, after: { alt: "" }, sample: false },
    title_of: (r) => `${r.tab} · ${r.title}`,
    thumb: "after",
    preview: () => "/post-production",
    fields: [
      { name: "tab", kind: "text", label: "Tab", required: true, placeholder: "Sky", max: 16 },
      { name: "title", kind: "text", label: "Title", required: true, max: 60 },
      { name: "description", kind: "textarea", label: "Description", required: true, max: 300 },
      {
        name: "before",
        kind: "image",
        label: "Before",
        required: true,
        media: "before-after",
        usedOn: () => ["Post-production → Before / after"],
      },
      {
        name: "after",
        kind: "image",
        label: "After",
        required: true,
        media: "before-after",
        usedOn: () => ["Post-production → Before / after"],
      },
      // No "show in the hero" toggle: the Post-production hero takes portfolio items placed
      // under "Post-production · hero frames" (owner, 7 Oct 2026). The in_hero column stays.
      sample,
    ],
  },
  {
    key: "avatars",
    table: "avatars",
    title: "AI avatars",
    singular: "avatar example",
    tags: ["avatars"],
    idPrefix: "avatar",
    defaults: { poster: { alt: "" }, sample: false },
    title_of: (r) => String(r.name ?? ""),
    meta_of: (r) => String(r.niche ?? ""),
    thumb: "poster",
    preview: () => "/ai-avatars",
    help: "The Adam hero video, caption and reveal text are under “Hero (Adam)”.",
    fields: [
      { name: "name", kind: "text", label: "Name", required: true, max: 40 },
      {
        name: "niche",
        kind: "text",
        label: "Niche line",
        required: true,
        placeholder: "Real estate · market updates",
        max: 60,
      },
      {
        name: "poster",
        kind: "image",
        label: "Cover image",
        required: true,
        bright: true,
        media: "ai-avatar",
        usedOn: (r, ctx) => [
          "AI avatars → Avatar styles",
          ...(ctx.avatarOrder[0] === r.id || (!ctx.avatarOrder.length && r.published)
            ? ["Post-production → Services row (AI avatars)"]
            : []),
        ],
      },
      {
        name: "clip",
        kind: "video",
        label: "Clip (optional)",
        media: "ai-avatar",
        upload: "avatars",
        help: `${VIDEO_HINT}, or upload the video (vertical, ${MEDIA["ai-avatar"].width}×${MEDIA["ai-avatar"].height}). It opens in the 9:16 player.`,
      },
      {
        name: "versions",
        kind: "versions",
        label: "Language versions (optional)",
        media: "ai-avatar",
        upload: "avatars",
        help: "The same video in other languages, uploaded. With two or more, AI avatars → Multilingual plays them with a language switch.",
      },
      sample,
    ],
  },
  {
    key: "reviews",
    table: "reviews",
    title: "Reviews",
    singular: "review",
    tags: ["reviews"],
    idPrefix: "review",
    defaults: { rating: 5, source: "google", placements: ["home"], sample: false },
    title_of: (r) => `${r.name || r.role} · ${"★".repeat(Number(r.rating ?? 5))}`,
    meta_of: (r) => String(r.text ?? "").slice(0, 80),
    filter: {
      label: "Page",
      options: PAGES.slice(0, 5),
      match: (r, v) => list(r.placements).includes(v),
    },
    preview: (r) => pagePath(list(r?.placements)[0] ?? "home"),
    help: "The Google rating and review count are in Site settings.",
    fields: [
      { name: "name", kind: "text", label: "Reviewer name (optional)", max: 60 },
      { name: "role", kind: "text", label: "Role", required: true, max: 60 },
      { name: "company", kind: "text", label: "Company", max: 60 },
      {
        name: "rating",
        kind: "select",
        label: "Rating",
        required: true,
        numeric: true,
        options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) })),
      },
      { name: "text", kind: "textarea", label: "Review", required: true, max: 600 },
      {
        name: "source",
        kind: "select",
        label: "Source",
        required: true,
        options: [
          { value: "google", label: "Google" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "link", kind: "url", label: "Link to the review" },
      { name: "placements", kind: "multi", label: "Pages", options: PAGES.slice(0, 5) },
      sample,
    ],
  },
  {
    key: "faqs",
    table: "faqs",
    title: "FAQs",
    singular: "FAQ",
    tags: ["faqs"],
    idPrefix: "faq",
    defaults: { page: "home", draft: false },
    title_of: (r) => String(r.question ?? ""),
    meta_of: (r) => label(PAGES, r.page),
    filter: { label: "Page", options: PAGES.slice(0, 6), match: (r, v) => r.page === v },
    preview: (r) => `${pagePath(String(r?.page ?? "home"))}#faq`,
    fields: [
      { name: "page", kind: "select", label: "Page", required: true, options: PAGES.slice(0, 6) },
      { name: "question", kind: "text", label: "Question", required: true, max: 140 },
      { name: "answer", kind: "textarea", label: "Answer", required: true, max: 900 },
      {
        name: "draft",
        kind: "toggle",
        label: "Wording not final",
        help: "Shows a small “draft wording” note on the site and keeps it out of Google’s FAQ results.",
      },
    ],
  },
  {
    key: "stats",
    table: "stats",
    title: "Stats",
    singular: "stat",
    tags: ["stats"],
    idPrefix: "stat",
    defaults: { placements: ["home"], label_by_placement: {}, placement_order: {}, sample: false },
    title_of: (r) => `${r.value} · ${r.label}`,
    meta_of: (r) =>
      list(r.placements)
        .map((p) => label(PAGES, p))
        .join(", "),
    filter: {
      label: "Page",
      options: [PAGES[0], PAGES[3]],
      match: (r, v) => list(r.placements).includes(v),
      orderPerValue: true,
    },
    preview: (r) => pagePath(list(r?.placements)[0] ?? "home"),
    fields: [
      {
        name: "value",
        kind: "text",
        label: "Value",
        required: true,
        placeholder: "1,000+",
        max: 12,
      },
      { name: "label", kind: "text", label: "Label", required: true, max: 40 },
      {
        name: "label_by_placement.post-production",
        kind: "text",
        label: "Different label on Post-production (optional)",
        max: 40,
      },
      { name: "placements", kind: "multi", label: "Pages", options: [PAGES[0], PAGES[3]] },
      sample,
    ],
  },
  {
    key: "clients",
    table: "clients",
    title: "Clients",
    singular: "client",
    tags: ["clients"],
    idPrefix: "client",
    defaults: {},
    title_of: (r) => String(r.name ?? ""),
    preview: () => "/",
    help: "Clients appear in the proof strip and on About. Choose the pages with a proof strip below.",
    fields: [
      { name: "name", kind: "text", label: "Client name", required: true, max: 60 },
      { name: "logo", kind: "url", label: "Logo link (optional)" },
    ],
  },
];

export const sectionByKey = (key: string) => SECTIONS.find((s) => s.key === key);
