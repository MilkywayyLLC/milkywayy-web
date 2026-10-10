/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import { headers } from "next/headers";
import { pageMediaUrl } from "@/lib/r2";
import { telLink, whatsappLink, type ShareBrand, type ShareContact } from "@/lib/share";
import { initials } from "@/lib/portal/shell";
import { StickyBar, TapLink } from "./ShareClient";

/** This request's own origin, so links and previews point at the host the page was opened on. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "milkywayy.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function Brand({ brand }: { brand: ShareBrand }) {
  if (!brand?.name && !brand?.logo) return null;
  const logo = pageMediaUrl(brand.logo);
  return (
    <header className="sh-brand">
      {logo && <img src={logo} alt={brand.name ? `${brand.name} logo` : "Logo"} height={32} />}
      {brand.name && <span>{brand.name}</span>}
    </header>
  );
}

/** The agent block: each chosen contact with WhatsApp and Call, plus the sticky bar. */
export function Contacts({
  kind,
  slug,
  title,
  url,
  contacts,
  brand,
  heading,
}: {
  kind: "l" | "c";
  slug: string;
  title: string;
  url: string;
  contacts: ShareContact[];
  brand: ShareBrand;
  heading: string;
}) {
  if (!contacts.length) return null;
  const first = contacts.find((c) => c.whatsapp) ?? contacts[0];
  const wa = (c: ShareContact) => !!c.whatsapp && c.show_whatsapp !== false;
  return (
    <>
      <section id="sh-contact" className="sh-card sh-agents" aria-labelledby="sh-agents">
        <h2 id="sh-agents" className="sh-eb">
          {heading}
        </h2>
        {contacts.map((c, i) => {
          const photo = pageMediaUrl(c.photo);
          return (
            <div key={i} className="sh-agent">
              <div className="sh-agent-who">
                {photo ? (
                  <img src={photo} alt="" width={48} height={48} loading="lazy" />
                ) : (
                  <span className="sh-face" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                )}
                <span>
                  <b>{c.name}</b>
                  <small>
                    {[c.role, brand?.name, c.brn && `BRN ${c.brn.replace(/^BRN\s*/i, "")}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </div>
              <div className="sh-agent-btns">
                {wa(c) && (
                  <TapLink
                    kind={kind}
                    slug={slug}
                    event="wa"
                    href={whatsappLink(c.whatsapp!, title, url)}
                    className="btn btn-p btn-s"
                    label={`WhatsApp ${c.name}`}
                  >
                    WhatsApp
                  </TapLink>
                )}
                {c.whatsapp && (
                  <TapLink
                    kind={kind}
                    slug={slug}
                    event="call"
                    href={telLink(c.whatsapp)}
                    className="btn btn-g btn-s"
                    label={`Call ${c.name}`}
                  >
                    Call
                  </TapLink>
                )}
                {!c.whatsapp && c.email && (
                  <a href={`mailto:${c.email}`} className="btn btn-g btn-s">
                    Email
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {first.whatsapp && (
        <StickyBar watch="sh-contact">
          {wa(first) && (
            <TapLink
              kind={kind}
              slug={slug}
              event="wa"
              href={whatsappLink(first.whatsapp, title, url)}
              className="btn btn-p"
            >
              WhatsApp
            </TapLink>
          )}
          <TapLink
            kind={kind}
            slug={slug}
            event="call"
            href={telLink(first.whatsapp)}
            className="btn btn-g"
          >
            Call
          </TapLink>
        </StickyBar>
      )}
    </>
  );
}

const UTM = "utm_source=sharepage&utm_medium=referral&utm_campaign=listing";

/** The cross-marketing loop (§6.2). */
export function Byline() {
  return (
    <footer className="sh-byline">
      <span>Media &amp; page by Milkywayy</span>
      <a href={`/property-shoots?${UTM}`}>Get yours →</a>
    </footer>
  );
}

/** Paused, expired, disabled or gone: a friendly page, never an error. */
export function Unavailable({ kind }: { kind: "l" | "c" }) {
  const what = kind === "l" ? "listing" : "collection";
  return (
    <div className="sh" data-tone="light">
      <main id="main" className="sh-gone">
        <span className="sh-eb">Milkywayy share page</span>
        <h1 className="sh-h1">This {what} isn’t available</h1>
        <p>
          The agent may have paused it, or the link has expired. Ask them for an up-to-date link.
        </p>
        <a href={`/?${UTM}`}>Browse Milkywayy →</a>
      </main>
      <Byline />
    </div>
  );
}
