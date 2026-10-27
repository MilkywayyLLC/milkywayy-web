/* eslint-disable @next/next/no-img-element -- media is pre-sized WebP on R2 (signed URLs), not next/image */
import { headers } from "next/headers";
import { BrandHeader } from "./BrandHeader";
import { pageMediaUrl } from "@/lib/r2";
import { Icon } from "@/components/portal/Icon";
import {
  FURNISHING,
  telLink,
  whatsappLink,
  type ShareBrand,
  type ShareContact,
  type ShareListing,
} from "@/lib/share";
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
  return (
    <BrandHeader name={brand.name} logo={pageMediaUrl(brand.logo)} layout={brand.layout ?? null} />
  );
}

const brnOf = (c: ShareContact) => c.brn && `BRN ${c.brn.replace(/^(RERA|BRN)[\s:#]*/i, "")}`;

/**
 * The agent card (site-refine, Oct 2026): photo (initials without one), name, role, RERA/BRN,
 * then WhatsApp (primary) and Call, plus an email link. Sticky in the right column on desktop;
 * tablets and phones also get the bottom bar with the first contact.
 */
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
  const firstPhoto = pageMediaUrl(first.photo);
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
                  <img src={photo} alt="" width={56} height={56} loading="lazy" />
                ) : (
                  <span className="sh-face" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                )}
                <span>
                  <b>{c.name}</b>
                  {(c.role || brand?.name) && (
                    <small>{[c.role, brand?.name].filter(Boolean).join(" · ")}</small>
                  )}
                  {c.brn && <small className="sh-brn">{brnOf(c)}</small>}
                </span>
              </div>
              <div className="sh-agent-btns">
                {wa(c) && (
                  <TapLink
                    kind={kind}
                    slug={slug}
                    event="wa"
                    href={whatsappLink(c.whatsapp!, title, url)}
                    className="btn btn-p sh-btn-wa"
                    label={`WhatsApp ${c.name}`}
                  >
                    <Icon name="whatsapp" size={18} /> WhatsApp
                  </TapLink>
                )}
                {c.whatsapp && (
                  <TapLink
                    kind={kind}
                    slug={slug}
                    event="call"
                    href={telLink(c.whatsapp)}
                    className="btn btn-g"
                    label={`Call ${c.name}`}
                  >
                    <Icon name="phone" size={18} /> Call
                  </TapLink>
                )}
              </div>
              {c.email && (
                <a href={`mailto:${c.email}`} className="sh-mail">
                  <Icon name="mail" size={16} /> {c.email}
                </a>
              )}
            </div>
          );
        })}
      </section>
      {first.whatsapp && (
        <StickyBar watch="sh-contact">
          <span className="sh-bar-who">
            {firstPhoto ? (
              <img src={firstPhoto} alt="" width={36} height={36} loading="lazy" />
            ) : (
              <span className="sh-face" aria-hidden="true">
                {initials(first.name)}
              </span>
            )}
            <b>{first.name}</b>
          </span>
          <TapLink
            kind={kind}
            slug={slug}
            event="call"
            href={telLink(first.whatsapp)}
            className="btn btn-g"
          >
            <Icon name="phone" size={18} /> Call
          </TapLink>
          {wa(first) && (
            <TapLink
              kind={kind}
              slug={slug}
              event="wa"
              href={whatsappLink(first.whatsapp, title, url)}
              className="btn btn-p sh-btn-wa"
            >
              <Icon name="whatsapp" size={18} /> WhatsApp
            </TapLink>
          )}
        </StickyBar>
      )}
    </>
  );
}

/** Key facts as icon + text (beds, baths, size, furnishing, type). */
export function Facts({ l }: { l: Partial<ShareListing> }) {
  const items = [
    l.beds ? (["bed", /^\d+$/.test(l.beds) ? `${l.beds} Bed` : l.beds] as const) : null,
    l.baths != null
      ? ([
          "bath",
          `${Number.isInteger(Number(l.baths)) ? l.baths : Number(l.baths).toFixed(1)} Bath`,
        ] as const)
      : null,
    l.size_sqft
      ? (["area", `${Number(l.size_sqft).toLocaleString("en-US")} sq ft`] as const)
      : null,
    l.furnishing ? (["sofa", FURNISHING[l.furnishing]] as const) : null,
    l.property_type ? (["building", l.property_type] as const) : null,
  ].filter((x) => x !== null);
  if (!items.length) return null;
  return (
    <ul className="sh-facts" aria-label="Key facts">
      {items.map(([icon, text]) => (
        <li key={text}>
          <Icon name={icon} size={18} /> {text}
        </li>
      ))}
    </ul>
  );
}

const FOOTER = "https://milkywayy.com/?utm_source=listing&utm_medium=footer";

/** The cross-marketing loop (§6.2): one small, low-profile text link (no logo). */
export function Byline() {
  return (
    <footer className="sh-byline">
      <a href={FOOTER} target="_blank" rel="noopener">
        Media &amp; page by Milkywayy
      </a>
    </footer>
  );
}

/** Paused, expired, disabled or gone: a friendly page, never an error. */
const UTM = "utm_source=sharepage&utm_medium=referral&utm_campaign=listing";

export function Unavailable({ kind }: { kind: "l" | "c" }) {
  const what = kind === "l" ? "listing" : "collection";
  return (
    <div className="sh" data-tone="auto">
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
