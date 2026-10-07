import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListView } from "@/components/admin/ListView";
import { ProofStrip } from "@/components/admin/ProofStrip";
import { requireAdmin } from "@/lib/admin/auth";
import { listRows } from "@/lib/admin/data";
import { sectionByKey } from "@/lib/admin/sections";
import type { Media } from "@/content/types";
import { instagramStatus, reelMedia } from "@/lib/instagram";
import { OUR_INSTAGRAM } from "@/lib/instagram-link";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: sectionByKey((await params).section)?.title ?? "Not found" };
}

export default async function SectionList({ params }: { params: Promise<{ section: string }> }) {
  const { section: key } = await params;
  const section = sectionByKey(key);
  if (!section) notFound();
  const { db } = await requireAdmin();
  const rows = await listRows(db, section);

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

  // Instagram reels that can't play in our player are flagged (owner, 7 Oct 2026).
  const flags: Record<string, string> = {};
  if (key === "portfolio") {
    await Promise.all(
      rows.map(async (r) => {
        const m = r.media as Media | undefined;
        if (m?.source !== "instagram" || !m.instagram?.url) return;
        if (!m.instagram.id)
          flags[r.id] =
            `Instagram link only: not on @${OUR_INSTAGRAM}, so it can’t play on the site.`;
        else if (!(await reelMedia(m.instagram.id)))
          flags[r.id] =
            "Instagram reel unavailable: the site shows its cover with “View on Instagram ↗”.";
      }),
    );
    const ig = await instagramStatus();
    extra = (
      <div className="ad-card" data-testid="instagram-status">
        <h2 className="ad-h2">Instagram</h2>
        <p className="ad-small">
          {!ig.connected
            ? "Not connected. Reels from Instagram show their cover with “View on Instagram ↗” until INSTAGRAM_ACCESS_TOKEN is set (LAUNCH.md → Instagram)."
            : ig.account.ok
              ? `Connected as @${ig.account.username}. The token renews itself every week${ig.expiresAt ? `; current one valid until ${new Date(ig.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`
              : `Connected, but Instagram refused the token: ${ig.account.error} Replace INSTAGRAM_ACCESS_TOKEN in Vercel.`}
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <ListView sectionKey={key} rows={rows} extra={extra} flags={flags} />
    </Suspense>
  );
}
