import { notFound, redirect } from "next/navigation";
import { portalAdminPage, type ProjectListRow } from "@/lib/portal/admin";

/**
 * A website booking by its ref (admin redesign, 27 Oct 2026): the project first, the lead second.
 * One project → it; several (a booking with more than one property: MW-1747-1, -2) → the list;
 * none yet → back to the lead.
 */
export default async function ProjectByRef({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!/^[A-Za-z0-9-]{3,40}$/.test(ref)) notFound();
  const rpc = await portalAdminPage();
  const rows = await rpc<ProjectListRow[]>("portal_admin_projects", { p_q: ref });
  const mine = rows.filter((r) => r.ref === ref || r.ref.startsWith(`${ref}-`));
  if (mine.length === 1) redirect(`/admin/projects/${mine[0].id}`);
  if (mine.length > 1) redirect(`/admin/projects?q=${encodeURIComponent(ref)}&type=all`);
  redirect(`/admin/leads/${encodeURIComponent(ref)}?project=none`);
}
