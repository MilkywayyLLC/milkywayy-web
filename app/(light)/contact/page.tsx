import type { Metadata } from "next";
import { LeadForm } from "@/components/forms/LeadForm";
import { HeroTitle } from "@/components/type/HeroTitle";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getSiteSettings } from "@/lib/data";
import { pageWhatsappLink } from "@/lib/whatsapp";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("contact");
}

/** Contact (guide §6.6, mockup): one section, title and direct details beside the form. */
export default async function ContactPage() {
  const site = await getSiteSettings();
  const whatsapp = pageWhatsappLink("Contact");
  return (
    <section className="sec" id="contact-form" aria-labelledby="contact-title">
      <PageLd page="contact" />
      <div className="w formwrap">
        <div className="stack" style={{ gap: 24 }}>
          <Eyebrow>Contact</Eyebrow>
          <HeroTitle id="contact-title" line1="Tell us what" line2="you need." />
          <p className="lede">
            One form for everything. We reply within 15 minutes during working hours, on the channel
            you pick.
          </p>
          <div className="direct">
            <div>
              <span>WhatsApp</span>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                {site.whatsapp.display}
              </a>
            </div>
            <div>
              <span>Email</span>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
            <div>
              <span>Studio</span>
              {site.addressLine}
            </div>
            <div>
              <span>Licence</span>
              {site.licence}
            </div>
          </div>
        </div>
        <LeadForm
          showServices
          briefLabel="Anything we should know?"
          whatsappNumber={site.whatsapp.number}
          email={site.email}
        />
      </div>
    </section>
  );
}
