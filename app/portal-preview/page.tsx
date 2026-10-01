import Link from "next/link";

const B = "/portal-preview";
const GROUPS: { title: string; items: [string, string, string][] }[] = [
  {
    title: "Sign in",
    items: [
      ["Login", `${B}/login`, "WhatsApp code (with SMS fallback) or email + password"],
      ["Welcome", `${B}/welcome`, "First sign-in: individual/company, what you’re here for"],
    ],
  },
  {
    title: "Client portal",
    items: [
      ["Home", `${B}/home`, "Needs your attention, in progress, plan, activity"],
      ["Shoots", `${B}/shoots`, "Booking cards with the status stepper"],
      ["Delivered shoot", `${B}/shoots/MW-1176`, "Downloads, revision, Create share link"],
      ["Editing", `${B}/editing`, "Active batches + Completed tab with search"],
      ["New batch", `${B}/editing/new`, "Links or upload, notes, deadline"],
      ["Batch page", `${B}/editing/MW-2041`, "Deliveries, revision rounds, messages"],
      ["Batch on hold", `${B}/editing/MW-2046`, "What “waiting on client” looks like"],
      ["Avatars", `${B}/avatars`, "Script approval"],
      ["Billing", `${B}/billing`, "Invoices, running total, plan or suggested package"],
      ["Listings", `${B}/listings`, "Share links, stats, collections, create sheet"],
      ["Team", `${B}/team`, "Members, roles, what members see"],
      ["Contacts", `${B}/contacts`, "Contact pills for listing pages"],
      ["Settings", `${B}/settings`, "Sign-in methods, notifications, company details"],
    ],
  },
  {
    title: "Public pages",
    items: [
      ["Listing page", `${B}/l/burj-vista-3br-penthouse`, "What buyers see at /l/…"],
      ["Collection", `${B}/c/picked-for-the-khans`, "Several listings in one link, /c/…"],
    ],
  },
  {
    title: "Admin",
    items: [["Projects board", `${B}/admin`, "Board on desktop, one-tap status list on phone"]],
  },
];

/** Index of the portal mockup screens. */
export default function MockupIndex() {
  return (
    <main className="pt-content" id="main" style={{ maxWidth: 760, paddingBottom: 48 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="pt-eb">Phase 9 · step 1 · fake data, nothing is saved</span>
        <h1 className="pt-h1">Portal mockup</h1>
        <p className="pt-muted" style={{ margin: 0 }}>
          Use “View as” at the top to switch between a client using all three services (Harbourline,
          AED, monthly package), a shoots-only agent (Omar, pay as you go) and a
          post-production-only agency (Northlake, USD). Tabs change with it.
        </p>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} style={{ display: "grid", gap: 8 }}>
          <h2 className="pt-h2">{g.title}</h2>
          <div className="pt-list pt-index">
            {g.items.map(([name, href, note]) => (
              <Link key={href} href={href}>
                <b>{name}</b>
                <span className="pt-meta" style={{ gridRow: 2 }}>
                  {note}
                </span>
                <span aria-hidden="true" style={{ gridRow: "1 / 3", alignSelf: "center" }}>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
