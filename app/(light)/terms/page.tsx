import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { getSiteSettings } from "@/lib/data";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION } from "@/lib/portal/payments";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("terms");
}

export default async function TermsPage() {
  const site = await getSiteSettings();
  return (
    <LegalPage title="Terms" updated="24 October 2026">
      <PageLd page="terms" />
      <p>
        These terms cover your use of milkywayy.com, run by {site.company} ({site.addressLine},{" "}
        {site.licence} licence).
      </p>
      <h2>Prices and estimates</h2>
      <p>
        Prices on the site are starting prices or estimates. Your final price is confirmed with you
        in writing, in chat, by email or on a call, before any work starts.
      </p>
      <h2>Requests on the website</h2>
      <p>
        Sending a request on the website doesn&apos;t commit you to anything. We confirm the booking
        with you first.
      </p>
      {/* The Booking Terms clients accept on every portal booking (lib/portal/payments.ts). */}
      <h2 id="booking-terms">Booking Terms</h2>
      <p>
        These apply to every booking made in the Milkywayy client portal (shoots, content shoots,
        editing and AI avatar videos). You accept them when you book (version{" "}
        {BOOKING_TERMS_VERSION}).
      </p>
      <ol>
        {BOOKING_TERMS.map((t) => (
          <li key={t.title}>
            <strong>{t.title}.</strong> {t.text}
          </li>
        ))}
      </ol>
      <h2>Payments and refunds</h2>
      <p>
        Card payments are taken by Stripe; we never see or store your card details. Refunds go back
        the way you paid: to your card for card payments, by bank transfer otherwise.
      </p>
      <h2>Using this website</h2>
      <p>
        The site&apos;s design, text and our portfolio are ours or used with permission. Please
        don&apos;t copy them without asking.
      </p>
      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </LegalPage>
  );
}
