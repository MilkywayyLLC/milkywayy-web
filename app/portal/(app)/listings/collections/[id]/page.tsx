import { notFound } from "next/navigation";
import { CollectionForm } from "@/components/portal/CollectionForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { collectionChoices } from "@/lib/portal/collection-data";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Edit collection" };

export default async function EditCollection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user, current } = await requireAccount(`/portal/listings/collections/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: c } = await db.from("collections").select("*").eq("id", id).maybeSingle();
  if (!c || c.account_id !== current.account.id) notFound();
  if (!isManager(current) && c.created_by !== user.id)
    return (
      <>
        <Back href="/portal/listings" label="Listings" />
        <div className="pt-card">
          <b>Only its author and the account’s admins can edit this collection</b>
        </div>
      </>
    );
  const { listings, contacts } = await collectionChoices(db, current.account.id);
  return (
    <>
      <Back href="/portal/listings" label="Listings" />
      <span className="pt-eb">{`/c/${c.slug}`}</span>
      <h1 className="pt-h1">Edit collection</h1>
      <CollectionForm
        id={c.id}
        initial={{
          title: c.title,
          note: c.note ?? "",
          listing_ids: c.listing_ids,
          contact_ids: c.contact_ids,
          expires_on: c.expires_on ?? "",
        }}
        listings={listings}
        contacts={contacts}
      />
    </>
  );
}
