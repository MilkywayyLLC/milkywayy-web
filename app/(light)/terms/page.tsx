import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { getSiteSettings } from "@/lib/data";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms for using milkywayy.com and requesting shoots, edits and AI avatar work from Milkywayy LLC.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const site = await getSiteSettings();
  return (
    <LegalPage title="Terms" updated="1 October 2026">
      <p>
        These terms cover your use of milkywayy.com, run by {site.company} ({site.addressLine},{" "}
        {site.licence} licence).
      </p>
      <h2>Prices and estimates</h2>
      <p>
        Prices on the site are starting prices or estimates. Your final price is confirmed with you
        in writing, in chat, by email or on a call, before any work starts.
      </p>
      <h2>No payment on the site</h2>
      <p>
        Nothing is charged through this website. Sending a request doesn&apos;t commit you to
        anything; we confirm the booking with you, and invoice after delivery.
      </p>
      <h2>Bookings</h2>
      <p>
        Shoot dates and times are confirmed by us. Rescheduling and cancellation terms are agreed in
        your confirmation.
      </p>
      <h2>Your media</h2>
      <p>
        Media we deliver is licensed for your marketing use. Anything more specific (for example,
        ownership of raw footage) is set out in your quote or contract.
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
