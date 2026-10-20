"use client";

import "./showcase.css";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/layout/Logo";
import { Icon } from "@/components/portal/Icon";
import { AVATAR_STEPS, EDIT_STEPS, SHOOT_STEPS } from "@/lib/portal/steps";
import { propertyPricing } from "@/content/pricing";
import { showcaseRates, type ShowcaseRates } from "@/lib/showcase";
import { CANVAS, type Layout } from "./canvas";
import type { ShowcaseFeature, ShowcasePhoto, ShowcaseScreen } from "../DashboardShowcase";

/**
 * The dashboard preview's frames (owner, 20 Oct 2026): faithful static mocks of the client
 * portal as it is now (Book media page, client home, booking detail with deliverables) on the
 * portal's type tokens. Demo data only: a made-up client, no MW- refs, the portal's real status
 * names, prices from the rate card this page already shows, and email-only wording.
 *
 * One markup, two layouts: "desk" draws the desktop portal on an 800×700 canvas; "phone" draws the
 * phone portal (top bar, stacked cards, bottom total bar, bottom tabs) on a 390×780 canvas. The
 * canvas is scaled to the window (never above 1.15), so text stays readable at every width.
 * Loaded on its own (next/dynamic) once the section is near the screen.
 */

const SEED = showcaseRates(propertyPricing).shoot!;
const Photos = createContext<ShowcasePhoto[]>([]);
const Rates = createContext<ShowcaseRates | undefined>(undefined);

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const aed = (n: number, cur = "AED") =>
  `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

export function ShowcaseFrames({
  features,
  active,
  layout,
  photos,
  rates,
}: {
  features: ShowcaseFeature[];
  active: number;
  layout: Layout;
  photos: ShowcasePhoto[];
  rates?: ShowcaseRates;
}) {
  const { w, h } = CANVAS[layout];
  const who = persona(features);
  return (
    <div className="dsh-canvas" inert style={{ width: w, height: h }}>
      <Photos.Provider value={photos}>
        <Rates.Provider value={rates}>
          {features.map((f, i) => (
            <div key={f.title} className={i === active ? "dsh-frame on" : "dsh-frame"}>
              <Fit key={layout} layout={layout}>
                <div className="scm" data-l={layout}>
                  <Screen kind={f.screen} who={who} />
                </div>
              </Fit>
            </div>
          ))}
        </Rates.Provider>
      </Photos.Provider>
    </div>
  );
}

/**
 * Scales a frame down (never up) when its content is taller than the canvas: the frame is laid
 * out taller (height / s) and scaled by s, so nothing is ever cut off.
 */
function Fit({ layout, children }: { layout: Layout; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  const { w, h } = CANVAS[layout];
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.querySelector<HTMLElement>(".s-content, .s-lp");
    if (!box) return;
    const need = box.scrollHeight;
    const chrome = h - box.clientHeight;
    if (need > box.clientHeight + 1) setS(Math.max(0.72, h / (need + chrome)));
  }, [h]);
  return (
    <div
      ref={ref}
      className="dsh-fit"
      style={{ width: w / s, height: h / s, transform: s < 1 ? `scale(${s})` : undefined }}
    >
      {children}
    </div>
  );
}

/* ---------------- who is signed in: the tabs follow the services the page is about ---------------- */

type Who = "all" | "editing" | "avatars";
function persona(features: ShowcaseFeature[]): Who {
  if (features.every((f) => f.screen.startsWith("edit-"))) return "editing";
  if (features.every((f) => f.screen.startsWith("avatar-"))) return "avatars";
  return "all";
}

const TABS: Record<Who, [string, string][]> = {
  all: [
    ["home", "Home"],
    ["shoots", "Shoots"],
    ["editing", "Editing"],
    ["avatars", "Avatars"],
    ["listings", "Listings"],
    ["chat", "Inquiries"],
    ["billing", "Billing"],
  ],
  editing: [
    ["home", "Home"],
    ["editing", "Editing"],
    ["chat", "Inquiries"],
    ["billing", "Billing"],
  ],
  avatars: [
    ["home", "Home"],
    ["avatars", "Avatars"],
    ["chat", "Inquiries"],
    ["billing", "Billing"],
  ],
};

function Shell({
  who,
  tab,
  children,
  bar,
  over,
}: {
  who: Who;
  tab: string;
  children: ReactNode;
  /** Phones: the booking page's bottom total bar. */
  bar?: ReactNode;
  /** A modal (desktop) or sheet (phone) over the page. */
  over?: ReactNode;
}) {
  const tabs = TABS[who];
  return (
    <div className="s-shell">
      <aside className="s-rail">
        <span className="s-logo">
          <BrandLogo tone="light" />
        </span>
        <nav className="s-nav">
          {tabs.map(([icon, name]) => (
            <span key={name} aria-current={name === tab ? "page" : undefined}>
              <Icon name={icon} size={18} /> {name}
            </span>
          ))}
          <i className="s-sep" />
          {who === "all" && (
            <span>
              <Icon name="contacts" size={18} /> Contacts
            </span>
          )}
          <span>
            <Icon name="settings" size={18} /> Settings
          </span>
        </nav>
      </aside>
      <div className="s-main">
        <header className="s-top">
          <span className="s-logo">
            <BrandLogo tone="light" />
          </span>
          <span className="s-top-r">
            <span className="s-hello">Hello, Sara</span>
            <span className="s-acct">
              <Icon name="person" size={18} />
            </span>
            <span className="s-btn m-p">
              <Icon name="plus" size={16} /> Book media
            </span>
          </span>
        </header>
        <div className="s-content">{children}</div>
        {bar}
        <nav className="s-tabs">
          {tabs.slice(0, 4).map(([icon, name]) => (
            <span key={name} aria-current={name === tab ? "page" : undefined}>
              <Icon name={icon} size={18} />
              {name}
            </span>
          ))}
          <span>
            <Icon name="more" size={18} />
            More
          </span>
        </nav>
      </div>
      {over}
    </div>
  );
}

/* ---------------- shared parts ---------------- */

function Steps({ steps, at }: { steps: readonly string[]; at: number }) {
  return (
    <>
      <ol className="s-steps" style={{ "--n": steps.length } as CSSProperties}>
        {steps.map((s, i) => (
          <li key={s} className={i < at ? "m-done" : i === at ? "m-now" : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <span className="s-eb s-steps-m">
        Step {at + 1} of {steps.length}: {steps[at]}
        {at + 1 < steps.length ? ` · Next: ${steps[at + 1]}` : ""}
      </span>
    </>
  );
}

const PH = ["interior", "kitchen", "bath", "villa", "dusk", "aerial"];

/** A property image: the i-th real photo when there are any, else a placeholder. */
function Ph({ i, className, children }: { i: number; className?: string; children?: ReactNode }) {
  const photos = useContext(Photos);
  const p = photos.length ? photos[i % photos.length] : undefined;
  return (
    <span
      className={["s-ph", p ? undefined : `ph-${PH[i % PH.length]}`, className]
        .filter(Boolean)
        .join(" ")}
      style={p ? { backgroundImage: `url("${p.src}")` } : undefined}
    >
      {children}
    </span>
  );
}

function Play() {
  return (
    <span className="s-play">
      <i>
        <Icon name="play" size={18} />
      </i>
    </span>
  );
}

function Box({ on }: { on?: boolean }) {
  return (
    <span className={on ? "s-box m-on" : "s-box"}>{on && <Icon name="check" size={12} />}</span>
  );
}

function Seg({ items, on }: { items: string[]; on: string }) {
  return (
    <div className="s-seg" style={{ "--n": items.length } as CSSProperties}>
      {items.map((t) => (
        <span key={t} aria-pressed={t === on}>
          {t}
        </span>
      ))}
    </div>
  );
}

function Opt({
  on,
  title,
  sub,
  price,
  nested,
}: {
  on?: boolean;
  title: string;
  sub?: string;
  price?: string;
  nested?: boolean;
}) {
  return (
    <div className={nested ? "s-opt m-nest" : "s-opt"}>
      <Box on={on} />
      <span className="s-stack">
        <span>{title}</span>
        {sub && <span className="s-small">{sub}</span>}
      </span>
      {price && <span className="s-num">{price}</span>}
    </div>
  );
}

/** The Book media page: heading, the step, the form, and "Your booking" (or the phone's bar). */
function BookPage({
  who,
  step,
  heading,
  panelTitle = "Your booking",
  lines,
  total,
  barText,
  primary = "Next",
  children,
}: {
  who: Who;
  step?: string;
  heading: string;
  panelTitle?: string;
  lines: { label: string; sub?: string; amount: string }[];
  total?: string;
  barText: string;
  primary?: string;
  children: ReactNode;
}) {
  return (
    <Shell
      who={who}
      tab="Home"
      bar={
        <div className="s-totalbar">
          <b className="s-bar-t">
            {barText} <Icon name="chevron" size={14} />
          </b>
          <span className="s-btn m-p">{primary}</span>
        </div>
      }
    >
      <span className="s-back">
        <Icon name="back" size={14} /> Back
      </span>
      <span className="s-h1">Book media</span>
      <div className="s-book">
        <div className="s-book-head">
          {step && <span className="s-eb">{step}</span>}
          <span className="s-h2">{heading}</span>
        </div>
        <div className="s-form">
          {children}
          <div className="s-foot">
            <span className="s-btn">Back</span>
            <span className="s-btn m-p">{primary}</span>
          </div>
        </div>
        <aside className="s-panel">
          <span className="s-h2">{panelTitle}</span>
          <ul className="s-lines">
            {lines.map((l) => (
              <li key={l.label}>
                <span>
                  {l.label}
                  {l.sub && <small>{l.sub}</small>}
                </span>
                <span className="s-num">{l.amount}</span>
              </li>
            ))}
          </ul>
          {total && (
            <div className="s-total">
              <span className="s-small">Total</span>
              <b>{total}</b>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

/** The shoot rates, with the seed rate card as a fallback so a frame never shows a gap. */
function useRates() {
  const r = useContext(Rates);
  const s = r?.shoot ?? SEED;
  return { ...s, edit: r?.edit };
}

/* ---------------- Home ---------------- */

function Overview({ who }: { who: Who }) {
  const rows = [
    {
      title: "2 Bed apartment, Marina Gate 1",
      meta: "Thu 9 Oct · Photography, Short-form reel",
      at: 4,
    },
    { title: "Villa, Arabian Ranches 2", meta: "Sat 25 Oct · Photography, 360° tour", at: 1 },
  ];
  return (
    <Shell who={who} tab="Home">
      <div className="s-stack">
        <span className="s-eb">Mon 20 Oct</span>
        <span className="s-h1">Home</span>
      </div>
      <section className="s-card">
        <span className="s-h2">Needs your attention</span>
        <div className="s-attn">
          <span className="s-eb">Shoots</span>
          <span className="s-strong">Your files are ready</span>
          <span className="s-small">
            Marina Gate 1. Download, then approve or ask for a revision.
          </span>
        </div>
      </section>
      <span className="s-h2">Your work</span>
      <div className="s-row">
        <span className="s-eb">Property shoots · 2 active</span>
        <span className="s-link">View all</span>
      </div>
      {rows.map((r) => (
        <div key={r.title} className="s-work">
          <div className="s-row">
            <span className="s-stack">
              <span className="s-strong">{r.title}</span>
              <span className="s-small">{r.meta}</span>
            </span>
            <span className="s-stack" style={{ alignItems: "flex-end" }}>
              <span className="s-strong">{SHOOT_STEPS[r.at]}</span>
              <span className="s-link">Open →</span>
            </span>
          </div>
          <Steps steps={SHOOT_STEPS} at={r.at} />
        </div>
      ))}
    </Shell>
  );
}

/* ---------------- Book media: what are you booking? ---------------- */

function BookChoose({ who }: { who: Who }) {
  const r = useRates();
  // Simplified for the preview (owner, 20 Oct 2026): icon, title, one line, "from".
  const choices = [
    { icon: "building", title: "Property shoot", line: "Photos, 360° tour and video", from: r.from },
    { icon: "video", title: "Content shoot", line: "Reels and YouTube videos", from: r.contentFrom },
    { icon: "editing", title: "Edit only", line: "You send the files, we edit", from: null },
  ];
  return (
    <Shell who={who} tab="Home">
      <span className="s-back">
        <Icon name="back" size={14} /> Back to dashboard
      </span>
      <span className="s-h1">Book media</span>
      <span className="s-h2">What are you booking?</span>
      <div className="s-choices">
        {choices.map((c) => (
          <div key={c.title} className="s-choice">
            <Icon name={c.icon} size={22} />
            <span className="s-h2" style={{ fontSize: 16 }}>
              {c.title}
            </span>
            <span className="s-small">{c.line}</span>
            <span className="s-num">{c.from != null ? `from ${aed(c.from)}` : "\u00a0"}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---------------- Book media: property shoot ---------------- */

function BookProperty({ who }: { who: Who }) {
  const r = useRates();
  const total = r.photo + r.twilight + r.reel;
  return (
    <BookPage
      who={who}
      step="Step 1 of 3"
      heading="Property shoot"
      lines={[
        { label: "Property shoot", sub: `${r.size} apartment · Photos`, amount: aed(r.photo) },
        { label: "Twilight images", sub: "5 images", amount: aed(r.twilight) },
        { label: "Short-form reel", sub: "1 video", amount: aed(r.reel) },
      ]}
      total={aed(total)}
      barText={aed(total)}
    >
      <span className="s-label">Property type</span>
      <Seg items={["Apartment", "Villa", "Commercial"]} on="Apartment" />
      <span className="s-label">Size</span>
      <Seg items={r.sizes.slice(0, 4)} on={r.size} />
      <div className="s-opts m-on">
        <Opt on title="Photography" sub={cap(r.delivery.photo)} price={aed(r.photo)} />
        <Opt
          on
          nested
          title="Twilight images"
          sub="Edited from your daylight photos"
          price={`+${aed(r.twilight)}`}
        />
      </div>
      <div className="s-opts">
        <Opt
          title="360° virtual tour"
          sub={`Delivered in ${r.delivery.tour}`}
          price={aed(r.tour)}
        />
      </div>
      <div className="s-opts">
        <span className="s-opts-h">Video</span>
        <Opt
          on
          title="Short-form reel"
          sub={`30–90 sec · ${r.delivery.short}`}
          price={aed(r.reel)}
        />
        <Opt
          title="Long-form walkthrough"
          sub={`Up to 5 min · ${r.delivery.long}`}
          price={aed(r.long)}
        />
      </div>
    </BookPage>
  );
}

/* ---------------- Book media: when & where ---------------- */

function BookWhere({ who }: { who: Who }) {
  const r = useRates();
  const total = r.photo + r.twilight + r.reel;
  // October 2026 starts on a Thursday; Monday-first grid. Today is the 20th, the 22nd is picked.
  const days = [...Array(3).fill(0), ...Array.from({ length: 31 }, (_, i) => i + 1)].slice(0, 35);
  return (
    <BookPage
      who={who}
      step="Step 2 of 3"
      heading="When & where"
      lines={[
        { label: "Property shoot", sub: `${r.size} apartment · Photos`, amount: aed(r.photo) },
        { label: "Twilight images", sub: "5 images", amount: aed(r.twilight) },
        { label: "Short-form reel", sub: "1 video", amount: aed(r.reel) },
        { label: "Thu 22 Oct", sub: "Start 10:00", amount: "" },
      ]}
      total={aed(total)}
      barText={aed(total)}
    >
      <div className="s-two m-stack">
        <div className="s-field">
          <span className="s-label">Date</span>
          <div className="s-card" style={{ padding: 10, gap: 6 }}>
            <div className="s-row">
              <span className="s-strong" style={{ fontSize: 14 }}>
                October 2026
              </span>
              <span className="s-small">‹ ›</span>
            </div>
            <div className="s-cal">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <b key={i}>{d}</b>
              ))}
              {days.map((d, i) => (
                <span
                  key={i}
                  className={d === 22 ? "m-on" : d && d < 21 ? "m-off" : undefined}
                  aria-hidden={!d}
                >
                  {d || ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="s-field" style={{ alignContent: "start" }}>
          <span className="s-label">Start time</span>
          <span className="s-in">10:00 · Morning</span>
          <span className="s-label" style={{ marginTop: 8 }}>
            Location
          </span>
          <span className="s-in">
            <Icon name="pin" size={16} /> Marina Gate 1
          </span>
          <div className="s-map">
            <i>
              <Icon name="pin" size={28} />
            </i>
          </div>
        </div>
      </div>
      <div className="s-two">
        <div className="s-field">
          <span className="s-label">Unit</span>
          <span className="s-in">Apt 2104</span>
        </div>
        <div className="s-field">
          <span className="s-label">Access</span>
          <span className="s-in">Keys at reception</span>
        </div>
      </div>
    </BookPage>
  );
}

/* ---------------- Booking requested ---------------- */

function Confirmed({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Home">
      <div className="s-done">
        <span className="s-done-ic">
          <Icon name="check" size={22} />
        </span>
        <span className="s-eb">Requested</span>
        <span className="s-h2">Booking requested</span>
        <p className="s-small">
          Thu 22 Oct, start 10:00 · Marina Gate 1. No payment now. We&apos;ll confirm your slot by
          email.
        </p>
        <div className="s-actions" style={{ justifyContent: "center" }}>
          <span className="s-btn m-p">Track booking</span>
          <span className="s-btn">Book another</span>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Booking detail: delivered ---------------- */

function Deliveries({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Shoots">
      <span className="s-back">
        <Icon name="back" size={14} /> Shoots
      </span>
      <div className="s-head">
        <span className="s-stack">
          <span className="s-eb">Thu 9 Oct · Morning</span>
          <span className="s-h1">Marina Gate 1</span>
        </span>
        <span className="s-pill m-gold">Delivered</span>
      </div>
      <Steps steps={SHOOT_STEPS} at={4} />
      <p className="s-small">
        Happy with it? Approve to complete. Otherwise it completes on its own in 7 days.
      </p>
      <div className="s-actions">
        <span className="s-btn">Request revision (1 of 2)</span>
        <span className="s-btn">
          <Icon name="check" size={16} /> Approve
        </span>
      </div>
      <section className="s-card">
        <div className="s-row">
          <span className="s-h2">Photos (24)</span>
          <span className="s-btn">
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <div className="s-thumbs" style={{ "--c": 4, "--cp": 2 } as CSSProperties}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i > 1 ? "s-file m-desk" : "s-file"}>
              <Ph i={i} />
              <span>IMG_{String(i + 1).padStart(2, "0")}.jpg</span>
            </span>
          ))}
        </div>
      </section>
      <section className="s-card">
        <div className="s-row">
          <span className="s-row" style={{ justifyContent: "flex-start", gap: 12 }}>
            <Ph i={4} className="m-v m-mini" />
            <span className="s-stack">
              <span className="s-h2">Videos (1)</span>
              <span className="s-small">Short-form reel · 0:45 · 9:16</span>
            </span>
          </span>
          <span className="s-btn">
            <Icon name="download" size={16} /> Download
          </span>
        </div>
      </section>
    </Shell>
  );
}

/* ---------------- The listing share page (what buyers open) ---------------- */

function Share() {
  return (
    <div className="s-lp">
      <div className="s-lp-top">
        <BrandLogo tone="light" />
        <span className="s-eb">Shared by Demo Realty</span>
      </div>
      <div className="s-mosaic">
        {[0, 1, 2, 3, 4].map((i) => (
          <Ph key={i} i={i}>
            {i === 0 && <span className="s-count phone-only">1 / 24</span>}
          </Ph>
        ))}
      </div>
      <div className="s-lp-cols">
        <div className="s-stack" style={{ gap: 10 }}>
          <span className="s-price">AED 2,450,000</span>
          <span className="s-h2">2 Bed apartment, Marina Gate 1</span>
          <span className="s-facts">
            <span>
              <Icon name="bed" size={16} /> 2 beds
            </span>
            <span>
              <Icon name="bath" size={16} /> 3 baths
            </span>
            <span>
              <Icon name="area" size={16} /> 1,320 sq ft
            </span>
            <span>
              <Icon name="tour" size={16} /> 360° tour
            </span>
          </span>
          <p className="s-small">
            A bright, high-floor two bedroom with full-height windows and an open kitchen. Both
            bedrooms face the water. Vacant and ready to view this week.
          </p>
          <span className="s-chips">
            {["Marina view", "Pool and gym", "Covered parking"].map((a) => (
              <span key={a}>{a}</span>
            ))}
          </span>
        </div>
        <aside className="s-card s-agent">
          <span className="s-strong">Sara Mathew</span>
          <span className="s-small">Demo Realty</span>
          <span className="s-btn m-p">
            <Icon name="whatsapp" size={16} /> WhatsApp
          </span>
          <span className="s-btn">
            <Icon name="phone" size={16} /> Call
          </span>
        </aside>
      </div>
      <div className="s-callbar">
        <span className="s-btn">
          <Icon name="phone" size={16} /> Call
        </span>
        <span className="s-btn m-p">
          <Icon name="whatsapp" size={16} /> WhatsApp
        </span>
      </div>
    </div>
  );
}

/* ---------------- Editing ---------------- */

function EditRequest({ who }: { who: Who }) {
  const { edit: e, delivery: d } = useRates();
  const delivery = cap(d.short);
  const cur = e?.currency ?? "USD";
  const qty = 6;
  const cards = [
    {
      title: "Short‑form",
      line: "Vertical reels · 9:16",
      price: e ? `${aed(e.reel, cur)} each` : "",
    },
    {
      title: "Long‑form",
      line: "Horizontal YouTube · 16:9",
      price: e ? `${aed(e.long, cur)} each` : "",
    },
    {
      title: "Listing photo edits",
      line: "HDR property photos",
      price: e ? `${aed(e.photo, cur)} / photo` : "",
    },
    { title: "Other", line: "Tell us what you need", price: "" },
  ];
  return (
    <BookPage
      who={who}
      heading="Edit only"
      panelTitle="Your request"
      lines={[
        {
          label: "Short-form",
          sub: `Quantity ${qty}`,
          amount: e ? aed(e.reel * qty, cur) : "",
        },
        { label: "Delivery", amount: delivery },
      ]}
      barText="Short-form"
      primary="Send request"
    >
      <div className="s-cards">
        {cards.map((c, i) => (
          <div key={c.title} className={i === 0 ? "s-svc m-on" : "s-svc"}>
            <b>{c.title}</b>
            <span className="s-small" style={{ gridColumn: "1 / -1" }}>
              {c.line}
            </span>
            {c.price && <span className="s-num">{c.price}</span>}
          </div>
        ))}
      </div>
      <div className="s-two">
        <div className="s-field">
          <span className="s-label">Title</span>
          <span className="s-in">October listings reels</span>
        </div>
        <div className="s-field">
          <span className="s-label">Quantity</span>
          <span className="s-in">{qty}</span>
        </div>
      </div>
      <span className="s-label">Raw files</span>
      <Seg items={["Paste links", "Upload"]} on="Paste links" />
      <span className="s-in">
        <Icon name="link" size={16} /> drive.google.com/…/october-raw
      </span>
    </BookPage>
  );
}

function ProjectHead({
  tab,
  eb,
  title,
  steps,
  at,
  pill,
}: {
  tab: string;
  eb: string;
  title: string;
  steps: readonly string[];
  at: number;
  pill?: boolean;
}) {
  return (
    <>
      <span className="s-back">
        <Icon name="back" size={14} /> {tab}
      </span>
      <div className="s-head">
        <span className="s-stack">
          <span className="s-eb">{eb}</span>
          <span className="s-h1">{title}</span>
        </span>
        <span className={pill ? "s-pill m-gold" : "s-pill"}>{steps[at]}</span>
      </div>
      <Steps steps={steps} at={at} />
    </>
  );
}

function EditStatus({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Editing">
      <ProjectHead
        tab="Editing"
        eb="Short-form · 6 reels"
        title="October listings"
        steps={EDIT_STEPS}
        at={2}
      />
      <section className="s-card">
        <span className="s-h2">Raw files</span>
        {["Marina Gate 1 · raw clips", "Arabian Ranches villa · raw clips", "Logo and music"].map(
          (f) => (
            <div key={f} className="s-row">
              <span className="s-row" style={{ justifyContent: "flex-start", gap: 8 }}>
                <Icon name="link" size={16} /> {f}
              </span>
              <span className="s-eb">Received</span>
            </div>
          ),
        )}
      </section>
      <section className="s-card">
        <span className="s-h2">Activity</span>
        <div className="s-stack" style={{ gap: 8 }}>
          {[
            ["In editing", "Mon 20 Oct, 09:40"],
            ["Files received", "Sun 19 Oct, 18:05"],
            ["Submitted", "Sun 19 Oct, 17:52"],
          ].map(([t, d]) => (
            <span key={t} className="s-row">
              <span>{t}</span>
              <span className="s-eb">{d}</span>
            </span>
          ))}
        </div>
        <p className="s-small">We&apos;ll email you as soon as it&apos;s delivered.</p>
      </section>
    </Shell>
  );
}

function EditDelivered({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Editing">
      <ProjectHead
        tab="Editing"
        eb="Short-form · 6 reels"
        title="October listings"
        steps={EDIT_STEPS}
        at={3}
        pill
      />
      <section className="s-card">
        <p className="s-small">Happy with it? Approve to complete, or ask for a revision.</p>
        <div className="s-actions">
          <span className="s-btn">Request revision (1 of 2)</span>
          <span className="s-btn">
            <Icon name="check" size={16} /> Approve
          </span>
        </div>
      </section>
      <section className="s-card">
        <div className="s-row">
          <span className="s-h2">Videos (6)</span>
          <span className="s-btn">
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <div className="s-thumbs" style={{ "--c": 6, "--cp": 3 } as CSSProperties}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={i > 2 ? "s-file m-desk" : "s-file"}>
              <Ph i={i} className="m-v">
                <Play />
              </Ph>
              <span>Reel {i + 1}</span>
            </span>
          ))}
        </div>
      </section>
    </Shell>
  );
}

/* ---------------- AI avatars ---------------- */

function AvatarRequest({ who }: { who: Who }) {
  return (
    <Shell
      who={who}
      tab="Avatars"
      over={
        <div className="s-modal-bg">
          <div className="s-modal">
            <div className="s-row">
              <span className="s-h2">AI avatar video</span>
              <Icon name="close" size={18} />
            </div>
            <span className="s-label">Your AI avatar</span>
            <div className="s-row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <span className="s-ph ph-adam" style={{ width: 44, aspectRatio: "1" }} />
              <span className="s-stack">
                <span className="s-strong">Adam</span>
                <span className="s-small">Approved · real estate presenter</span>
              </span>
            </div>
            <span className="s-label">Format</span>
            <Seg items={["Short form · 9:16", "Long form · 16:9"]} on="Long form · 16:9" />
            <span className="s-label">Length: 1 min</span>
            <div className="s-seg" style={{ "--n": 6 } as CSSProperties}>
              {["1", "2", "3", "5", "10", "15"].map((m) => (
                <span key={m} aria-pressed={m === "1"}>
                  {m} min
                </span>
              ))}
            </div>
            <span className="s-label">Script</span>
            <Seg items={["Milkywayy writes it", "I’ll send it"]} on="Milkywayy writes it" />
            <span className="s-label">Brief</span>
            <span className="s-in m-tall">
              Q4 market update for JVC: prices, rents and two listings to feature.
            </span>
            <div className="s-foot" style={{ display: "flex" }}>
              <span className="s-btn">Cancel</span>
              <span className="s-btn m-p">Send brief</span>
            </div>
          </div>
        </div>
      }
    >
      <AvatarList />
    </Shell>
  );
}

function AvatarList() {
  return (
    <>
      <span className="s-h1">Avatars</span>
      <div className="s-work">
        <div className="s-row">
          <span className="s-stack">
            <span className="s-strong">JVC market update</span>
            <span className="s-small">Long form · 1 min</span>
          </span>
          <span className="s-strong">In production</span>
        </div>
        <Steps steps={AVATAR_STEPS} at={2} />
      </div>
    </>
  );
}

function AvatarProduction({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Avatars">
      <ProjectHead
        tab="Avatars"
        eb="AI avatar · Long form · 1 min"
        title="JVC market update"
        steps={AVATAR_STEPS}
        at={2}
      />
      <section className="s-card">
        <div className="s-row">
          <span className="s-h2">Script</span>
          <span className="s-pill">Approved</span>
        </div>
        <p className="s-small">
          &ldquo;Three things moved in JVC this quarter. Here&apos;s what they mean if you&apos;re
          buying, and two homes worth a look this week&hellip;&rdquo;
        </p>
      </section>
      <section className="s-card">
        <span className="s-h2">Activity</span>
        <div className="s-stack" style={{ gap: 8 }}>
          {[
            ["In production", "Mon 20 Oct, 11:20"],
            ["Script approved", "Sun 19 Oct, 16:02"],
            ["Script ready", "Sat 18 Oct, 14:45"],
          ].map(([t, d]) => (
            <span key={t} className="s-row">
              <span>{t}</span>
              <span className="s-eb">{d}</span>
            </span>
          ))}
        </div>
        <p className="s-small">We&apos;ll email you as soon as it&apos;s delivered.</p>
      </section>
    </Shell>
  );
}

function AvatarDelivered({ who }: { who: Who }) {
  return (
    <Shell who={who} tab="Avatars">
      <ProjectHead
        tab="Avatars"
        eb="AI avatar · Long form · 1 min"
        title="JVC market update"
        steps={AVATAR_STEPS}
        at={3}
        pill
      />
      <section className="s-card">
        <div className="s-row">
          <span className="s-h2">Your video</span>
          <span className="s-btn">
            <Icon name="download" size={16} /> Download
          </span>
        </div>
        <span className="s-ph m-w ph-adam" style={{ maxWidth: 360 }}>
          <Play />
        </span>
      </section>
      <section className="s-card">
        <p className="s-small">Two revision rounds included. Happy with it? Approve to complete.</p>
        <div className="s-actions">
          <span className="s-btn">Request revision (1 of 2)</span>
          <span className="s-btn">
            <Icon name="check" size={16} /> Approve
          </span>
        </div>
      </section>
    </Shell>
  );
}

function Screen({ kind, who }: { kind: ShowcaseScreen; who: Who }) {
  switch (kind) {
    case "overview":
      return <Overview who={who} />;
    case "book-media":
      return <BookChoose who={who} />;
    case "book-property":
      return <BookProperty who={who} />;
    case "book-where":
      return <BookWhere who={who} />;
    case "confirmed":
      return <Confirmed who={who} />;
    case "deliveries":
      return <Deliveries who={who} />;
    case "share":
      return <Share />;
    case "edit-request":
      return <EditRequest who={who} />;
    case "edit-status":
      return <EditStatus who={who} />;
    case "edit-delivered":
      return <EditDelivered who={who} />;
    case "avatar-request":
      return <AvatarRequest who={who} />;
    case "avatar-production":
      return <AvatarProduction who={who} />;
    case "avatar-delivered":
      return <AvatarDelivered who={who} />;
  }
}
