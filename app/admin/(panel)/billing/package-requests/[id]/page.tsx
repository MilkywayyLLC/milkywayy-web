import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferBuilder, type RequestDetail } from "@/components/admin/PackageRequests";
import { dubai } from "@/lib/admin/format";
import { portalAdminPage } from "@/lib/portal/admin";

export const metadata = { title: "Package request" };

type Props = { params: Promise<{ id: string }> };

/** One package request and its builder (owner, 28 Oct 2026). */
export default async function PackageRequestPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const r = await rpc<RequestDetail | null>("portal_admin_package_request", { p_id: id });
  if (!r) notFound();
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">
            <Link href="/admin/billing/package-requests">Package requests</Link>
          </span>
          <h1 className="ad-h1">
            <Link href={`/admin/accounts/${r.account_id}`}>{r.account}</Link>
          </h1>
          <span className="ad-small ad-muted">
            Asked {dubai(r.created_at, true)}
            {r.created_email ? ` by ${r.created_email}` : ""}
            {r.plan_mode !== "payg" ? ` · already on a ${r.plan_mode} plan` : ""}
          </span>
        </div>
      </div>
      {r.status === "accepted" && (
        <p className="ad-note">
          Accepted
          {r.accepted_option === "six"
            ? " (6 months)"
            : r.accepted_option === "usage"
              ? " (pay for what you use from month 2)"
              : " (upfront monthly)"}
          . The plan is on the account and the first invoice is published.
        </p>
      )}
      {r.status === "six_requested" && (
        <p className="ad-note warn">
          They chose the 6-month plan. Confirm it to set the plan and publish the first instalment.
        </p>
      )}
      <OfferBuilder r={r} />
    </div>
  );
}
