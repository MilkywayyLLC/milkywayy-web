import { CollectionForm } from "@/components/portal/CollectionForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { collectionChoices } from "@/lib/portal/collection-data";

export const metadata = { title: "New collection" };

/** Several listings on one link (§6.3). */
export default async function NewCollection() {
  const { db, current } = await requireAccount("/portal/listings/collections/new");
  const { listings, contacts } = await collectionChoices(db, current.account.id);
  return (
    <>
      <Back href="/portal/listings" label="Listings" />
      <h1 className="pt-h1">New collection</h1>
      {listings.length === 0 ? (
        <div className="pt-card">
          <b>Make a share page first</b>
          <span className="pt-meta">
            A collection puts several of your share pages on one link.
          </span>
        </div>
      ) : (
        <CollectionForm
          initial={{
            title: "Homes picked for you",
            note: "",
            listing_ids: listings.slice(0, 3).map((l) => l.id),
            contact_ids: contacts.slice(0, 1).map((c) => c.id),
            expires_on: "",
          }}
          listings={listings}
          contacts={contacts}
        />
      )}
    </>
  );
}
