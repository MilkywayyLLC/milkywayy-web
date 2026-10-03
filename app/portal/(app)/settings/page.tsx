import {
  CompanyForm,
  NotificationsForm,
  PasswordForm,
  ProfileForm,
  RecipientsForm,
} from "@/components/portal/SettingsForms";
import { BrandForm } from "@/components/portal/BrandForm";
import { phoneSignIn } from "@/lib/portal/flags";
import { requireAccount } from "@/lib/portal/auth";
import { industryLabel, type NotifyPrefs } from "@/lib/portal/options";
import { isManager } from "@/lib/portal/shell";
import { presign, r2Ready } from "@/lib/r2";

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
    .select("full_name, notification_prefs, phone_e164")
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
          <ProfileForm name={profile?.full_name ?? ""} phone={profile?.phone_e164 ?? null} />
          <div className="pt-row">
            <div>
              <span className="pt-eb">Sign-in email</span>
              <div style={{ overflowWrap: "anywhere" }}>{email ?? "Not linked"}</div>
            </div>
            {email && <span className="pt-badge ok">Verified</span>}
          </div>
          {phoneSignIn && (
            <div className="pt-row">
              <div>
                <span className="pt-eb">WhatsApp sign-in</span>
                <div>{phone ?? "Not linked"}</div>
              </div>
              {phone && <span className="pt-badge ok">Verified</span>}
            </div>
          )}
          <PasswordForm />
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

      {isManager(current) && (
        <section className="pt-card" aria-labelledby="brand">
          <h2 id="brand" className="pt-h2">
            Share pages
          </h2>
          <span className="pt-meta">
            Your company name and logo at the top of your listing pages (optional).
          </span>
          <BrandForm
            name={a.brand_name ?? ""}
            logoKey={a.brand_logo_key ?? null}
            logoPreview={
              a.brand_logo_key && r2Ready() ? presign("GET", a.brand_logo_key, 3600) : null
            }
            fallbackName={a.type === "company" ? a.name : "e.g. Harbourline Properties"}
          />
        </section>
      )}

      <section className="pt-card" aria-labelledby="notify">
        <h2 id="notify" className="pt-h2">
          Email notifications
        </h2>
        <NotificationsForm
          prefs={(profile?.notification_prefs ?? {}) as NotifyPrefs}
          manager={isManager(current)}
          email={email}
        />
        {isManager(current) && (
          <>
            <h3 className="pt-h2" style={{ fontSize: 15, marginTop: 8 }}>
              Extra recipients for {a.name}
            </h3>
            <RecipientsForm cc={a.notify_cc ?? {}} />
          </>
        )}
      </section>
    </>
  );
}
