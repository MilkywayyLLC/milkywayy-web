/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import Link from "next/link";
import { Icon } from "@/components/portal/Icon";
import { ShareControls } from "@/components/portal/ListingParts";
import { DraftsRow } from "@/components/portal/StartRequests";
import { ShareSelectedBar } from "@/components/portal/ShareSelected";
import { Badge } from "@/components/portal/ui";
import { can } from "@/lib/portal/access";
import { requireAccount } from "@/lib/portal/auth";
import { myDrafts } from "@/lib/portal/draft-actions";
import {
  shareState,
  STATE_LABEL,
  type CollectionRow,
  type ListingRow,
} from "@/lib/portal/listings";
import { isManager } from "@/lib/portal/shell";
import { presign, r2Ready } from "@/lib/r2";
import { price as fmtPrice } from "@/lib/share";

export const metadata = { title: "Listings" };

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const tone = (s: ReturnType<typeof shareState>) =>
  s === "live" ? "ok" : s === "disabled" ? "warn" : undefined;

/**
 * Listings (§6): share pages made from delivered shoots, and collections of them, with views and
 * WhatsApp/Call taps. Everyone in the account; Members see the ones they made unless the account
 * shares everything. No prices of ours here, only the listing's own asking price.
 */
export default async function Listings() {
  const { db, user, current } = await requireAccount("/portal/listings");
  if (!can(current, "listings"))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include listings</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const a = current.account.id;
  const [{ data: ls }, { data: cs }, { data: shoots }, drafts] = await Promise.all([
    db
      .from("listings")
      .select(
        "id, slug, title, purpose, price, status, expires_on, disabled_at, disabled_reason, created_by, project_id, photo_ids, created_at",
      )
      .eq("account_id", a)
      .order("created_at", { ascending: false }),
    db
      .from("collections")
      .select(
        "id, slug, title, note, listing_ids, contact_ids, status, expires_on, disabled_at, disabled_reason, created_by, created_at",
      )
      .eq("account_id", a)
      .order("created_at", { ascending: false }),
    db
      .from("projects")
      .select("id, ref, title, status")
      .eq("account_id", a)
      .eq("type", "shoot")
      .in("status", ["delivered", "completed"])
      .order("delivered_at", { ascending: false }),
    myDrafts(),
  ]);
  const listings = (ls ?? []) as ListingRow[];
  const collections = (cs ?? []) as CollectionRow[];
  const ids = [...listings.map((l) => l.id), ...collections.map((c) => c.id)];
  const [{ data: stats }, { data: covers }] = await Promise.all([
    // RLS returns the stats of the pages this person can see; keep this account's.
    ids.length
      ? db.from("share_stats").select("listing_id, collection_id, views, wa_taps, call_taps")
      : Promise.resolve({ data: [] }),
    listings.length
      ? db
          .from("project_files")
          .select("id, thumb_key")
          .in(
            "id",
            listings.map((l) => l.photo_ids[0]),
          )
      : Promise.resolve({ data: [] }),
  ]);
  const totals = new Map<string, { views: number; taps: number }>();
  for (const s of stats ?? []) {
    const k = (s.listing_id ?? s.collection_id) as string;
    if (!ids.includes(k)) continue;
    const t = totals.get(k) ?? { views: 0, taps: 0 };
    t.views += s.views;
    t.taps += s.wa_taps + s.call_taps;
    totals.set(k, t);
  }
  const cover = new Map(
    (covers ?? []).map((f) => [
      f.id as string,
      f.thumb_key && r2Ready() ? presign("GET", f.thumb_key, 3600) : null,
    ]),
  );
  const canEdit = (createdBy: string | null) => isManager(current) || createdBy === user.id;
  const day = today();
  const shootList = (shoots ?? []) as { id: string; ref: string; title: string }[];
  const draftShoot = shootList.find(
    (x) => x.id === drafts.find((d) => d.kind === "listing")?.data.project,
  );
  const listingResume = draftShoot
    ? `/portal/listings/new?shoot=${encodeURIComponent(draftShoot.ref)}`
    : "/portal/listings/new";

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Share pages for your delivered shoots</span>
          <h1 className="pt-h1">Listings</h1>
        </div>
        {shootList.length > 0 && (
          <Link href="/portal/listings/new" className="btn btn-p btn-s">
            <Icon name="plus" size={16} /> New share link
          </Link>
        )}
      </div>

      <DraftsRow
        drafts={drafts.filter((d) => d.kind === "listing")}
        hrefs={{ listing: listingResume }}
      />
      {listings.length === 0 ? (
        <div className="pt-card">
          <span className="pt-meta">
            {shootList.length
              ? "No share pages yet. Make one from a delivered shoot and send the link."
              : "No share pages yet. Once a shoot is delivered, make one here."}
          </span>
        </div>
      ) : (
        <>
          {listings.length > 1 && <ShareSelectedBar />}
          <div className="pt-grid2" data-testid="listings">
            {listings.map((l) => {
              const s = shareState(l, day);
              const t = totals.get(l.id) ?? { views: 0, taps: 0 };
              const src = cover.get(l.photo_ids[0]);
              return (
                <article key={l.id} className="pt-card" aria-label={l.title}>
                  {listings.length > 1 && (
                    <label className="pt-check pt-small">
                      <input
                        type="checkbox"
                        name="pick"
                        value={l.id}
                        aria-label={`Select ${l.title}`}
                      />{" "}
                      Select
                    </label>
                  )}
                  <div className="pt-listing">
                    {src ? (
                      <img src={src} alt="" className="pt-listing-img" loading="lazy" />
                    ) : (
                      <span className="pt-listing-img" />
                    )}
                    <div style={{ display: "grid", gap: 2, alignContent: "start", minWidth: 0 }}>
                      <span>
                        <Badge tone={tone(s)}>{STATE_LABEL[s]}</Badge>
                      </span>
                      <b className="pt-title">{l.title}</b>
                      <span className="pt-meta">
                        {fmtPrice(l.price, "AED", l.purpose)}
                        {l.expires_on && s !== "expired" ? ` · until ${l.expires_on}` : ""}
                      </span>
                      {s === "disabled" && l.disabled_reason && (
                        <span className="pt-meta">Reason: {l.disabled_reason}. WhatsApp us.</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div className="pt-stat">
                      <b>{t.views}</b>
                      <span className="pt-meta">views</span>
                    </div>
                    <div className="pt-stat">
                      <b>{t.taps}</b>
                      <span className="pt-meta">WhatsApp/Call taps</span>
                    </div>
                  </div>
                  <ShareControls
                    kind="l"
                    id={l.id}
                    slug={l.slug}
                    title={l.title}
                    status={l.status}
                    canEdit={canEdit(l.created_by)}
                    disabled={s === "disabled"}
                    editHref={`/portal/listings/${l.id}`}
                  />
                </article>
              );
            })}
          </div>
        </>
      )}

      <section style={{ display: "grid", gap: 10 }} aria-labelledby="coll">
        <div className="pt-row">
          <h2 id="coll" className="pt-h2">
            Collections
          </h2>
          {listings.length > 0 && (
            <Link href="/portal/listings/collections/new" className="lnk pt-small">
              + New collection
            </Link>
          )}
        </div>
        {collections.length === 0 ? (
          <span className="pt-meta">
            Several listings on one link, e.g. “3 homes picked for the Khans”.
          </span>
        ) : (
          <div className="pt-list" data-testid="collections">
            {collections.map((c) => {
              const s = shareState(c, day);
              const t = totals.get(c.id) ?? { views: 0, taps: 0 };
              return (
                <div key={c.id} className="pt-row" style={{ flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <b>{c.title}</b> <Badge tone={tone(s)}>{STATE_LABEL[s]}</Badge>
                    <div className="pt-meta">
                      {c.listing_ids.length} listing{c.listing_ids.length === 1 ? "" : "s"} ·{" "}
                      {t.views} views · {t.taps} taps
                    </div>
                  </div>
                  <ShareControls
                    kind="c"
                    id={c.id}
                    slug={c.slug}
                    title={c.title}
                    status={c.status}
                    canEdit={canEdit(c.created_by)}
                    disabled={s === "disabled"}
                    editHref={`/portal/listings/collections/${c.id}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
