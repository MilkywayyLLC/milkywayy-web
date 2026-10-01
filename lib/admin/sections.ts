import type { Tag } from "@/lib/data/tags";
import { CROPS, type Field, type Option } from "./fields";

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

export const PLACEMENTS: Option[] = [
  { value: "home-reels", label: "Home · reel strip" },
  { value: "home-row-production", label: "Home · Production row" },
  { value: "home-row-post", label: "Home · Post-production row" },
  { value: "home-row-avatars", label: "Home · AI avatars row" },
  { value: "production-hero", label: "Production · hero frames" },
  { value: "property-hero", label: "Property shoots · hero" },
  { value: "property-gallery-photo", label: "Property shoots · gallery: Photo" },
  { value: "property-gallery-video", label: "Property shoots · gallery: Video" },
  { value: "property-gallery-360", label: "Property shoots · gallery: 360" },
  { value: "post-hero", label: "Post-production · hero frames" },
  { value: "post-service-cards", label: "Post-production · service cards" },
  { value: "work", label: "Work page" },
];
const placementPage = (p?: string) =>
  !p
    ? "/work"
    : p.startsWith("home")
      ? "/"
      : p.startsWith("production")
        ? "/production"
        : p.startsWith("property")
          ? "/property-shoots"
          : p.startsWith("post")
            ? "/post-production"
            : "/work";

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

export const SECTIONS: Section[] = [
  {
    key: "portfolio",
    table: "portfolio_items",
    title: "Portfolio",
    singular: "portfolio item",
    tags: ["portfolio", "case-studies"],
    idPrefix: "item",
    defaults: {
      category: "property",
      format: "reel",
      media: { alt: "" },
      featured: false,
      sample: false,
      placements: [],
    },
    title_of: (r) => String(r.title ?? ""),
    meta_of: (r) => `${label(CATEGORIES, r.category)} · ${r.format}`,
    thumb: "media",
    filter: {
      label: "Where it shows",
      options: PLACEMENTS,
      match: (r, v) => list(r.placements).includes(v),
      orderPerValue: true,
    },
    preview: (r) => placementPage(list(r?.placements)[0]),
    fields: [
      { name: "title", kind: "text", label: "Title", required: true, max: 80 },
      { name: "client", kind: "text", label: "Client (optional)", max: 80 },
      { name: "category", kind: "select", label: "Category", required: true, options: CATEGORIES },
      {
        name: "format",
        kind: "select",
        label: "Format",
        required: true,
        options: [
          { value: "photo", label: "Photo" },
          { value: "reel", label: "Reel 9:16" },
          { value: "long-form", label: "Long-form 16:9" },
          { value: "360", label: "360 tour" },
        ],
      },
      {
        name: "media",
        kind: "image",
        label: "Image or video poster",
        required: true,
        video: true,
        bright: true,
        crops: [CROPS.reel, CROPS.photo, CROPS.wide],
      },
      { name: "duration", kind: "text", label: "Duration label", placeholder: "0:30", max: 8 },
      { name: "tag", kind: "text", label: "Tag in the frame", placeholder: "Marina 2BR", max: 28 },
      { name: "meta", kind: "text", label: "Caption", placeholder: "Property", max: 28 },
      { name: "placements", kind: "multi", label: "Where it shows", options: PLACEMENTS },
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
        label: "Cover",
        required: true,
        crops: [CROPS.wide, CROPS.photo],
      },
      { name: "gallery", kind: "gallery", label: "Gallery", crops: [CROPS.photo] },
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
    defaults: { before: { alt: "" }, after: { alt: "" }, in_hero: false, sample: false },
    title_of: (r) => `${r.tab} · ${r.title}`,
    meta_of: (r) => (r.in_hero ? "Shown in the hero" : ""),
    thumb: "after",
    preview: () => "/post-production",
    fields: [
      { name: "tab", kind: "text", label: "Tab", required: true, placeholder: "Sky", max: 16 },
      { name: "title", kind: "text", label: "Title", required: true, max: 60 },
      { name: "description", kind: "textarea", label: "Description", required: true, max: 300 },
      { name: "before", kind: "image", label: "Before", required: true, crops: [CROPS.photo] },
      { name: "after", kind: "image", label: "After", required: true, crops: [CROPS.photo] },
      {
        name: "in_hero",
        kind: "toggle",
        label: "Show in the Post-production hero",
        help: "Only one pair can be in the hero; choosing this one takes it off the others.",
      },
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
        label: "Poster",
        required: true,
        bright: true,
        crops: [CROPS.portrait, CROPS.reel],
      },
      { name: "clip", kind: "video", label: "Clip (Bunny, Mux, YouTube or Vimeo link)" },
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
