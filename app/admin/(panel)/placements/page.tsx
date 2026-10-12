import {
  PlacementsBoard,
  type BoardBlock,
  type BoardItem,
} from "@/components/admin/PlacementsBoard";
import { requireAdmin } from "@/lib/admin/auth";
import { libRow, listCategories, listRows, placementState } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";
import type { Media } from "@/content/types";
import {
  HEROES,
  matches,
  modeOf,
  resolve,
  ruleText,
  SECTIONS,
  type PlacementDef,
} from "@/lib/placements";

export const metadata = { title: "Placements" };

/**
 * Admin → Content → Placements (24 Oct 2026): every hero slot and section, with exactly what is
 * live there in order (lib/placements), and per slot Replace, Pin / Unpin and Upload new.
 */
export default async function PlacementsPage() {
  const { db } = await requireAdmin();
  const [rows, categories, pairs] = await Promise.all([
    listRows(db, sectionByKey("portfolio")!),
    listCategories(db),
    db.from("before_after").select("id, title, tab, after, published").order("sort_order"),
  ]);
  const lib = rows.map(libRow);
  const st = await placementState(db, lib);
  const cat = new Map(categories.map((c) => [c.value, c.label]));

  const items: BoardItem[] = lib.map((x) => ({
    id: x.id,
    title: x.title,
    thumb: x.thumb,
    published: x.published,
    sample: !!x.sample,
  }));
  const pairItems: BoardItem[] = (pairs.data ?? []).map((p) => ({
    id: p.id,
    title: `${p.tab} · ${p.title}`,
    thumb: (p.after as Media | null)?.src,
    published: !!p.published,
    sample: false,
  }));

  const block = (d: PlacementDef): BoardBlock => {
    if (d.source === "before-after") {
      const pin = st.pins.find((p) => p.section === d.key);
      const pair = pin && pairItems.find((p) => p.id === pin.item_id && p.published);
      return {
        key: d.key,
        page: d.page,
        title: d.title,
        rule: ruleText(d),
        count: d.count,
        hero: true,
        mode: "manual",
        legacy: pair ? undefined : d.legacy,
        slots: pair ? [{ slot: 0, id: pair.id, pinned: true }] : [],
        candidates: pairItems.filter((p) => p.published).map((p) => p.id),
        newHref: "/admin/before-after/new",
        path: d.path,
      };
    }
    const r = resolve(d, lib, st);
    return {
      key: d.key,
      page: d.page,
      title: d.title,
      rule: ruleText(d, (id) => cat.get(id) ?? id),
      count: d.count,
      hero: !!d.hero,
      mode: modeOf(d, st),
      legacy: r.legacy ? d.legacy : undefined,
      slots: r.slots.map((s) => ({ slot: s.slot, id: s.item.id, pinned: s.pinned })),
      candidates: lib.filter((x) => matches(d.rule, x)).map((x) => x.id),
      newHref: "/admin/portfolio/new",
      path: d.path,
    };
  };

  return (
    <PlacementsBoard
      heroes={HEROES.map(block)}
      sections={SECTIONS.map(block)}
      items={items}
      pairs={pairItems}
      migrated={st.migrated}
    />
  );
}
