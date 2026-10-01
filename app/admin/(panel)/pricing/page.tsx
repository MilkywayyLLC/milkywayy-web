import { PricingEditor } from "@/components/admin/PricingEditor";
import type { PropertyPricing } from "@/content/types";
import { requireAdmin, TEST_ACCOUNTS } from "@/lib/admin/auth";
import { getDraft, livePricing } from "@/lib/admin/data";
import type { Change } from "@/lib/admin/fields";

export const metadata = { title: "Property shoot prices" };

export default async function Pricing() {
  const { db } = await requireAdmin({ owner: true });
  const [live, draft, history] = await Promise.all([
    livePricing(db),
    getDraft(db, "pricing_property"),
    db
      .from("change_log")
      .select("at, admin_email, summary, details")
      .eq("entity", "pricing")
      .not("admin_email", "like", TEST_ACCOUNTS)
      .order("at", { ascending: false })
      .limit(20),
  ]);
  return (
    <PricingEditor
      live={live}
      draft={draft as { value: PropertyPricing; updated_by: string; updated_at: string } | null}
      history={
        (history.data ?? []) as {
          at: string;
          admin_email: string;
          summary: string;
          details: Change[];
        }[]
      }
    />
  );
}
