import { redirect } from "next/navigation";
import { TwoFactor } from "@/components/admin/TwoFactor";
import { getAdmin } from "@/lib/admin/auth";

export const metadata = { title: "Two-factor" };

export default async function TwoFactorPage() {
  const a = await getAdmin();
  if (a.state === "signed-out") redirect("/admin/login");
  if (a.state === "no-access") redirect("/admin/no-access");
  if (a.state === "ok") redirect("/admin");
  return (
    <main className="ad-auth">
      <div className="ad-card">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="ad-eb">{a.email}</span>
          <h1 className="ad-h1">
            {a.state === "mfa-enroll" ? "Set up two-factor" : "Enter your code"}
          </h1>
        </div>
        <TwoFactor mode={a.state === "mfa-enroll" ? "enroll" : "verify"} />
      </div>
    </main>
  );
}
