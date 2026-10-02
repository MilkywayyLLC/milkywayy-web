import { Coming } from "@/components/portal/Coming";
import { requireAccount } from "@/lib/portal/auth";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Billing" };

/** Owner and Admins only (§5.1); Members never see prices (§13). */
export default async function Billing() {
  const { current } = await requireAccount("/portal/billing");
  if (!isManager(current))
    return (
      <div className="pt-card">
        <b>Billing is for the account’s owner and admins</b>
        <span className="pt-meta">Ask them if you need an invoice.</span>
      </div>
    );
  return (
    <Coming
      eyebrow={`Owner and admins only · ${current.account.currency}`}
      title="Billing"
      what="Your invoices (with PDF downloads), this month’s running total for pay-as-you-go work, and your plan."
      today="Until then, invoices keep coming by email after each delivery."
      ask="Hi, I have a question about an invoice."
    />
  );
}
