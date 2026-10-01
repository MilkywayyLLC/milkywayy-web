import { notFound } from "next/navigation";
import { ItemEditor } from "@/components/admin/ItemEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getRow, listRows } from "@/lib/admin/data";
import { sectionByKey, type Row } from "@/lib/admin/sections";

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
  const { show, created } = await searchParams;
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

  return (
    <ItemEditor
      key={id}
      sectionKey={key}
      id={id === "new" ? null : id}
      initial={row}
      isOwner={role === "owner"}
      portfolio={portfolio}
      justCreated={!!created}
    />
  );
}
