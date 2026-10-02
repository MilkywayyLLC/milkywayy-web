import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/portal/OnboardingForm";
import { contactOf, requirePortalUser } from "@/lib/portal/auth";

export const metadata = { title: "Welcome" };

/** First sign-in (§3.4): one screen, three questions. Accounts with a membership skip it. */
export default async function Welcome() {
  const p = await requirePortalUser("/portal/welcome");
  if (p.memberships.length) redirect("/portal");
  const { data } = await p.db.rpc("claim_my_bookings");
  const pending = Number(data?.pending ?? 0);
  return (
    <main className="pt-auth" id="main">
      <div className="pt-card" style={{ width: "min(560px, 100%)" }}>
        <span className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </span>
        <div>
          <span className="pt-eb">Welcome · 3 quick questions</span>
          <h1 className="pt-h1">Set up your portal</h1>
        </div>
        {pending > 0 && (
          <p className="pt-note" role="status">
            <b>
              We found {pending} earlier booking{pending === 1 ? "" : "s"} with {contactOf(p.user)}.
            </b>{" "}
            {pending === 1 ? "It’ll" : "They’ll"} be in your portal when you’re done.
          </p>
        )}
        <OnboardingForm />
      </div>
    </main>
  );
}
