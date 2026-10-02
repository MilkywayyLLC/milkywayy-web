import { CompanyForm, NotificationsForm, ProfileForm } from "@/components/portal/SettingsForms";
import { requireAccount } from "@/lib/portal/auth";
import { industryLabel, type NotifyPrefs } from "@/lib/portal/options";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Settings" };

const pretty = (p: string) =>
  p.startsWith("+971") && p.length === 13
    ? `+971 ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9)}`
    : p;

/** Settings (§5.7): you, how you sign in, notifications, and the company's invoice details. */
export default async function Settings() {
  const { db, user, current } = await requireAccount("/portal/settings");
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, notification_prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const a = current.account;
  const phone = user.phone && user.phone_confirmed_at ? pretty(`+${user.phone}`) : null;
  const email = user.email && user.email_confirmed_at ? user.email : null;

  return (
    <>
      <h1 className="pt-h1">Settings</h1>
      <div className="pt-grid2">
        <section className="pt-card" aria-labelledby="you">
          <h2 id="you" className="pt-h2">
            You
          </h2>
          <ProfileForm name={profile?.full_name ?? ""} />
          <div className="pt-row">
            <div>
              <span className="pt-eb">WhatsApp sign-in</span>
              <div>{phone ?? "Not linked"}</div>
            </div>
            {phone && <span className="pt-badge ok">Verified</span>}
          </div>
          <div className="pt-row">
            <div>
              <span className="pt-eb">Email sign-in</span>
              <div style={{ overflowWrap: "anywhere" }}>{email ?? "Not linked"}</div>
            </div>
            {email && <span className="pt-badge ok">Verified</span>}
          </div>
          <span className="pt-meta">
            Want to sign in with both? WhatsApp us and we’ll link them for now.
          </span>
        </section>

        <section className="pt-card" aria-labelledby="co">
          <h2 id="co" className="pt-h2">
            {a.type === "company" ? "Company (for invoices)" : "Invoice details"}
          </h2>
          {isManager(current) ? (
            <CompanyForm account={a} />
          ) : (
            <>
              <span>
                {a.name}
                {a.type === "company" && a.industry
                  ? ` · ${industryLabel(a.industry, a.industry_other)}`
                  : ""}
              </span>
              <span className="pt-meta">The owner and admins manage these details.</span>
            </>
          )}
          <span className="pt-meta">
            Billing currency: {a.currency}. To change it, WhatsApp us.
          </span>
        </section>
      </div>

      <section className="pt-card" aria-labelledby="notify">
        <h2 id="notify" className="pt-h2">
          Notifications
        </h2>
        <NotificationsForm
          prefs={(profile?.notification_prefs ?? {}) as NotifyPrefs}
          manager={isManager(current)}
        />
      </section>
    </>
  );
}
