import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin/auth";

/** Every page in here needs a fully signed-in admin (Owners: with their two-factor code). */
export default async function Panel({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  return (
    <div className="ad-shell">
      <AdminNav role={a.role} email={a.email} />
      <main className="ad-main" id="main">
        {children}
      </main>
    </div>
  );
}
