"use client";

import "@/app/styles/portal.css";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import { BrandLogo } from "@/components/layout/Logo";
import { Icon } from "@/components/portal/Icon";
import type { PropertyPricing } from "@/content/types";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { AVATAR_FORMATS, SERVICE_HINT, SERVICE_LABEL } from "@/lib/portal/booking";
import { EDIT_KINDS } from "@/lib/portal/projects";

/**
 * The client dashboard, shown like a SaaS feature section (static frames, 13 Oct 2026): feature
 * tabs on the left, and the selected tab shows ONE still frame of the real portal (its markup and
 * portal.css classes, mock data) drawn on a fixed 880px canvas scaled to fit. No pointer, no
 * fake clicks, no motion inside a frame: frames only crossfade (200ms).
 *
 * Auto-advances every 5s while in view and never pauses on hover; clicking a tab selects it and
 * holds it for 10s before auto-advance resumes. All mock styles live under `.dsh-mock`.
 *
 * Frames never crop: each one is measured and, if its content (a long modal, say) is taller than
 * the canvas, the whole frame is scaled down to fit. Property images are real published portfolio
 * photos (`photos`, see lib/showcase showcasePhotos), with the CSS placeholders as fallback.
 */
export type ShowcaseScreen =
  | "overview"
  | "book-media"
  | "book-property"
  | "book-where"
  | "confirmed"
  | "deliveries"
  | "share"
  | "edit-request"
  | "edit-status"
  | "edit-delivered"
  | "avatar-request"
  | "avatar-production"
  | "avatar-delivered";

export type ShowcasePhoto = { src: string; alt: string };

const Photos = createContext<ShowcasePhoto[]>([]);

/** A property image: the i-th real photo when there are any, else the named placeholder. */
function Ph({ i, ph, className }: { i: number; ph: string; className?: string }) {
  const photos = useContext(Photos);
  const p = photos.length ? photos[i % photos.length] : undefined;
  return (
    <span
      className={["dsh-ph", p ? undefined : `ph-${ph}`, className].filter(Boolean).join(" ")}
      style={p ? { backgroundImage: `url("${p.src}")` } : undefined}
      role={p ? "img" : undefined}
      aria-label={p?.alt}
    />
  );
}

/** Scales a frame down (never up) so all of its content fits the canvas. */
function Fit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (sel: string) => el.querySelector<HTMLElement>(sel);
    const modal = h(".pt-modal");
    const top = h(".pt-top");
    const content = h(".pt-content");
    const lp = h(".dsh-lp-in");
    const need = Math.max(
      modal ? modal.offsetHeight + 48 : 0,
      top && content ? top.offsetHeight + content.scrollHeight : 0,
      lp ? lp.offsetHeight : 0,
    );
    if (need > CANVAS_H) setS(CANVAS_H / need);
  }, []);
  return (
    <div
      ref={ref}
      className="dsh-fit"
      style={{ width: CANVAS_W / s, height: CANVAS_H / s, transform: `scale(${s})` }}
    >
      {children}
    </div>
  );
}

export type ShowcaseFeature = {
  icon: string;
  title: string;
  text: string;
  screen: ShowcaseScreen;
};

const CYCLE_MS = 5000;
const HOLD_MS = 10000;
const CANVAS_W = 880;
const CANVAS_H = 560;

export function DashboardShowcase({
  features,
  label = "Client dashboard features",
  pricing,
  photos = [],
}: {
  features: ShowcaseFeature[];
  label?: string;
  /** Published portfolio photos for the property images. */
  photos?: ShowcasePhoto[];
  /** The property price list, so "book-property" draws the real builder. */
  pricing?: PropertyPricing;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false); // a click: this frame stays 10s
  const [tick, setTick] = useState(0); // restarts the timer and the progress line
  const [inView, setInView] = useState(false);
  const [k, setK] = useState(0.66);
  const n = features.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Scale the 880px canvas to the window's width.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / CANVAS_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance (off for reduced motion and while out of view).
  useEffect(() => {
    if (!inView || n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(
      () => {
        setActive((a) => (a + 1) % n);
        setHeld(false);
        setTick((c) => c + 1);
      },
      held ? HOLD_MS : CYCLE_MS,
    );
    return () => clearTimeout(t);
  }, [inView, held, tick, n]);

  // Phones: the tabs are a sideways snap row; keep the active one centred as it changes (auto
  // or tap). Scrolls the row only (like scrollIntoView inline:center), never the page.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = list.current;
    const tab = row?.children[active] as HTMLElement | undefined;
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({
      left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [active]);

  const select = (i: number) => {
    setActive(i);
    setHeld(true);
    setTick((c) => c + 1);
  };

  return (
    <div ref={root} className="dsh">
      <div
        ref={list}
        className="dsh-list"
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
      >
        {features.map((f, i) => {
          const on = i === active;
          return (
            <button
              key={f.title}
              type="button"
              role="tab"
              id={`${uid}-t${i}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              className="dsh-item"
              onClick={() => select(i)}
              onKeyDown={(e) => {
                const d = ["ArrowDown", "ArrowRight"].includes(e.key)
                  ? 1
                  : ["ArrowUp", "ArrowLeft"].includes(e.key)
                    ? -1
                    : 0;
                if (!d) return;
                e.preventDefault();
                const j = (i + d + n) % n;
                select(j);
                document.getElementById(`${uid}-t${j}`)?.focus();
              }}
            >
              <span className="dsh-ic" aria-hidden="true">
                <Icon name={f.icon} />
              </span>
              <span className="dsh-txt">
                <b>{f.title}</b>
                <span className="dsh-desc">{f.text}</span>
              </span>
              {on && inView && (
                <span className="dsh-prog" aria-hidden="true">
                  <i key={tick} style={{ animationDuration: `${held ? HOLD_MS : CYCLE_MS}ms` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="dsh-desc-m" aria-hidden="true">
        {features[active]?.text}
      </p>

      <div
        className="dsh-win"
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-t${active}`}
      >
        <div className="dsh-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>
            {features[active]?.screen === "share"
              ? "milkywayy.com/l/marina-gate-2br"
              : "milkywayy.com/portal"}
          </span>
        </div>
        <div
          ref={stage}
          className="dsh-mock"
          aria-hidden="true"
          style={{ ["--k" as string]: k, height: CANVAS_H * k }}
        >
          <div className="dsh-canvas" inert style={{ width: CANVAS_W, height: CANVAS_H }}>
            {features.map((f, i) => (
              <div key={f.title} className={i === active ? "dsh-frame on" : "dsh-frame"}>
                <Photos.Provider value={photos}>
                  <Fit>
                    <Screen kind={f.screen} pricing={pricing} />
                  </Fit>
                </Photos.Provider>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- the portal frame: rail, "Hello, {name}", account, Book media ---------------- */

const RAIL = [
  ["home", "Home"],
  ["shoots", "Shoots"],
  ["editing", "Editing"],
  ["avatars", "Avatars"],
  ["listings", "Listings"],
  ["chat", "Inquiries"],
  ["billing", "Billing"],
] as const;

function Portal({
  tab = "Home",
  children,
  modal,
}: {
  tab?: (typeof RAIL)[number][1];
  children: ReactNode;
  modal?: ReactNode;
}) {
  return (
    <div className="pt dsh-pt" data-tone="light">
      <div className="pt-shell">
        <aside className="pt-rail">
          <span className="pt-logo">
            <BrandLogo tone="light" />
          </span>
          <nav className="pt-rail-nav">
            {RAIL.map(([icon, name]) => (
              <a key={name} aria-current={name === tab ? "page" : undefined}>
                <Icon name={icon} /> {name}
              </a>
            ))}
            <span className="pt-rail-sep" />
            <a>
              <Icon name="settings" /> Settings
            </a>
          </nav>
        </aside>
        <div className="pt-main">
          <header className="pt-top">
            <span className="pt-logo pt-logo-sm" />
            <div className="pt-top-right">
              <span className="pt-hello">Hello, Sara</span>
              <span className="pt-acct">
                <Icon name="person" size={20} />
              </span>
              <span className="btn btn-p btn-s">
                <Icon name="plus" size={16} /> Book media
              </span>
            </div>
          </header>
          <div className="pt-content">{children}</div>
        </div>
      </div>
      {modal}
    </div>
  );
}

function Modal({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="pt-modal-bg">
      <div className="pt-modal">
        <div className="pt-modal-head">
          <span className="pt-h2">{title}</span>
          <span className="pt-icon-btn">
            <Icon name="close" />
          </span>
        </div>
        <div className="pt-modal-body">{children}</div>
        {footer && <div className="pt-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="pt-field">
      <span className="pt-field-label">
        {label} {!optional && <span className="pt-req">*</span>}
      </span>
      {children}
    </div>
  );
}

/* ---------------- Home → Your work ---------------- */

const SHOOT = ["Requested", "Confirmed", "Shot", "Editing", "Delivered", "Completed"];
const EDIT = ["Submitted", "Files received", "In editing", "Delivered", "Completed"];
const AVATAR = ["Brief received", "Script ready", "In production", "Delivered", "Completed"];

function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="pt-wsteps" style={{ ["--n" as string]: steps.length, ["--at" as string]: at }}>
      {steps.map((s, i) => (
        <li key={s} className={i < at ? "is-done" : i === at ? "is-now" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

type WorkRow = { title: string; meta: string; steps: string[]; at: number };

function WorkGroup({ name, rows }: { name: string; rows: WorkRow[] }) {
  return (
    <div className="pt-work-group">
      <div className="pt-row">
        <span className="pt-eb">
          {name} · {rows.length} active
        </span>
        <span className="lnk pt-small">View all</span>
      </div>
      <ul className="pt-work-items">
        {rows.map((r) => (
          <li key={r.title}>
            <span className="pt-wrow">
              <span className="pt-wbody">
                <b className="pt-title">{r.title}</b>
                <span className="pt-meta">{r.meta}</span>
                <Steps steps={r.steps} at={r.at} />
              </span>
              <span className="pt-wside">
                <span className="pt-wstatus">{r.steps[r.at]}</span>
                <span className="lnk pt-small">Open →</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function YourWork() {
  return (
    <section className="pt-work">
      <h2 className="pt-h2">Your work</h2>
      <WorkGroup
        name="Property shoots"
        rows={[
          {
            title: "2 Bed apartment, Marina Gate 1",
            meta: "MW-1418 · Thu 9 Oct · Property shoot",
            steps: SHOOT,
            at: 3,
          },
          {
            title: "Villa 14, Arabian Ranches 2",
            meta: "MW-1421 · Sat 11 Oct · Property shoot",
            steps: SHOOT,
            at: 1,
          },
        ]}
      />
      <WorkGroup
        name="Editing"
        rows={[
          {
            title: "Willow Creek: October listings",
            meta: "MW-1420 · 7 Oct · HDR photos",
            steps: EDIT,
            at: 2,
          },
        ]}
      />
    </section>
  );
}

/* ---------------- Book media and the shoot booking ---------------- */

/** "Book media": Shoot and Editing, each with its icon (components/portal/StartRequests). */
const TILES = [
  ["shoots", "Shoot", "Property, reels or a long-form walkthrough"],
  ["scissors", "Editing", "Send us your photos or footage"],
] as const;

function BookMedia() {
  return (
    <Portal
      modal={
        <Modal title="Book media">
          <div className="pt-form">
            <b style={{ fontSize: 18 }}>What do you need?</b>
            <div className="pt-pick">
              {TILES.map(([icon, t, hint]) => (
                <span key={t} className="pt-pick-tile">
                  <span className="pt-pick-ic" aria-hidden="true">
                    <Icon name={icon} size={22} />
                  </span>
                  <span className="pt-pick-txt">
                    <b>{t}</b>
                    <small>{hint}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

/** The wizard rail: done = check, current = outlined, next = muted (BookingModal). */
function BookSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="pt-wiz" aria-label="Steps">
      {["Shoot type", "When and where", "Summary"].map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "next";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="pt-wiz-dot" aria-hidden="true">
              {state === "done" ? <Icon name="check" size={14} /> : n}
            </span>
            <span className="pt-wiz-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The footer: the summary bar on the left, Back / Next on the right (BookingModal). */
function BookFoot({ next = "Next", summary }: { next?: string; summary?: string }) {
  return (
    <>
      {summary && (
        <div className="pt-sumbar">
          <div className="pt-sumbar-toggle">
            <span className="pt-sumbar-k">Summary</span>
            <span className="pt-sumbar-v">
              {summary}
              <span className="pt-sum-chev" aria-hidden="true" />
            </span>
          </div>
        </div>
      )}
      <span className="btn btn-g btn-s">Back</span>
      <span className="btn btn-p btn-s">{next}</span>
    </>
  );
}

function ShootType() {
  return (
    <Field label="Type of shoot">
      <div className="pt-choice">
        {(["property", "reels", "long_form"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={k === "property"}>
            {SERVICE_LABEL[k]}
            <small>{SERVICE_HINT[k]}</small>
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Step 1: the portal's own property builder (type, size, services). */
function BookProperty({ pricing }: { pricing?: PropertyPricing }) {
  return (
    <Portal
      modal={
        <Modal title="Book a shoot" footer={<BookFoot summary="2 items" />}>
          <div className="pt-form">
            <BookSteps step={1} />
            {pricing ? <RealOptions pricing={pricing} /> : <ShootType />}
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

/** Photography and a short-form video picked. */
function RealOptions({ pricing }: { pricing: PropertyPricing }) {
  const [p, dispatch] = useReducer(
    (s: BookingProperty, a: Action) =>
      reducer(pricing)({ properties: [s], nextId: 2 }, a).properties[0],
    blankProperty(1, pricing, "", ""),
    (s) => ({ ...s, video: true, short: true }),
  );
  return (
    <div className="pt-book-prop">
      <PropertyOptions p={p} pricing={pricing} dispatch={dispatch} />
    </div>
  );
}

function BookWhere() {
  return (
    <Portal
      modal={
        <Modal title="Book a shoot" footer={<BookFoot summary="2 items" />}>
          <div className="pt-form">
            <BookSteps step={2} />
            <div className="pt-grid2">
              <Field label="Date">
                <span className="dsh-in">Thu, 16 Oct 2026</span>
              </Field>
              <Field label="Time">
                <div className="pt-seg pt-seg-line">
                  <button type="button" aria-pressed>
                    Morning
                  </button>
                  <button type="button" aria-pressed={false}>
                    Afternoon
                  </button>
                </div>
              </Field>
            </div>
            <div className="pt-field">
              <span className="pt-field-label">
                Location <span className="pt-req">*</span>
              </span>
              <div className="dsh-map">
                <span className="dsh-pin">
                  <Icon name="pin" size={30} />
                </span>
              </div>
            </div>
            <div className="pt-grid2">
              <Field label="Building" optional>
                <span className="dsh-in">Marina Gate 1</span>
              </Field>
              <Field label="Community" optional>
                <span className="dsh-in">Dubai Marina</span>
              </Field>
            </div>
            <Field label="Address">
              <span className="dsh-in">Marina Gate 1, Al Marsa St, Dubai Marina, Dubai</span>
            </Field>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

/* ---------------- the shoot page ---------------- */

function ShootHead({ status, at }: { status: string; at: number }) {
  return (
    <section className="pt-card">
      <div className="pt-row">
        <span className="pt-eb">MW-1424 · Thu 16 Oct · Morning</span>
        <span className="pt-badge">{status}</span>
      </div>
      <b className="pt-title" style={{ fontSize: 20 }}>
        2 Bed apartment, Marina Gate 1
      </b>
      <Steps steps={SHOOT} at={at} />
    </section>
  );
}

/** The thank-you screen after Confirm (BookingModal `done`). */
function Confirmed() {
  return (
    <Portal
      modal={
        <Modal
          title="Book a shoot"
          footer={
            <>
              <span className="btn btn-g btn-s">Done</span>
              <span className="btn btn-p btn-s">View in Shoots</span>
            </>
          }
        >
          <div className="pt-done">
            <span className="pt-done-ic" aria-hidden="true">
              <Icon name="check" size={28} />
            </span>
            <b className="pt-done-h">Thanks — your booking request is in</b>
            <p className="pt-done-p">We’ll confirm your slot shortly by email.</p>
            <ul className="pt-summary pt-done-card">
              <li>
                <span>Booking ID</span>
                <b className="pt-mono">MW-1424</b>
              </li>
              <li>
                <span>Shoot type</span>
                <b>Property</b>
              </li>
              <li>
                <span>Property and services</span>
                <b>2 Bed apartment · Photography, short-form video</b>
              </li>
              <li>
                <span>Date and slot</span>
                <b>Thu, 16 Oct · Morning</b>
              </li>
              <li>
                <span>Location</span>
                <b>Marina Gate 1, Dubai Marina · Apt 2304</b>
              </li>
            </ul>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

const PHOTOS = ["interior", "kitchen", "bath", "villa", "dusk", "aerial"];

/** Delivery cards: Photos with Download all, Reels, the 360 tour. */
function Deliveries() {
  return (
    <Portal tab="Shoots">
      <ShootHead status="Delivered" at={4} />
      <section className="pt-card">
        <div className="pt-row">
          <h2 className="pt-h2">Photos (42)</h2>
          <span className="btn btn-g btn-s">
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <ul className="pt-thumbs dsh-thumbs">
          {PHOTOS.map((t, i) => (
            <li key={t}>
              <Ph i={i} ph={t} />
              <div className="pt-thumb-foot">
                <span className="pt-small">Photo {i + 1}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="dsh-2">
        <section className="pt-card">
          <div className="pt-row">
            <h2 className="pt-h2">Reels (2)</h2>
            <span className="btn btn-g btn-s">
              <Icon name="download" size={16} /> Download
            </span>
          </div>
          <div className="dsh-reels">
            <Ph i={6} ph="interior" />
            <Ph i={7} ph="kitchen" />
          </div>
        </section>
        <section className="pt-card">
          <div className="pt-row">
            <h2 className="pt-h2">360 tour</h2>
            <span className="btn btn-g btn-s">Open tour</span>
          </div>
          <Ph i={8} ph="aerial" className="dsh-169" />
        </section>
      </div>
    </Portal>
  );
}

/* ---------------- the public listing page ---------------- */

const AMENITIES = ["Marina view", "Pool and gym", "Covered parking"];

function Share() {
  return (
    <div className="dsh-lp" data-tone="light">
      <div className="dsh-lp-in">
        <div className="dsh-lp-mosaic">
          {["interior", "kitchen", "bath", "villa", "aerial"].map((t, i) => (
            <Ph key={t} i={i} ph={t} />
          ))}
        </div>
        <div className="dsh-lp-cols">
          <div className="dsh-lp-main">
            <b className="dsh-lp-price">AED 2,450,000</b>
            <b className="dsh-lp-h1">2 Bed apartment, Marina Gate 1</b>
            <span className="dsh-lp-facts">
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
                <Icon name="tour" size={16} /> 360 tour
              </span>
            </span>
            <p className="dsh-lp-desc">
              A bright, high-floor two bedroom with full-height windows and an open kitchen. Both
              bedrooms face the water, and the balcony looks straight down the Marina. Vacant and
              ready to view this week.
            </p>
            <span className="dsh-lp-chips">
              {AMENITIES.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </span>
          </div>
          <div className="dsh-lp-agent">
            <b>Sara Mathew</b>
            <span className="pt-meta">Pinnacle Real Estate</span>
            <span className="btn btn-p btn-s">
              <Icon name="whatsapp" size={16} /> WhatsApp
            </span>
            <span className="btn btn-g btn-s">
              <Icon name="phone" size={16} /> Call
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Post-production: Edit my files ---------------- */

function EditRequest() {
  return (
    <Portal
      tab="Editing"
      modal={
        <Modal title="Edit my files" footer={<BookFoot next="Send files" />}>
          <div className="pt-form">
            <Field label="Type of edit">
              <div className="pt-chips">
                {EDIT_KINDS.map(([k, l]) => (
                  <span key={k} className="pt-pill" aria-pressed={k === "hdr_photos"}>
                    {l}
                  </span>
                ))}
              </div>
            </Field>
            <div className="pt-grid2">
              <Field label="Title">
                <span className="dsh-in">Willow Creek: October listings</span>
              </Field>
              <Field label="Quantity">
                <span className="dsh-in">120</span>
              </Field>
            </div>
            <Field label="Raw files">
              <span className="dsh-in">drive.google.com/drive/folders/willow-creek-oct</span>
              <span className="dsh-in">wetransfer.com/downloads/3f9a2c</span>
            </Field>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

function ProjectHead({
  eb,
  title,
  status,
  steps,
  at,
}: {
  eb: string;
  title: string;
  status: string;
  steps: string[];
  at: number;
}) {
  return (
    <section className="pt-card">
      <div className="pt-row">
        <span className="pt-eb">{eb}</span>
        <span className="pt-badge">{status}</span>
      </div>
      <b className="pt-title" style={{ fontSize: 20 }}>
        {title}
      </b>
      <Steps steps={steps} at={at} />
    </section>
  );
}

const EDIT_HEAD = {
  eb: "MW-1420 · HDR photos · 120 items",
  title: "Willow Creek: October listings",
};

function EditStatus() {
  return (
    <Portal tab="Editing">
      <ProjectHead {...EDIT_HEAD} status="In editing" steps={EDIT} at={2} />
      <section className="pt-card">
        <ul className="pt-summary">
          <li>
            <span>Files</span>
            <b>120 raw photos received</b>
          </li>
          <li>
            <span>Editor</span>
            <b>Our in-house team</b>
          </li>
          <li>
            <span>Due</span>
            <b>Thu, 16 Oct</b>
          </li>
        </ul>
        <span className="pt-meta">We email you the moment the files are delivered.</span>
      </section>
    </Portal>
  );
}

function EditDelivered() {
  return (
    <Portal tab="Editing">
      <ProjectHead {...EDIT_HEAD} status="Delivered" steps={EDIT} at={3} />
      <section className="pt-card">
        <div className="pt-row">
          <h2 className="pt-h2">Delivery 1 · 120 photos</h2>
          <span className="btn btn-g btn-s">
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <ul className="pt-thumbs dsh-thumbs">
          {PHOTOS.map((t, i) => (
            <li key={t}>
              <Ph i={i} ph={t} />
              <div className="pt-thumb-foot">
                <span className="pt-small">IMG_33{40 + i}.jpg</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="pt-btns">
          <span className="btn btn-g btn-s">Request revision</span>
        </div>
      </section>
    </Portal>
  );
}

/* ---------------- AI avatars ---------------- */

function AvatarRequest() {
  const stops = AVATAR_FORMATS.short.stops;
  return (
    <Portal
      tab="Avatars"
      modal={
        <Modal title="AI avatar video" footer={<BookFoot next="Send brief" />}>
          <div className="pt-form">
            <Field label="Format">
              <div className="pt-seg pt-seg-stack">
                <button type="button" aria-pressed>
                  {AVATAR_FORMATS.short.label}
                </button>
                <button type="button" aria-pressed={false}>
                  {AVATAR_FORMATS.long.label}
                </button>
              </div>
            </Field>
            <Field label="Length: 60s" optional>
              <span className="dsh-slider" style={{ ["--v" as string]: 1 / (stops.length - 1) }}>
                <i />
              </span>
              <span className="pt-slider-ticks">
                {stops.map((s) => (
                  <span key={s}>{s}s</span>
                ))}
              </span>
            </Field>
            <Field label="Script" optional>
              <div className="pt-seg">
                <button type="button" aria-pressed>
                  Milkywayy writes it
                </button>
                <button type="button" aria-pressed={false}>
                  I’ll send it
                </button>
              </div>
            </Field>
            <Field label="Brief" optional>
              <span className="dsh-in dsh-in-tall">
                Launch video for JVC Heights: 1–3 bed homes, rooftop pool, five minutes to Al Khail
                Road. Friendly, confident, end on “Book a viewing”.
              </span>
            </Field>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

const AVATAR_HEAD = { eb: "MW-1422 · AI avatar · 60 seconds", title: "JVC Heights launch video" };

function AvatarProduction() {
  return (
    <Portal tab="Avatars">
      <ProjectHead {...AVATAR_HEAD} status="In production" steps={AVATAR} at={2} />
      <section className="pt-card">
        <div className="pt-row">
          <span className="pt-eb">Script · v2 · approved</span>
        </div>
        <p style={{ margin: 0 }}>
          Hi, I’m Adam from Milkywayy. JVC Heights is the newest address in Jumeirah Village Circle:
          one to three bedroom homes, a rooftop pool, five minutes to Al Khail Road. Book a viewing
          today.
        </p>
        <span className="pt-meta">In production. Delivered within 48 hours.</span>
      </section>
    </Portal>
  );
}

function AvatarDelivered() {
  return (
    <Portal tab="Avatars">
      <ProjectHead {...AVATAR_HEAD} status="Delivered" steps={AVATAR} at={3} />
      <section className="pt-card dsh-video">
        <span className="dsh-ph ph-adam" />
        <div className="pt-form">
          <h2 className="pt-h2">JVC Heights · 9:16 · 0:58</h2>
          <span className="pt-meta">Captioned and branded, ready to post.</span>
          <div className="pt-btns">
            <span className="btn btn-p btn-s">
              <Icon name="download" size={16} /> Download
            </span>
            <span className="btn btn-g btn-s">Request revision</span>
          </div>
          <span className="pt-meta">2 revision rounds included · 2 left</span>
        </div>
      </section>
    </Portal>
  );
}

function Screen({ kind, pricing }: { kind: ShowcaseScreen; pricing?: PropertyPricing }) {
  switch (kind) {
    case "overview":
      return (
        <Portal>
          <YourWork />
        </Portal>
      );
    case "book-media":
      return <BookMedia />;
    case "book-property":
      return <BookProperty pricing={pricing} />;
    case "book-where":
      return <BookWhere />;
    case "confirmed":
      return <Confirmed />;
    case "deliveries":
      return <Deliveries />;
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
