import { Shell } from "@/components/portal/Shell";
import { Hydrated } from "@/components/ui/Hydrated";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { initials, portalTabs } from "@/lib/portal/shell";

/** Signed-in portal pages: the shell from the approved mockup around every tab. */
export default async function PortalApp({ children }: { children: React.ReactNode }) {
  const { db, user, memberships, current } = await requireAccount("/portal");
  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const tabs = portalTabs(current);
  const name = profile?.full_name || contactOf(user);
  return (
    <Shell
      main={tabs.main}
      account={tabs.account}
      accounts={memberships.map((m) => ({ id: m.account.id, name: m.account.name, role: m.role }))}
      currentId={current.account.id}
      // Plans and packages arrive in Phase 12; everyone is pay as you go until then.
      plan="Pay as you go"
      me={{ name, initials: initials(profile?.full_name || current.account.name) }}
    >
      <Hydrated />
      {children}
    </Shell>
  );
}
