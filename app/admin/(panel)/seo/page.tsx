import { SeoEditor } from "@/components/admin/SeoEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { SEO_PAGES } from "@/lib/seo/pages";

export const metadata = { title: "SEO" };

export default async function Seo() {
  const { db } = await requireAdmin();
  const { data } = await db.from("seo_pages").select("page, title, description, og_image");
  const rows = Object.fromEntries((data ?? []).map((r) => [r.page, r]));
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Settings</span>
          <h1 className="ad-h1">SEO</h1>
        </div>
      </div>
      <p className="ad-note">
        How each page appears in Google and when shared on WhatsApp, LinkedIn or Facebook. Every
        page already has a title, description and share image; change them here only when you want
        different wording.
      </p>
      <SeoEditor pages={SEO_PAGES} rows={rows} />
    </div>
  );
}
