"use client";

import { usePersona } from "@/components/portal-mock/persona";
import { Badge, useToast } from "@/components/portal/ui";

const EVENTS: [string, boolean, boolean][] = [
  ["Booking confirmed", true, true],
  ["Shoot done / editing started", false, false],
  ["Files delivered", true, true],
  ["Batch received", true, true],
  ["Script ready for approval", true, true],
  ["Revision delivered", true, true],
  ["New message on a project", true, false],
  ["Invoice issued", false, true],
];

export default function Settings() {
  const { account } = usePersona();
  const [toast, say] = useToast();
  const me = account.me;

  return (
    <>
      <h1 className="pt-h1">Settings</h1>
      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">You</h2>
          <label className="pt-field">
            Name
            <input type="text" defaultValue={me.name} />
          </label>
          <div className="pt-row">
            <div>
              <span className="pt-eb">WhatsApp sign-in</span>
              <div>{me.phone ?? "Not linked"}</div>
            </div>
            {me.phone ? (
              <Badge tone="ok">Verified</Badge>
            ) : (
              <button type="button" className="btn btn-g btn-s pt-btn-sm">
                Link phone
              </button>
            )}
          </div>
          <div className="pt-row">
            <div>
              <span className="pt-eb">Email sign-in</span>
              <div style={{ overflowWrap: "anywhere" }}>{me.email}</div>
            </div>
            {account.login === "email" ? (
              <Badge tone="ok">Verified</Badge>
            ) : (
              <button type="button" className="btn btn-g btn-s pt-btn-sm">
                Add password
              </button>
            )}
          </div>
          <span className="pt-meta">Signed in on this device for 30 days.</span>
        </section>

        {account.kind === "company" && (
          <section className="pt-card">
            <h2 className="pt-h2">Company (for invoices)</h2>
            <label className="pt-field">
              Company name
              <input type="text" defaultValue={account.name} />
            </label>
            <label className="pt-field">
              What you do
              <select defaultValue={account.industry}>
                {[
                  "Real estate brokerage",
                  "Developer",
                  "Holiday homes",
                  "Agency",
                  "Brand",
                  "Creator",
                  "Other",
                ].map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
            <label className="pt-field">
              TRN (optional)
              <input
                type="text"
                defaultValue={account.currency === "AED" ? "100 4821 3399 0003" : ""}
              />
            </label>
            <label className="pt-field">
              Billing address
              <textarea
                defaultValue={
                  account.currency === "AED"
                    ? "Office 1204, Bay Square 7, Business Bay, Dubai"
                    : "220 King St W, Toronto, ON"
                }
              />
            </label>
          </section>
        )}
      </div>

      <section className="pt-card">
        <h2 className="pt-h2">Notifications</h2>
        <div>
          {EVENTS.map(([e, wa, em]) => (
            <div key={e} className="pt-switch-row">
              <span>{e}</span>
              <span className="pt-toggles">
                <label>
                  <input type="checkbox" defaultChecked={wa} /> WhatsApp
                </label>
                <label>
                  <input type="checkbox" defaultChecked={em} /> Email
                </label>
              </span>
            </div>
          ))}
        </div>
        <span className="pt-meta">
          Updates come from our notifications number. To chat with us, use the WhatsApp button in
          the portal.
        </span>
      </section>
      <button
        type="button"
        className="btn btn-p"
        style={{ justifySelf: "start" }}
        onClick={() => say("Saved (mockup: nothing saved)")}
      >
        Save
      </button>
      {toast}
    </>
  );
}
