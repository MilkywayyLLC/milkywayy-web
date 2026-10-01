import type { Metadata } from "next";
import Link from "next/link";
import { AgentContact, Byline } from "@/components/portal-mock/Public";
import { LISTINGS } from "@/lib/portal-mock/data";

export const metadata: Metadata = {
  title: "3 homes picked for you",
  robots: { index: false, follow: false },
};

const EXTRA = {
  slug: "burj-vista-3br-penthouse",
  title: "2 bed in Marina Gate 1 with sea view",
  price: "AED 2,850,000",
  place: "Marina Gate 1, Dubai Marina",
  photo: "interior" as const,
  facts: ["2 Bed", "3 Bath", "1,320 sq ft"],
};

/** Public collection page (guide §6.3). Mockup of /c/<slug>. */
export default function CollectionPage() {
  const homes = [...LISTINGS, EXTRA];
  return (
    <main className="pt-public" id="main">
      <div className="pt-public-body">
        <span className="pt-eb">Picked by Rania Haddad · Harbourline Properties</span>
        <h1 className="pt-h1">3 homes picked for you</h1>
        <p className="pt-muted" style={{ margin: 0 }}>
          Hi Imran and Sara, here are the three we talked about. Tap any one for photos, video and
          the 360 tour.
        </p>
        {homes.map((h, i) => (
          <Link
            key={i}
            href={`/portal-preview/l/${h.slug}`}
            className="pt-card pt-card-link"
            style={{ padding: 0, gap: 0 }}
          >
            <div
              className={`pt-ph ph-${h.photo}`}
              style={{ aspectRatio: "16 / 10" }}
              role="img"
              aria-label={h.title}
            />
            <div style={{ display: "grid", gap: 4, padding: 14 }}>
              <span className="pt-price" style={{ fontSize: 22 }}>
                {h.price}
              </span>
              <b>{h.title}</b>
              <span className="pt-meta">
                {h.place} · {h.facts.slice(0, 3).join(" · ")}
              </span>
            </div>
          </Link>
        ))}
        <AgentContact title="3 homes picked for you" url="milkywayy.com/c/picked-for-the-khans" />
      </div>
      <Byline />
    </main>
  );
}
