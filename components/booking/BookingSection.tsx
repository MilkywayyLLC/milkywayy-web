import { getPropertyPricing, getSiteSettings } from "@/lib/data";
import { nextShootDates } from "@/lib/booking";
import { BookingBuilder } from "./BookingBuilder";

/**
 * "Build your booking." section, shared by /production/property-shoots and /book. Dates are
 * computed on the server in Dubai time; pages using this revalidate hourly so the chips stay current.
 */
export async function BookingSection() {
  const [pricing, site] = await Promise.all([getPropertyPricing(), getSiteSettings()]);
  const dates = nextShootDates(new Date(), site.booking.daysAhead);
  return (
    <section className="sec alt" id="build-your-booking" aria-labelledby="booking-title">
      <div className="w">
        <div className="head">
          <div className="stack">
            <span className="eb">Request a shoot</span>
            <h2 className="d h2" id="booking-title">
              Build your booking.
            </h2>
          </div>
          <p className="lede">
            Pick the property and services, see the price, and send it to us on WhatsApp. No payment
            now: we confirm the slot and invoice after delivery.
          </p>
        </div>
        <BookingBuilder
          pricing={pricing}
          dates={dates}
          slots={site.booking.slots}
          multiPropertyNote={site.booking.multiPropertyNote}
          whatsappNumber={site.whatsapp.number}
        />
      </div>
    </section>
  );
}
