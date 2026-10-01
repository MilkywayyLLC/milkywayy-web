import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { getSiteSettings } from "@/lib/data";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("privacy");
}

export default async function PrivacyPage() {
  const site = await getSiteSettings();
  return (
    <LegalPage title="Privacy" updated="1 October 2026">
      <PageLd page="privacy" />
      <p>
        This notice explains what {site.company} ({site.addressLine}, {site.licence} licence) does
        with the details you share through milkywayy.com.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          What you enter in our forms: name, company, phone, email, your brief and how you want us
          to reply.
        </li>
        <li>
          Booking details from the property shoot builder: property type, services, location,
          preferred date and time.
        </li>
        <li>For a free test edit: your website or a link to your work, and your country.</li>
        <li>
          With your consent only: analytics about how the site is used (pages visited, device type).
        </li>
      </ul>
      <h2>Why we use it</h2>
      <p>
        To reply to you, prepare a quote, book and deliver your work, invoice it, and improve the
        site.
      </p>
      <h2>WhatsApp, email and calls</h2>
      <p>
        If you choose WhatsApp, the message you send is handled by WhatsApp under its own terms. We
        keep a copy of your request so we can follow up.
      </p>
      <h2>Cookies and analytics</h2>
      <p>
        Essential cookies keep the site working. Analytics and advertising tags load only after you
        accept them, and you can change your choice at any time.
      </p>
      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell your details. We use trusted providers to run the site, store requests
        and send email, only for the purposes above.
      </p>
      <h2>How long we keep it</h2>
      <p>
        As long as we need it to work with you and to meet our legal and accounting obligations.
      </p>
      <h2>Your choices</h2>
      <p>
        You can ask to see, correct or delete your details at any time: email{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </LegalPage>
  );
}
