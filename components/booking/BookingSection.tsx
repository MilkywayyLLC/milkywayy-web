import { getPropertyPricing, getSiteSettings } from "@/lib/data";
import { dubaiToday } from "@/lib/booking/dates";
import { BookingBuilder } from "./BookingBuilder";

/**
 * The booking builder with its heading (lives on /book). "Today" is taken in Dubai time on the
 * server; the page revalidates hourly so the calendar's first bookable day stays current.
 */
export async function BookingSection() {
  const [pricing, site] = await Promise.all([getPropertyPricing(), getSiteSettings()]);
  return (
    <section className="sec alt bk-page" id="build-your-booking" aria-labelledby="booking-title">
      <div className="w">
        <div className="head">
          <div className="stack">
            <span className="eb">
              <i className="rec-dot" aria-hidden="true" />
              Book property shoot
            </span>
            <h1 className="d h2" id="booking-title">
              Build your booking.
            </h1>
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
