import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListView } from "@/components/admin/ListView";
import { ProofStrip } from "@/components/admin/ProofStrip";
import { requireAdmin } from "@/lib/admin/auth";
import { listRows } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: sectionByKey((await params).section)?.title ?? "Not found" };
}

export default async function SectionList({ params }: { params: Promise<{ section: string }> }) {
  const { section: key } = await params;
  const section = sectionByKey(key);
  if (!section) notFound();
  const { db } = await requireAdmin();
  const rows = await listRows(db, section);

  let extra = null;
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

  return (
    <Suspense>
      <ListView sectionKey={key} rows={rows} extra={extra} />
    </Suspense>
  );
}
