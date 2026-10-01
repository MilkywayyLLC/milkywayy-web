import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin/auth";
import { signOut } from "@/lib/admin/auth-actions";

export const metadata = { title: "No access" };

/** Signed in, but not on the admins list. Nothing else is shown or reachable. */
export default async function NoAccess() {
  const a = await getAdmin();
  if (a.state === "signed-out") redirect("/admin/login");
  if (a.state !== "no-access") redirect("/admin");
  return (
    <main className="ad-auth">
      <div className="ad-card">
        <h1 className="ad-h1">No access</h1>
        <p>
          {a.email} isn’t an admin. Ask the Owner to add you, or sign in with a different account.
        </p>
        <form action={signOut}>
          <button className="ad-btn" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
