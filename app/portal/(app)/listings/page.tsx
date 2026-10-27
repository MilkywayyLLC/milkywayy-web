/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import Link from "next/link";
import { thumbSrc } from "@/lib/portal/thumbs";
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
import { price as fmtPrice } from "@/lib/share";

export const metadata = { title: "Listings" };

function Stats({ t }: { t: { views: number; wa: number; call: number } }) {
  return (
    <div className="pt-lstats">
      <span>
        <b>{t.views}</b> views
      </span>
      <span>
        <b>{t.wa}</b> WhatsApp
      </span>
      <span>
        <b>{t.call}</b> Call
      </span>
    </div>
  );
}

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
        "id, slug, title, purpose, price, status, expires_on, disabled_at, disabled_reason, created_by, project_id, photo_ids, created_at, agent_user_id, shared_with",
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
          .select("id, source, r2_key, thumb_key, content_type, label")
          .in(
            "id",
            listings.map((l) => l.photo_ids[0]),
          )
      : Promise.resolve({ data: [] }),
  ]);
  const totals = new Map<string, { views: number; wa: number; call: number }>();
  for (const s of stats ?? []) {
    const k = (s.listing_id ?? s.collection_id) as string;
    if (!ids.includes(k)) continue;
    const t = totals.get(k) ?? { views: 0, wa: 0, call: 0 };
    t.views += s.views;
    t.wa += s.wa_taps;
    t.call += s.call_taps;
    totals.set(k, t);
  }
  const zero = { views: 0, wa: 0, call: 0 };
  const cover = new Map((covers ?? []).map((f) => [f.id as string, thumbSrc(f)]));
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
          <div className="pt-lgrid" data-testid="listings">
            {listings.map((l) => {
              const s = shareState(l, day);
              const t = totals.get(l.id) ?? zero;
              const src = cover.get(l.photo_ids[0]);
              return (
                <article key={l.id} className="pt-lcard" aria-label={l.title}>
                  <a
                    href={`/l/${l.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="pt-lcard-img"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {src ? (
                      <img src={src} alt="" loading="lazy" />
                    ) : (
                      <Icon name="photo" size={28} />
                    )}
                  </a>
                  {listings.length > 1 && (
                    <label className="pt-lcard-pick">
                      <input
                        type="checkbox"
                        name="pick"
                        value={l.id}
                        aria-label={`Select ${l.title}`}
                      />
                    </label>
                  )}
                  <div className="pt-lcard-body">
                    <span>
                      <Badge tone={tone(s)}>{STATE_LABEL[s]}</Badge>
                    </span>
                    <b className="pt-title pt-clamp2">{l.title}</b>
                    <span className="pt-meta">
                      {fmtPrice(l.price, "AED", l.purpose)}
                      {l.expires_on && s !== "expired" ? ` · until ${l.expires_on}` : ""}
                    </span>
                    {s === "disabled" && l.disabled_reason && (
                      <span className="pt-meta">Reason: {l.disabled_reason}. WhatsApp us.</span>
                    )}
                    {l.shared_with?.length ? (
                      <span className="pt-meta">Shared with {l.shared_with.length}</span>
                    ) : null}
                    <Stats t={t} />
                    <ShareControls
                      kind="l"
                      id={l.id}
                      slug={l.slug}
                      title={l.title}
                      status={l.status}
                      canEdit={canEdit(l.created_by) || l.agent_user_id === user.id}
                      editOnly={!canEdit(l.created_by)}
                      disabled={s === "disabled"}
                      editHref={`/portal/listings/${l.id}`}
                    />
                  </div>
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
          <div className="pt-lgrid" data-testid="collections">
            {collections.map((c) => {
              const s = shareState(c, day);
              const t = totals.get(c.id) ?? zero;
              const first = listings.find((l) => l.id === c.listing_ids[0]);
              const src = first ? cover.get(first.photo_ids[0]) : null;
              return (
                <article key={c.id} className="pt-lcard" aria-label={c.title}>
                  <span className="pt-lcard-img" aria-hidden="true">
                    {src ? <img src={src} alt="" loading="lazy" /> : <Icon name="grid" size={28} />}
                  </span>
                  <div className="pt-lcard-body">
                    <span>
                      <Badge tone={tone(s)}>{STATE_LABEL[s]}</Badge>
                    </span>
                    <b className="pt-title pt-clamp2">{c.title}</b>
                    <span className="pt-meta">
                      {c.listing_ids.length} listing{c.listing_ids.length === 1 ? "" : "s"}
                      {c.expires_on && s !== "expired" ? ` · until ${c.expires_on}` : ""}
                    </span>
                    <Stats t={t} />
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
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
