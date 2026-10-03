import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { ListingForm } from "@/components/portal/ListingForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { listingFormData } from "@/lib/portal/listing-data";
import type { Project } from "@/lib/portal/projects";

export const metadata = { title: "New share link" };

/** Create a share page (§6.1): pick a delivered shoot, then fill in the sheet. */
export default async function NewListing({
  searchParams,
}: {
  searchParams: Promise<{ shoot?: string }>;
}) {
  const { shoot } = await searchParams;
  const { db, current } = await requireAccount(
    `/portal/listings/new${shoot ? `?shoot=${encodeURIComponent(shoot)}` : ""}`,
  );
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("account_id", current.account.id)
    .eq("type", "shoot")
    .in("status", ["delivered", "completed"])
    .order("delivered_at", { ascending: false });
  const shoots = (data ?? []) as (Project & { listing_defaults: null })[];
  const p = shoot ? shoots.find((s) => s.ref === shoot) : undefined;

  if (!p)
    return (
      <>
        <Back href="/portal/listings" label="Listings" />
        <h1 className="pt-h1">New share link</h1>
        {shoot && (
          <p className="pt-error" role="alert">
            That shoot isn’t delivered yet, or isn’t yours to share.
          </p>
        )}
        {shoots.length === 0 ? (
          <div className="pt-card">
            <b>No delivered shoots yet</b>
            <span className="pt-meta">Share pages are made from delivered property shoots.</span>
          </div>
        ) : (
          <section className="pt-list" aria-label="Choose a delivered shoot">
            {shoots.map((s) => (
              <Link
                key={s.id}
                href={`/portal/listings/new?shoot=${encodeURIComponent(s.ref)}`}
                className="pt-row"
                style={{ textDecoration: "none" }}
              >
                <div>
                  <b>{s.title}</b>
                  <div className="pt-meta">{s.ref}</div>
                </div>
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </section>
        )}
      </>
    );

  const f = await listingFormData(db, current.account, p);
  return (
    <>
      <Back href="/portal/listings" label="Listings" />
      <h1 className="pt-h1">Create share link</h1>
      {f.photos.length === 0 ? (
        <div className="pt-card">
          <b>No photos on this shoot yet</b>
          <span className="pt-meta">
            Share pages need the delivered photos. Ask us in Messages.
          </span>
        </div>
      ) : (
        <ListingForm projectId={p.id} {...f} />
      )}
    </>
  );
}
