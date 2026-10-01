"use client";

import Link from "next/link";
import { Icon } from "@/components/portal-mock/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, money } from "@/components/portal-mock/ui";
import { ACTIVITY, PAYG_LINES, waChat, type Persona } from "@/lib/portal-mock/data";

const B = "/portal-preview";

type Attn = {
  tag: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  urgent?: boolean;
};
const ATTENTION: Record<Persona, Attn[]> = {
  all: [
    {
      tag: "Avatars · MW-3110",
      title: "Approve the script",
      body: "October market update (EN). Production starts once you approve.",
      href: `${B}/avatars`,
      cta: "Read script",
    },
    {
      tag: "Editing · MW-2041",
      title: "Revision 1 delivered",
      body: "8 photos re-done for Unit 1204. Approve, or ask for round 2 of 2.",
      href: `${B}/editing/MW-2041`,
      cta: "Review",
    },
    {
      tag: "Shoots · MW-1176",
      title: "Your penthouse shoot is ready",
      body: "28 photos, 1 reel, 360 tour. Auto-completes Mon 5 Oct.",
      href: `${B}/shoots/MW-1176`,
      cta: "Download",
    },
    {
      tag: "Billing · INV-2026-0412",
      title: "Invoice due: AED 6,500",
      body: "October package, due 8 Oct.",
      href: `${B}/billing`,
      cta: "View invoice",
    },
  ],
  shoots: [
    {
      tag: "Billing · INV-2026-0301",
      title: "Invoice overdue: AED 900",
      body: "From 22 Jul. Pay by bank transfer, or WhatsApp us if it’s already paid.",
      href: `${B}/billing`,
      cta: "View invoice",
      urgent: true,
    },
    {
      tag: "Shoots · MW-1176",
      title: "Your penthouse shoot is ready",
      body: "28 photos, 1 reel, 360 tour. Auto-completes Mon 5 Oct.",
      href: `${B}/shoots/MW-1176`,
      cta: "Download",
    },
  ],
  post: [
    {
      tag: "Editing · MW-2046",
      title: "On hold: we need a file",
      body: "The music licence file is missing for the Riverside walkthrough.",
      href: `${B}/editing/MW-2046`,
      cta: "Add the file",
      urgent: true,
    },
    {
      tag: "Editing · MW-2041",
      title: "Revision 1 delivered",
      body: "8 photos re-done for Unit 1204. Approve, or ask for round 2 of 2.",
      href: `${B}/editing/MW-2041`,
      cta: "Review",
    },
  ],
};

const IN_PROGRESS: Record<Persona, { label: string; n: number; href: string }[]> = {
  all: [
    { label: "Shoots", n: 2, href: "shoots" },
    { label: "Editing batches", n: 3, href: "editing" },
    { label: "Avatar videos", n: 2, href: "avatars" },
  ],
  shoots: [{ label: "Shoots", n: 2, href: "shoots" }],
  post: [{ label: "Editing batches", n: 3, href: "editing" }],
};

export default function Home() {
  const { persona, account } = usePersona();
  const first = account.me.name.split(" ")[0];
  const s = account.services;
  const payg = PAYG_LINES[persona].reduce((t, l) => t + l.qty * l.unit, 0);

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Fri 2 Oct · Good morning, {first}</span>
          <h1 className="pt-h1">Home</h1>
        </div>
        <div className="pt-btns">
          {s.includes("shoots") && (
            <a href="/property-shoots" className="btn btn-p btn-s">
              <Icon name="plus" size={16} /> Book a shoot
            </a>
          )}
          {s.includes("editing") && (
            <Link
              href={`${B}/editing/new`}
              className={`btn btn-s ${s.includes("shoots") ? "btn-g" : "btn-p"}`}
            >
              <Icon name="plus" size={16} /> New batch
            </Link>
          )}
        </div>
      </div>

      {persona === "shoots" && (
        <div className="pt-card pt-suggest">
          <b>We found 2 earlier bookings with your number</b>
          <span className="pt-meta">MW-1162 and MW-1176 from the website are now in Shoots.</span>
        </div>
      )}

      <section className="pt-card" aria-labelledby="attn">
        <div className="pt-row">
          <h2 id="attn" className="pt-h2">
            Needs your attention
          </h2>
          <Badge tone="solid">{ATTENTION[persona].length}</Badge>
        </div>
        <div className="pt-list" style={{ border: 0 }}>
          {ATTENTION[persona].map((a) => (
            <Link
              key={a.tag}
              href={a.href}
              className={`pt-attn ${a.urgent ? "urgent" : ""}`}
              style={{ padding: "14px 0" }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span className="pt-eb">{a.tag}</span>
                <b>{a.title}</b>
                <span className="pt-meta">{a.body}</span>
                <span className="lnk pt-small" style={{ justifySelf: "start", marginTop: 2 }}>
                  {a.cta} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="pt-grid2">
        <section className="pt-card" aria-labelledby="prog">
          <h2 id="prog" className="pt-h2">
            In progress
          </h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {IN_PROGRESS[persona].map((p) => (
              <Link
                key={p.label}
                href={`${B}/${p.href}`}
                className="pt-stat"
                style={{ textDecoration: "none" }}
              >
                <b>{p.n}</b>
                <span className="pt-meta">{p.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="pt-card" aria-labelledby="plan">
          <h2 id="plan" className="pt-h2">
            {account.plan.mode === "package" ? `Plan: ${account.plan.name}` : "This month so far"}
          </h2>
          {account.plan.mode === "package" ? (
            account.plan.usage.slice(0, 2).map((u) => (
              <div key={u.label} style={{ display: "grid", gap: 6 }}>
                <div className="pt-row pt-small">
                  <span>{u.label}</span>
                  <b>
                    {u.used} of {u.of}
                  </b>
                </div>
                <div className="pt-meter">
                  <i style={{ width: `${(u.used / u.of) * 100}%` }} />
                </div>
              </div>
            ))
          ) : (
            <>
              <span className="pt-big">{money(account.currency, payg)}</span>
              <span className="pt-meta">
                Pay as you go · estimate, final invoice after month end
              </span>
            </>
          )}
          <Link href={`${B}/billing`} className="lnk pt-small">
            Billing →
          </Link>
        </section>
      </div>

      <section className="pt-card" aria-labelledby="act">
        <h2 id="act" className="pt-h2">
          Latest activity
        </h2>
        <ul className="pt-timeline">
          {ACTIVITY[persona].map((a) => (
            <li key={a.body}>
              <Link href={`${B}/${a.href}`} style={{ textDecoration: "none", display: "grid" }}>
                <span>{a.body}</span>
                <span className="pt-meta pt-mono">{a.at}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <a
        href={waChat(`Hi Milkywayy, it's ${account.me.name} (${account.name}).`)}
        className="btn btn-g"
        target="_blank"
        rel="noopener"
      >
        WhatsApp us
      </a>
    </>
  );
}
