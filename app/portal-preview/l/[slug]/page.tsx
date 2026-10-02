import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentContact, Byline } from "@/components/portal-mock/Public";
import { Icon } from "@/components/portal/Icon";
import { LISTINGS } from "@/lib/portal-mock/data";
import type { PlaceholderKey } from "@/content/types";

const GALLERY: PlaceholderKey[] = ["interior", "kitchen", "bath", "dusk", "aerial", "night"];

export function generateStaticParams() {
  return LISTINGS.map((l) => ({ slug: l.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = LISTINGS.find((x) => x.slug === slug);
  return { title: l?.title ?? "Listing", robots: { index: false, follow: false } };
}

/** Public listing share page (guide §6.2). Mockup of /l/<slug>. */
export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const l = LISTINGS.find((x) => x.slug === slug);
  if (!l) notFound();
  const url = `milkywayy.com/l/${l.slug}`;

  return (
    <main className="pt-public" id="main">
      <div
        className={`pt-ph pt-public-hero ph-${l.photo}`}
        role="img"
        aria-label={`${l.title}: main photo`}
      >
        <span className="pt-badge solid" style={{ position: "absolute", right: 12, bottom: 12 }}>
          1 / 28 · View all
        </span>
      </div>
      <div className="pt-public-body">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="pt-eb">
            For {l.purpose === "Sale" ? "sale" : "rent"} · {l.place}
          </span>
          <span className="pt-price">{l.price}</span>
          <h1 className="pt-h2" style={{ fontSize: 22 }}>
            {l.title}
          </h1>
        </div>
        <div className="pt-facts">
          {l.facts.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      </div>
      <div className="pt-swipe" aria-label="Gallery">
        {GALLERY.map((k, i) => (
          <div key={i} className={`pt-ph ph-${k}`} role="img" aria-label={`Photo ${i + 2}`} />
        ))}
      </div>
      <div className="pt-public-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div
            className="pt-ph ph-night"
            style={{ aspectRatio: "9 / 12", display: "grid", placeItems: "center", color: "#fff" }}
            role="img"
            aria-label="Video tour"
          >
            <span
              style={{
                display: "grid",
                justifyItems: "center",
                gap: 6,
                position: "relative",
                zIndex: 1,
              }}
            >
              <Icon name="play" size={34} />
              <b className="pt-mono">Video · 0:45</b>
            </span>
          </div>
          <div
            className="pt-card"
            style={{ alignContent: "center", justifyItems: "center", textAlign: "center" }}
          >
            <b className="pt-h2">360°</b>
            <span className="pt-meta">Walk through every room</span>
            <span className="btn btn-g btn-s pt-btn-sm">Open tour</span>
          </div>
        </div>
        <p style={{ margin: 0 }}>
          Full-floor penthouse on the 51st floor with a wraparound terrace facing the Burj Khalifa
          and the fountain. Three en-suite bedrooms, a maid’s room and a kitchen that opens onto the
          living room.
        </p>
        <div className="pt-chips">
          {l.highlights.map((h) => (
            <span key={h} className="pt-chip">
              {h}
            </span>
          ))}
        </div>
        <div className="pt-row pt-card" style={{ padding: 12 }}>
          <div>
            <span className="pt-eb">DLD permit</span>
            <div className="pt-mono">7120345678</div>
          </div>
          <div
            style={{
              width: 56,
              height: 56,
              background: "repeating-conic-gradient(#111 0 25%, #fff 0 50%) 0 0/14px 14px",
              border: "4px solid #fff",
              outline: "1px solid var(--line)",
            }}
            role="img"
            aria-label="Permit QR code"
          />
        </div>
        <AgentContact title={l.title} url={url} ids={["c1", "c2"]} />
      </div>
      <Byline />
    </main>
  );
}
