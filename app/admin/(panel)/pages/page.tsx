import { PagesBoard, type PBlock, type PItem } from "@/components/admin/PagesBoard";
import { requireAdmin } from "@/lib/admin/auth";
import { heroTemplates, libRow, listCategories, listRows, placementState } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";
import type { Media } from "@/content/types";
import {
  HERO_TEMPLATES,
  HEROES,
  heroTemplateFor,
  modeOf,
  PAGE_HEROES,
  placementByKey,
  ratioFor,
  resolve,
  ruleText,
  SECTIONS,
  typeLabel,
  type PlacementDef,
} from "@/lib/placements";

export const metadata = { title: "Pages" };

const TABS = [
  { key: "home", label: "Home", page: "Home" },
  { key: "production", label: "Production", page: "Production" },
  { key: "property-shoots", label: "Property shoots", page: "Property shoots" },
  { key: "post-production", label: "Post-production", page: "Post-production" },
  { key: "ai-avatars", label: "AI avatars", page: "AI avatars" },
  { key: "work", label: "Work", page: "Work" },
];

/**
 * Admin → Content → Pages: one tab per page, its blocks top to bottom as they appear on the site
 * (hero first). Reorder pins a section's order; Add from library takes any item of a compatible
 * type; the hero has a template and slots that follow it.
 */
export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: want } = await searchParams;
  const tab = TABS.find((t) => t.key === want) ?? TABS[0];
  const { db } = await requireAdmin();
  const [rows, categories, pairsRes, saved] = await Promise.all([
    listRows(db, sectionByKey("portfolio")!),
    listCategories(db),
    db.from("before_after").select("id, title, tab, after, published").order("sort_order"),
    heroTemplates(db),
  ]);
  const lib = rows.map(libRow);
  const st = await placementState(db, lib);
  const cat = new Map(categories.map((c) => [c.value, c.label]));
  const catLabel = (id: string) => cat.get(id) ?? id;

  const items: PItem[] = lib.map((x) => ({
    id: x.id,
    title: x.title,
    thumb: x.thumb,
    published: x.published,
    sample: !!x.sample,
    ratio: ratioFor(x.mediaType, x.orientation),
    type: typeLabel(x.mediaType),
  }));
  const pairs: PItem[] = (pairsRes.data ?? []).map((p) => ({
    id: p.id,
    title: `${p.tab} · ${p.title}`,
    thumb: (p.after as Media | null)?.src,
    published: !!p.published,
    sample: false,
    ratio: "3:2",
    type: "Before / after",
  }));

  const block = (d: PlacementDef, over?: Partial<PBlock>): PBlock => {
    const standalone = !!d.standalone;
    if (d.source === "before-after") {
      const pin = st.pins.find((p) => p.section === d.key);
      const pair = pin && pairs.find((p) => p.id === pin.item_id && p.published);
      return {
        key: d.key,
        title: d.title,
        rule: ruleText(d),
        ratio: "3:2",
        count: 1,
        kind: "hero",
        mode: "manual",
        legacy: pair ? undefined : d.legacy,
        slots: pair ? [{ slot: 0, id: pair.id, pinned: true }] : [],
        candidates: pairs.filter((p) => p.published).map((p) => p.id),
        lookup: "pairs",
        uploadHref: "/admin/before-after/new",
        path: d.path,
        ...over,
      };
    }
    const r = resolve(d, lib, st);
    return {
      key: d.key,
      title: d.title,
      rule: ruleText(d, catLabel),
      ratio: d.ratio,
      count: d.count,
      kind: d.key === "work" ? "work" : d.hero ? (standalone ? "standalone" : "hero") : "section",
      mode: modeOf(d, st),
      legacy: r.legacy ? d.legacy : undefined,
      slots: r.slots.map((s) => ({ slot: s.slot, id: s.item.id, pinned: s.pinned })),
      // Any library item of a compatible type, whatever its category (rules only govern auto-fill).
      candidates: lib.filter((x) => d.rule.types.includes(x.mediaType)).map((x) => x.id),
      lookup: "lib",
      uploadHref: "/admin/portfolio/new",
      path: d.path,
      ...over,
    };
  };

  const blocks: PBlock[] = [];
  const hero = PAGE_HEROES.find((h) => h.page === tab.page);
  if (hero) {
    const template = heroTemplateFor(tab.page, saved[hero.key]);
    const t = HERO_TEMPLATES[template];
    const def =
      template === "ba" ? placementByKey(hero.key)! : placementByKey(hero.mediaKey ?? hero.key)!;
    const types = def.rule.types.includes("avatar") ? def.rule.types : t.types;
    const b = block(def, {
      title: "Hero",
      kind: "hero",
      count: t.slots,
      ratio: t.ratio,
      rule: `${t.label} · ${t.ratio} · ${t.slots === 1 ? "1 slot" : `${t.slots} slots`} · picked by hand`,
      hero: {
        page: tab.page,
        template,
        options: hero.templates.map((v) => ({ value: v, label: HERO_TEMPLATES[v].label })),
      },
    });
    if (template !== "ba")
      b.candidates = lib.filter((x) => types.includes(x.mediaType)).map((x) => x.id);
    blocks.push(b);
  }
  const here = (d: PlacementDef) => d.page.split(", ").includes(tab.page);
  for (const d of [...SECTIONS, ...HEROES.filter((h) => h.standalone)].filter(here))
    blocks.push(block(d));

  return (
    <PagesBoard
      tabs={TABS.map(({ key, label }) => ({ key, label }))}
      tab={tab.key}
      blocks={blocks}
      items={items}
      pairs={pairs}
      migrated={st.migrated}
    />
  );
}
