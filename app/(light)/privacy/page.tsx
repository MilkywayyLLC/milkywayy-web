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
    <LegalPage title="Privacy" updated="2 October 2026">
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
      <h2 id="cookies">Cookies, analytics and advertising</h2>
      <p>
        Essential storage keeps the site working (for example, remembering your cookie choice and
        which page you arrived on). We also use:
      </p>
      <ul>
        <li>
          <b>Meta Pixel and Meta Conversions API</b>: to measure visits and requests from our
          Facebook and Instagram ads and to show relevant ads. When you send a request, we share an
          encrypted (hashed) copy of your email or phone number with Meta to match it to an ad,
          never the details in readable form.
        </li>
        <li>
          <b>Google Analytics 4</b>: to count visits and see which pages and forms work.
        </li>
        <li>
          <b>Microsoft Clarity</b>: anonymised heatmaps and session recordings so we can fix
          confusing parts of the site. Form fields are masked.
        </li>
      </ul>
      <p>
        If you&apos;re in the European Economic Area, the UK or Switzerland, these load only after
        you choose Accept in the cookie banner. Elsewhere they load by default. Either way, you can
        change your choice at any time with <b>Cookie settings</b> at the bottom of every page, or
        block cookies in your browser.
      </p>
      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell your details. We use trusted providers to run the site, store requests
        and send email (Vercel, Supabase, Resend), and the analytics and advertising services above,
        only for the purposes described here.
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
