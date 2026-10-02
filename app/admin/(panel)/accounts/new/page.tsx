import Link from "next/link";
import { ClientCreateForm } from "@/components/admin/ClientCreateForm";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "New client" };

export default async function NewClient() {
  await requireAdmin({ owner: true });
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/accounts" prefetch={false}>
            ← Client accounts
          </Link>
          <h1 className="ad-h1">New client</h1>
          <span className="ad-small ad-muted">
            Creates the account and invites its owner. They land in it the first time they sign in.
          </span>
        </div>
      </div>
      <ClientCreateForm />
    </div>
  );
}
