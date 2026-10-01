import { AdminsManager } from "@/components/admin/AdminsManager";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "Admins" };

export default async function Admins() {
  const { db, email } = await requireAdmin({ owner: true });
  const { data } = await db.from("admins").select("email, role").order("role").order("email");
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Settings</span>
          <h1 className="ad-h1">Admins</h1>
        </div>
      </div>
      <p className="ad-note">
        Owners can change everything and must use two-factor. Editors can change content (portfolio,
        case studies, before/after, AI avatars, reviews, FAQs, stats, clients) but not prices,
        settings, leads or this list.
      </p>
      <AdminsManager admins={data ?? []} me={email} />
    </div>
  );
}
