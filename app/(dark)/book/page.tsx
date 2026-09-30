import type { Metadata } from "next";
import { BookingSection } from "@/components/booking/BookingSection";
import { FAQ } from "@/components/blocks/FAQ";
import { getFaqs } from "@/lib/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Book a property shoot",
  description:
    "Price and request a property photography, video or 360 tour shoot in Dubai in under a minute. No payment now: we confirm your slot on WhatsApp and invoice after delivery.",
  alternates: { canonical: "/book" },
};

/** Booking builder on its own (guide §6.3): builder + shoot-day FAQ, with header and footer. */
export default async function BookPage() {
  const faqs = await getFaqs("property-shoots");
  return (
    <>
      <h1 className="sr">Book a property shoot</h1>
      <BookingSection />
      <section className="sec" aria-label="Questions">
        <div className="w">
          <FAQ title="Shoot-day FAQ." faqs={faqs} />
        </div>
      </section>
    </>
  );
}
