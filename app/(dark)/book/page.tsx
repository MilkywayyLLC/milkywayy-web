import type { Metadata } from "next";
import { BookingSection } from "@/components/booking/BookingSection";
import { FAQ } from "@/components/blocks/FAQ";
import { getFaqs } from "@/lib/data";

// The calendar's first bookable day is computed on the server (Dubai time); refresh hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Book a Property Shoot in Dubai | Milkywayy" },
  description:
    "Book a property shoot in Dubai: photos, video and 360 tours for your listing. See the price instantly, pick a date and send it on WhatsApp. No payment now.",
  alternates: { canonical: "/book" },
  openGraph: { title: "Book a Property Shoot in Dubai | Milkywayy" },
};

/** The booking builder as a focused page (guide §6.3, owner change 30 Sep 2026): builder + FAQ. */
export default async function BookPage() {
  const faqs = await getFaqs("property-shoots");
  return (
    <>
      <BookingSection />
      <section className="sec" aria-label="Questions">
        <div className="w">
          <FAQ title="Shoot-day FAQ." faqs={faqs} />
        </div>
      </section>
    </>
  );
}
