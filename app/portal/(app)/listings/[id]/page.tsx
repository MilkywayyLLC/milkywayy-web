import { notFound } from "next/navigation";
import { ShareWith } from "@/components/portal/ShareWith";
import { teammates } from "@/lib/portal/agents";
import { ListingForm } from "@/components/portal/ListingForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { listingFormData } from "@/lib/portal/listing-data";
import type { ListingInput } from "@/lib/portal/listings";
import type { Project } from "@/lib/portal/projects";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Edit share page" };

/** Edit a share page: the same sheet, filled in with what's on it now. */
export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user, current } = await requireAccount(`/portal/listings/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: l } = await db.from("listings").select("*").eq("id", id).maybeSingle();
  if (!l || l.account_id !== current.account.id) notFound();
  if (!isManager(current) && l.created_by !== user.id && l.agent_user_id !== user.id)
    return (
      <>
        <Back href="/portal/listings" label="Listings" />
        <div className="pt-card">
          <b>Only its author and the account’s admins can edit this page</b>
        </div>
      </>
    );
  const { data: p } = await db.from("projects").select("*").eq("id", l.project_id).maybeSingle();
  if (!p) notFound();
  const editing: Partial<ListingInput> = {
    ...l,
    price: String(l.price),
    baths: l.baths == null ? "" : String(l.baths),
    size_sqft: l.size_sqft == null ? "" : String(l.size_sqft),
    reel_id: l.reel_id ?? "",
    expires_on: l.expires_on ?? "",
    agent_contact_id: l.agent_contact_id ?? "",
  };
  const admin = current.role === "owner" || current.role === "admin";
  const team = admin ? await teammates(db, current.account.id) : [];
  const f = await listingFormData(db, current.account, p as Project, editing, user.id);
  return (
    <>
      <Back href="/portal/listings" label="Listings" />
      <span className="pt-eb">{`/l/${l.slug}`}</span>
      <h1 className="pt-h1">Edit share page</h1>
      {admin && team.length > 1 && (
        <ShareWith kind="l" id={l.id} team={team} chosen={l.shared_with ?? []} />
      )}
      <ListingForm id={l.id} {...f} />
    </>
  );
}
