import { getPropertyPricing, getSiteSettings } from "@/lib/data";
import { dubaiToday } from "@/lib/booking/dates";
import { BookingBuilder } from "./BookingBuilder";

/**
 * "Build your booking." — the booking builder section on /property-shoots (#booking). "Today" is
 * taken in Dubai time on the server; the page revalidates hourly so the calendar stays current.
 */
export async function BookingSection() {
  const [pricing, site] = await Promise.all([getPropertyPricing(), getSiteSettings()]);
  return (
    <section className="sec alt" id="booking" aria-labelledby="booking-title">
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
          today={dubaiToday(new Date())}
          windowDays={site.booking.windowDays}
          closedWeekdays={site.booking.closedWeekdays}
          slots={site.booking.slots}
          multiPropertyNote={site.booking.multiPropertyNote}
          whatsappNumber={site.whatsapp.number}
        />
      </div>
    </section>
  );
}
