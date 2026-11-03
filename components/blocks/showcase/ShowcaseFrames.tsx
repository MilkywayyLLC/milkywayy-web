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
 * The dashboard preview's frames (dark V2 portal, owner 3 Nov 2026): static mocks of the client
 * portal as it is now, on the portal's tokens. Demo data only: a made-up client, the portal's real
 * status names and nav, prices from the rate card.
 *
 * One markup, two landscape layouts: "desk" draws the desktop portal with its rail; "tablet" the
 * tablet portal with its top bar and menu. Phones get the tablet frame scaled down, never a tall
 * phone frame. Loaded on its own (next/dynamic) once the section is near the screen.
 */

const SEED = showcaseRates(propertyPricing).shoot!;
const Photos = createContext<ShowcasePhoto[]>([]);
const Rates = createContext<ShowcaseRates | undefined>(undefined);

/** Content shoot demo prices, from the portal's rate card (rate_card: content_4h, content_short_edit,
 *  content_long_5 per minute). Change them with the rate card. */
const CONTENT = { h4: 900, short: 200, long5: 95 };
const INVOICE = { number: "INV-1042", amount: 1850 };

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
  return (
    <div className="dsh-canvas" inert style={{ width: w, height: h }}>
      <Photos.Provider value={photos}>
        <Rates.Provider value={rates}>
          {features.map((f, i) => (
            <div key={f.title} className={i === active ? "dsh-frame on" : "dsh-frame"}>
              <Fit key={layout} layout={layout}>
                <div className="scm" data-l={layout}>
                  <Screen kind={f.screen} />
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

/* ---------------- the portal's nav ---------------- */

const TABS: [string, string][] = [
  ["home", "Home"],
  ["shoots", "Shoots"],
  ["editing", "Editing"],
  ["avatars", "Avatars"],
  ["listings", "Listings"],
  ["billing", "Billing"],
  ["team", "People"],
  ["settings", "Settings"],
];

function Shell({
  tab,
  children,
  over,
}: {
  tab: string;
  children: ReactNode;
  /** A modal over the page. */
  over?: ReactNode;
}) {
  return (
    <div className="s-shell">
      <aside className="s-rail">
        <span className="s-logo">
          <BrandLogo tone="dark" />
        </span>
        <nav className="s-nav">
          {TABS.map(([icon, name]) => (
            <span key={name} aria-current={name === tab ? "page" : undefined}>
              <Icon name={icon} size={18} /> {name}
            </span>
          ))}
        </nav>
        <span className="s-plan">
          <span className="s-eb">Pay per shoot</span>
          <span className="s-small">End of month</span>
        </span>
      </aside>
      <div className="s-main">
        <header className="s-top">
          <span className="s-logo">
            <span className="s-menu">
              <Icon name="menu" size={18} />
            </span>
            <BrandLogo tone="dark" />
          </span>
          <span className="s-top-r">
            <span className="s-hello">Hello, Sara</span>
            <span className="s-acct">
              <Icon name="bell" size={18} />
            </span>
            <span className="s-acct">
              <Icon name="person" size={18} />
            </span>
            <span className="s-btn m-p">
              <Icon name="plus" size={16} /> Book media
            </span>
          </span>
        </header>
        <div className="s-content">{children}</div>
      </div>
      {over}
    </div>
  );
}

/* ---------------- shared parts ---------------- */

function Steps({ steps, at }: { steps: readonly string[]; at: number }) {
  return (
    <ol className="s-steps" style={{ "--n": steps.length } as CSSProperties}>
      {steps.map((s, i) => (
        <li key={s} className={i < at ? "m-done" : i === at ? "m-now" : undefined}>
          {s}
        </li>
      ))}
    </ol>
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

/** The Book media page: heading, the step, the form, and "Your booking". */
function BookPage({
  step,
  heading,
  panelTitle = "Your booking",
  lines,
  total,
  primary = "Next",
  children,
}: {
  step?: string;
  heading: string;
  panelTitle?: string;
  lines: { label: string; sub?: string; amount: string }[];
  total?: string;
  primary?: string;
  children: ReactNode;
}) {
  return (
    <Shell tab="Home">
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

/* ---------------- Home: due card, stats, active shoots ---------------- */

function Overview() {
  const rows = [
    {
      ref: "MW-1204",
      title: "2 Bed apartment, Marina Gate 1",
      meta: "Thu 5 Nov · Photography, Short-form reel",
      at: 4,
    },
    {
      ref: "MW-1211",
      title: "Villa, Arabian Ranches 2",
      meta: "Sat 14 Nov · Photography, 360° tour",
      at: 1,
    },
  ];
  return (
    <Shell tab="Home">
      <div className="s-stack">
        <span className="s-eb">Tue 10 Nov</span>
        <span className="s-h1">Hello, Sara</span>
      </div>
      <section className="s-due">
        <b className="s-strong">1 invoice due · {aed(INVOICE.amount)}</b>
        <span className="s-actions">
          <span className="s-btn m-p">Pay</span>
          <span className="s-btn">Open Billing</span>
        </span>
      </section>
      <div className="s-stats">
        {[
          ["Next shoot", "14 Nov"],
          ["In editing", "2"],
          ["Ready", "1"],
        ].map(([k, v]) => (
          <div key={k} className="s-stat">
            <span className="s-eb">{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="s-row">
        <span className="s-eb">Active shoots · 2</span>
        <span className="s-link">View all</span>
      </div>
      {rows.map((r) => (
        <div key={r.title} className="s-work">
          <div className="s-row">
            <span className="s-stack">
              <span className="s-strong">{r.title}</span>
              <span className="s-small">
                {r.ref} · {r.meta}
              </span>
            </span>
            <span className="s-strong">{SHOOT_STEPS[r.at]}</span>
          </div>
          <Steps steps={SHOOT_STEPS} at={r.at} />
        </div>
      ))}
    </Shell>
  );
}

/* ---------------- Book media: content shoot ---------------- */

function BookContent() {
  const c = CONTENT;
  const shorts = 8;
  const long = c.long5 * 5;
  const total = c.h4 + shorts * c.short + long;
  return (
    <BookPage
      step="Step 1 of 3"
      heading="Content shoot"
      lines={[
        { label: "Content shoot", sub: "4 hours, raw files", amount: aed(c.h4) },
        { label: "Short-form edits", sub: `${shorts} videos`, amount: aed(shorts * c.short) },
        { label: "Long-form edit", sub: "1 video, 5 min", amount: aed(long) },
      ]}
      total={aed(total)}
    >
      <div className="s-card">
        <div className="s-row">
          <span className="s-strong">Shoot length</span>
          <span className="s-num">4 hours · {aed(c.h4)}</span>
        </div>
        <span className="s-small">Shoot only: you get the raw files. Add edits below.</span>
        <span className="s-range" style={{ "--pct": "50%" } as CSSProperties}>
          <i />
        </span>
        <span className="s-ticks">
          <span>2 h</span>
          <b>4 h</b>
          <span>8 h</span>
        </span>
      </div>
      <div className="s-opts">
        <span className="s-opts-h">Edits</span>
        <div className="s-opt" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
          <span className="s-stack">
            <span>Short-form edit</span>
            <span className="s-small">{aed(c.short)} each</span>
          </span>
          <span className="s-step">
            <i>−</i> {shorts} <i>+</i>
          </span>
        </div>
        <div className="s-opt" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
          <span className="s-stack">
            <span>Long-form edit</span>
            <span className="s-small">5 min · {aed(long)}</span>
          </span>
          <span className="s-step">
            <i>−</i> 1 <i>+</i>
          </span>
        </div>
      </div>
    </BookPage>
  );
}

/* ---------------- Billing ---------------- */

function Billing() {
  return (
    <Shell tab="Billing">
      <div className="s-stack">
        <span className="s-h1">Billing</span>
        <span className="s-small">End of month</span>
      </div>
      <section className="s-due">
        <span className="s-stack">
          <span className="s-eb">Due now</span>
          <b className="s-strong">{aed(INVOICE.amount)}</b>
        </span>
        <span className="s-stack" style={{ alignItems: "flex-end" }}>
          <span className="s-eb">Unbilled work this month</span>
          <b className="s-strong">{aed(1250)}</b>
          <span className="s-small">Invoice scheduled for 30 Nov</span>
        </span>
      </section>
      <span className="s-eb">Due</span>
      <div className="s-inv">
        <div className="s-row">
          <span className="s-stack">
            <span className="s-strong">{INVOICE.number}</span>
            <span className="s-small">MW-1204 · October 2026 · Due 30 Nov</span>
          </span>
          <span className="s-row" style={{ gap: 12 }}>
            <span className="s-num">{aed(INVOICE.amount)}</span>
            <span className="s-pill m-gold">Due</span>
          </span>
        </div>
        <div className="s-actions">
          <span className="s-btn m-p">Pay by card</span>
          <span className="s-btn">Bank transfer</span>
          <span className="s-btn">
            <Icon name="download" size={16} /> PDF
          </span>
        </div>
      </div>
      <span className="s-eb">Paid</span>
      <div className="s-inv">
        <div className="s-row">
          <span className="s-stack">
            <span className="s-strong">INV-1029</span>
            <span className="s-small">MW-1188 · September 2026 · by bank transfer</span>
          </span>
          <span className="s-row" style={{ gap: 12 }}>
            <span className="s-num">{aed(2400)}</span>
            <span className="s-pill">Paid</span>
          </span>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Book media: property shoot ---------------- */

function BookProperty() {
  const r = useRates();
  const total = r.photo + r.twilight + r.reel;
  return (
    <BookPage
      step="Step 1 of 3"
      heading="Property shoot"
      lines={[
        { label: "Property shoot", sub: `${r.size} apartment · Photos`, amount: aed(r.photo) },
        { label: "Twilight images", sub: "5 images", amount: aed(r.twilight) },
        { label: "Short-form reel", sub: "1 video", amount: aed(r.reel) },
      ]}
      total={aed(total)}
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

function BookWhere() {
  const r = useRates();
  const total = r.photo + r.twilight + r.reel;
  // October 2026 starts on a Thursday; Monday-first grid. Today is the 20th, the 22nd is picked.
  const days = [...Array(3).fill(0), ...Array.from({ length: 31 }, (_, i) => i + 1)].slice(0, 35);
  return (
    <BookPage
      step="Step 2 of 3"
      heading="When & where"
      lines={[
        { label: "Property shoot", sub: `${r.size} apartment · Photos`, amount: aed(r.photo) },
        { label: "Twilight images", sub: "5 images", amount: aed(r.twilight) },
        { label: "Short-form reel", sub: "1 video", amount: aed(r.reel) },
        { label: "Thu 22 Oct", sub: "Start 10:00", amount: "" },
      ]}
      total={aed(total)}
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

function Confirmed() {
  return (
    <Shell tab="Home">
      <div className="s-done">
        <span className="s-done-ic">
          <Icon name="check" size={22} />
        </span>
        <span className="s-eb">Requested</span>
        <span className="s-h2">Booking requested</span>
        <p className="s-small">
          Thu 22 Oct, start 10:00 · Marina Gate 1. We&apos;ll confirm your slot by email. Payment
          follows your account&apos;s terms.
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

function Deliveries() {
  return (
    <Shell tab="Shoots">
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
        <BrandLogo tone="dark" />
        <span className="s-eb">Shared by Demo Realty</span>
      </div>
      <div className="s-mosaic">
        {[0, 1, 2, 3, 4].map((i) => (
          <Ph key={i} i={i} />
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
    </div>
  );
}

/* ---------------- Editing ---------------- */

function EditRequest() {
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

function EditStatus() {
  return (
    <Shell tab="Editing">
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

function EditDelivered() {
  return (
    <Shell tab="Editing">
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

function AvatarRequest() {
  return (
    <Shell
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

function AvatarProduction() {
  return (
    <Shell tab="Avatars">
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

function AvatarDelivered() {
  return (
    <Shell tab="Avatars">
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

function Screen({ kind }: { kind: ShowcaseScreen }) {
  switch (kind) {
    case "overview":
      return <Overview />;
    case "book-media":
      return <BookContent />;
    case "book-property":
      return <BookProperty />;
    case "book-where":
      return <BookWhere />;
    case "confirmed":
      return <Confirmed />;
    case "deliveries":
      return <Deliveries />;
    case "billing":
      return <Billing />;
    case "share":
      return <Share />;
    case "edit-request":
      return <EditRequest />;
    case "edit-status":
      return <EditStatus />;
    case "edit-delivered":
      return <EditDelivered />;
    case "avatar-request":
      return <AvatarRequest />;
    case "avatar-production":
      return <AvatarProduction />;
    case "avatar-delivered":
      return <AvatarDelivered />;
  }
}
