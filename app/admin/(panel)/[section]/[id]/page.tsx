import { notFound } from "next/navigation";
import { ItemEditor } from "@/components/admin/ItemEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { adminCtx, getRow, listRows } from "@/lib/admin/data";
import { sectionByKey, type Row } from "@/lib/admin/sections";
import { HERO_TEMPLATES, isHeroTemplate, legacyFields, placementByKey } from "@/lib/placements";

type Props = {
  params: Promise<{ section: string; id: string }>;
  searchParams: Promise<Record<string, string>>;
};

export async function generateMetadata({ params }: Props) {
  const { section, id } = await params;
  const s = sectionByKey(section);
  return { title: s ? (id === "new" ? `New ${s.singular}` : s.title) : "Not found" };
}

export default async function EditItem({ params, searchParams }: Props) {
  const { section: key, id } = await params;
  const { show, created, place } = await searchParams;
  const section = sectionByKey(key);
  if (!section) notFound();
  const { db, role } = await requireAdmin();

  let row: Row | null;
  if (id === "new") {
    // Start with the list's current filter (e.g. adding from "FAQs · Production").
    const preset: Record<string, unknown> = {};
    if (show && section.filter?.options.some((o) => o.value === show)) {
      if (section.fields.some((f) => f.name === "page")) preset.page = show;
      if (section.fields.some((f) => f.name === "placements")) preset.placements = [show];
    }
    // "Upload new" from Admin → Pages: that section's type, orientation and category, and
    // the slot the new item takes once saved ("<section>:<slot>").
    const def = key === "portfolio" ? placementByKey(String(place ?? "").split(":")[0]) : undefined;
    if (def) {
      // "<section>:<slot>:<hero template>": a hero's template decides the type and orientation.
      const tpl = String(place).split(":")[2];
      const t = def.hero && isHeroTemplate(tpl) ? HERO_TEMPLATES[tpl] : undefined;
      const type = t && !def.rule.types.includes("avatar") ? t.types[0] : def.rule.types[0];
      const orientation =
        type === "video" || type === "avatar"
          ? (t?.orientation ?? def.rule.orientation ?? "9:16")
          : undefined;
      const category = def.rule.categories?.[0] ?? "property";
      Object.assign(preset, {
        media_type: type,
        orientation: orientation ?? null,
        category_id: category,
        ...legacyFields(type, orientation, category),
        // Hero slots and standalone blocks start off the Work page.
        show_on_work: !def.hero,
        _place: place,
      });
    }
    row = { id: "", published: false, sort_order: 0, ...section.defaults, ...preset } as Row;
  } else {
    row = await getRow(db, section, id);
    if (!row) notFound();
  }

  const portfolio =
    key === "case-studies"
      ? (await listRows(db, sectionByKey("portfolio")!)).map((p) => ({
          value: p.id,
          label: String(p.title),
        }))
      : undefined;

  // "Used on" needs the rest of the content (portfolio, before/after, avatars, case studies).
  const ctx = section.fields.some(
    (f) => f.kind === "image" || f.kind === "gallery" || f.kind === "portfolio-media",
  )
    ? await adminCtx(db)
    : undefined;

  return (
    <ItemEditor
      key={id}
      sectionKey={key}
      id={id === "new" ? null : id}
      initial={row}
      isOwner={role === "owner"}
      portfolio={portfolio}
      ctx={ctx}
      justCreated={!!created}
    />
  );
}
