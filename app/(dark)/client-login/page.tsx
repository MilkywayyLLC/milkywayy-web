import type { Metadata } from "next";
import { HeroTitle } from "@/components/type/HeroTitle";
import { ButtonLink } from "@/components/ui/Button";
import { Ctas } from "@/components/ui/Ctas";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Hl } from "@/components/ui/Section";
import { getSiteSettings } from "@/lib/data";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Client login",
  description: "The Milkywayy client portal is moving. WhatsApp us for your files.",
  robots: { index: false, follow: true },
};

/**
 * "Client login" until the new client portal exists (CLIENT_PORTAL_GUIDE.md §11 fallback):
 * files go out by link, on request.
 */
export default async function ClientLogin() {
  const site = await getSiteSettings();
  return (
    <div className="w">
      <section
        className="p-hero p-hero-short"
        aria-labelledby="cl-title"
        style={{ minHeight: "50vh" }}
      >
        <div className="stack">
          <Eyebrow rec>Client login</Eyebrow>
          <HeroTitle id="cl-title" line1="Your portal" line2={<Hl>is moving.</Hl>} />
          <p className="lede">
            We&apos;re building a new client portal. Until it&apos;s ready, WhatsApp us with your
            booking reference and we&apos;ll send your files and invoices by link.
          </p>
          <Ctas>
            <ButtonLink
              href={whatsappLink(
                "Hi Milkywayy, I need the files for my booking. My reference is ",
                site.whatsapp.number,
              )}
            >
              WhatsApp us for files
            </ButtonLink>
            <ButtonLink
              href={`mailto:${site.email}?subject=Files%20for%20my%20booking`}
              variant="ghost"
            >
              Email us
            </ButtonLink>
          </Ctas>
        </div>
      </section>
    </div>
  );
}
