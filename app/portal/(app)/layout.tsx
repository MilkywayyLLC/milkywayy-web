import { Shell } from "@/components/portal/Shell";
import { Hydrated } from "@/components/ui/Hydrated";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { initials, isManager, portalTabs } from "@/lib/portal/shell";

/** Signed-in portal pages: the shell from the approved mockup around every tab. */
export default async function PortalApp({ children }: { children: React.ReactNode }) {
  const { db, user, memberships, current } = await requireAccount("/portal");
  const manager = isManager(current);
  const [{ data: profile }, { data: plan }] = await Promise.all([
    db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    // The plan badge (§5.1): Owner and Admins only (RLS hides plans from Members).
    manager
      ? db
          .from("account_plans")
          .select("mode, package:packages(name)")
          .eq("account_id", current.account.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const pkg = (plan as { mode?: string; package?: { name: string } | null } | null) ?? null;
  const planLabel = !manager
    ? ""
    : pkg?.mode === "budget"
      ? "Monthly package"
      : pkg?.mode === "package" && pkg.package
        ? `Monthly: ${pkg.package.name}`
        : "Pay as you go";
  const tabs = portalTabs(current);
  const name = profile?.full_name || contactOf(user);
  return (
    <Shell
      main={tabs.main}
      account={tabs.account}
      accounts={memberships.map((m) => ({ id: m.account.id, name: m.account.name, role: m.role }))}
      currentId={current.account.id}
      plan={planLabel}
      me={{ name, initials: initials(profile?.full_name || current.account.name) }}
    >
      <Hydrated />
      {children}
    </Shell>
  );
}
