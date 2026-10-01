import { DocEditor } from "@/components/admin/DocEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getDraft, liveDoc } from "@/lib/admin/data";
import { docByKey } from "@/lib/admin/docs";

export const metadata = { title: "Site settings" };

export default async function Page() {
  const { db, role } = await requireAdmin({ owner: true });
  const doc = docByKey("site")!;
  const [live, draft] = await Promise.all([liveDoc(db, doc), getDraft(db, doc.key)]);
  return <DocEditor docKey={doc.key} live={live} draft={draft} isOwner={role === "owner"} />;
}
