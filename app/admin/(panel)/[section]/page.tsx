import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListView } from "@/components/admin/ListView";
import { ProofStrip } from "@/components/admin/ProofStrip";
import { requireAdmin } from "@/lib/admin/auth";
import { listRows } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: sectionByKey((await params).section)?.title ?? "Not found" };
}

export default async function SectionList({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: key } = await params;
  const section = sectionByKey(key);
  if (!section) notFound();
  // The portfolio list became the Library (Admin → Content → Library).
  if (key === "portfolio") redirect("/admin/library");
  const { db } = await requireAdmin();
  const rows = await listRows(db, section);
  const tags: Record<string, string[]> = {};

  let extra: React.ReactNode = null;
  if (key === "clients") {
    const { data } = await db.from("proof_strip_pages").select("page, enabled");
    extra = (
      <ProofStrip initial={Object.fromEntries((data ?? []).map((r) => [r.page, r.enabled]))} />
    );
  }
  if (key === "avatars")
    extra = (
      <div className="ad-card">
        <h2 className="ad-h2">Hero (Adam)</h2>
        <p className="ad-small ad-muted">
          The hero video, caption line and reveal text on the AI avatars page.
        </p>
        <div>
          <Link className="ad-btn ghost small" href="/admin/avatar-hero">
            Edit the hero
          </Link>
        </div>
      </div>
    );

  const flags: Record<string, string> = {};

  return (
    <Suspense>
      <ListView sectionKey={key} rows={rows} extra={extra} flags={flags} tags={tags} />
    </Suspense>
  );
}
