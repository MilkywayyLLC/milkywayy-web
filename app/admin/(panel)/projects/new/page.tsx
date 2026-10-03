import Link from "next/link";
import { AdminNewProject } from "@/components/admin/ClientProjectTools";
import { portalAdminPage, type ClientListRow } from "@/lib/portal/admin";

export const metadata = { title: "New project" };

/** A project for a client (bookings by WhatsApp or phone, work agreed outside the portal). */
export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const rpc = await portalAdminPage();
  const { account } = await searchParams;
  const clients = await rpc<ClientListRow[]>("portal_admin_clients", {});
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href="/admin/projects" prefetch={false}>
            ← Projects
          </Link>
          <h1 className="ad-h1">New project</h1>
          <span className="ad-small ad-muted">
            It shows in the client’s portal straight away. No client yet? Create one in Client
            accounts first.
          </span>
        </div>
      </div>
      <AdminNewProject
        clients={(clients ?? [])
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        account={account}
      />
    </div>
  );
}
