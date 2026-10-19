import Link from "next/link";
import { notFound } from "next/navigation";
import { PastProjectForm } from "@/components/admin/PastProjectForm";
import { portalAdminPage, type ClientDetail } from "@/lib/portal/admin";

export const metadata = { title: "Add past project" };

/** A client's earlier work, added by hand (owner, 4 Oct 2026: no import from the old portal). */
export default async function AddPastProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const c = await rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: false });
  if (!c) notFound();
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href={`/admin/accounts/${id}`} prefetch={false}>
            ← {c.account.name}
          </Link>
          <h1 className="ad-h1">Add past project</h1>
          <span className="ad-small ad-muted">
            Earlier work from before the portal: it shows in the client’s dashboard as completed,
            with downloads. Files are kept for the client’s retention period (12 months unless
            changed) from the day you add them.
          </span>
        </div>
      </div>
      <PastProjectForm account={id} />
    </div>
  );
}
