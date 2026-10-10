import { BookShoot } from "@/components/portal/BookShoot";
import { Back } from "@/components/portal/ui";
import { getPropertyPricing } from "@/lib/data";
import { requireAccount } from "@/lib/portal/auth";
import type { Rates } from "@/lib/portal/booking";
import { dubaiToday } from "@/lib/portal/billing";

export const metadata = { title: "Book a shoot" };

/**
 * Book a shoot (owner, 10 Oct 2026), for clients on a package. Everyone on the account can book;
 * the estimate shows only to Owners and Admins with "Show budget and activity" on.
 */
export default async function BookShootPage() {
  const { db, current } = await requireAccount("/portal/shoots/book");
  const [{ data }, pricing] = await Promise.all([
    db.rpc("my_booking_options", { p_account: current.account.id }),
    getPropertyPricing(),
  ]);
  const opts = data as { can_book: boolean; currency: string; rates: Rates | null } | null;
  return (
    <>
      <Back href="/portal/shoots" label="Shoots" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">{current.account.name}</span>
          <h1 className="pt-h1">Book a shoot</h1>
        </div>
      </div>
      {opts?.can_book ? (
        <BookShoot
          pricing={pricing}
          rates={opts.rates}
          currency={opts.currency}
          today={dubaiToday()}
        />
      ) : (
        <div className="pt-card">
          <b>Booking here is for clients on a package</b>
          <span className="pt-meta">
            Book a property shoot on the website with the email you sign in with, and it shows up in
            Shoots.
          </span>
          <a
            href="/property-shoots#booking"
            className="btn btn-p btn-s"
            style={{ justifySelf: "start" }}
          >
            Book on the website
          </a>
        </div>
      )}
    </>
  );
}
