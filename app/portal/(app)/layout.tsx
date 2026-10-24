import { railPlanOf, type BillingPayments } from "@/components/portal/PaymentParts";
import { Shell } from "@/components/portal/Shell";
import { StartRequests } from "@/components/portal/StartRequests";
import { Hydrated } from "@/components/ui/Hydrated";
import { contactOf, requireAccount } from "@/lib/portal/auth";
import { requestConfig } from "@/lib/portal/requests";
import { portalTabs, seesMoney } from "@/lib/portal/shell";

/** Signed-in portal pages: the shell from the approved mockup around every tab. */
export default async function PortalApp({ children }: { children: React.ReactNode }) {
  const { db, user, memberships, current } = await requireAccount("/portal");
  const manager = seesMoney(current);
  const [{ data: profile }, { data: plan }, cfg, { data: unpaid }, { data: payments }] =
    await Promise.all([
      db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      // The plan badge (§5.1): Owner and Admins only (RLS hides plans from Members).
      manager
        ? db
            .from("account_plans")
            .select("mode, package:packages(name)")
            .eq("account_id", current.account.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      requestConfig(db, current).catch((e) => {
        console.error("[portal] request config:", e);
        return null;
      }),
      // The bell's red dot: unpaid invoices (those who see billing only).
      manager
        ? db.rpc("my_unpaid_count", { p_account: current.account.id })
        : Promise.resolve({ data: null }),
      // The sidebar's plan card (owner, 24 Oct 2026): package meter, or how they pay per shoot.
      manager
        ? db.rpc("my_billing_payments", { p_account: current.account.id })
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
      action={cfg ? <StartRequests cfg={cfg} autoOpen /> : undefined}
      me={{ name, first: (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "" }}
      unpaid={manager ? Number(unpaid ?? 0) : null}
      railPlan={railPlanOf(payments as BillingPayments | null)}
    >
      <Hydrated />
      {children}
    </Shell>
  );
}
