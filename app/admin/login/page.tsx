import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdmin } from "@/lib/admin/auth";

export const metadata = { title: "Sign in" };

export default async function Login() {
  const a = await getAdmin();
  if (a.state === "ok") redirect("/admin");
  if (a.state === "mfa-enroll" || a.state === "mfa-verify") redirect("/admin/two-factor");
  return (
    <main className="ad-auth">
      <div className="ad-card">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="ad-eb">Milkywayy</span>
          <h1 className="ad-h1">Admin sign in</h1>
        </div>
        <LoginForm />
        <p className="ad-small ad-muted">
          No sign-up here. Admin accounts are created by the Owner.
        </p>
      </div>
    </main>
  );
}
