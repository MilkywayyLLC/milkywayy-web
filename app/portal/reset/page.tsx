import { ResetForm } from "@/components/portal/ResetForm";
import { requirePortalUser } from "@/lib/portal/auth";

export const metadata = { title: "New password" };

/** Reached from the "set a new password" email (signed in by the link). */
export default async function Reset() {
  const p = await requirePortalUser("/portal/reset");
  return (
    <main className="pt-auth" id="main">
      <div className="pt-card">
        <span className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </span>
        <div>
          <span className="pt-eb">{p.user.email}</span>
          <h1 className="pt-h1">New password</h1>
        </div>
        <ResetForm />
      </div>
    </main>
  );
}
