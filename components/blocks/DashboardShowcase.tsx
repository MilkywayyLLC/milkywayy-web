"use client";

import "@/app/styles/portal.css";
import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from "react";
import { PropertyOptions } from "@/components/booking/PropertyOptions";
import { BrandLogo } from "@/components/layout/Logo";
import { Icon } from "@/components/portal/Icon";
import type { PropertyPricing } from "@/content/types";
import { blankProperty, reducer, type Action, type BookingProperty } from "@/lib/booking";
import { SERVICE_HINT, SERVICE_LABEL } from "@/lib/portal/booking";
import { EDIT_KINDS } from "@/lib/portal/projects";

/**
 * The client dashboard, shown like a SaaS feature section (rebuilt site-refine, 12 Oct 2026):
 * features on the left, a portal window on the right. The window is the real portal markup and
 * classes (portal.css), drawn at a fixed 880px desktop canvas and scaled to fit, with mock data.
 *
 * It cycles on its own (~6s a view) while in view, and never pauses on hover. Clicking a feature
 * holds that view for 8s, then auto-play resumes. A pointer glides to the element each view
 * demonstrates (`data-point`), which then flashes as if tapped. Auto-advance is driven by the
 * progress line's CSS animation (animationend → next), so the global reduced-motion rule stops it.
 */
export type ShowcaseScreen =
  // the current portal
  | "overview"
  | "book-media"
  | "book-property"
  | "book-where"
  | "requested"
  | "confirmed"
  | "deliveries"
  | "share"
  | "edit-request"
  | "edit-status"
  | "edit-delivered"
  // AI avatars page
  | "script"
  | "track-avatar"
  | "files-video"
  | "revision";

export type ShowcaseFeature = {
  icon: string;
  title: string;
  text: string;
  screen: ShowcaseScreen;
};

const CYCLE_MS = 6000;
const HOLD_MS = 8000;
const CANVAS_W = 880;
const CANVAS_H = 560;

export function DashboardShowcase({
  features,
  label = "Client dashboard features",
  pricing,
}: {
  features: ShowcaseFeature[];
  label?: string;
  /** The property price list, so "property options" draws the real builder. */
  pricing?: PropertyPricing;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [held, setHeld] = useState(false); // a click: this view stays 8s
  const [inView, setInView] = useState(false);
  const [k, setK] = useState(0.66);
  const [ptr, setPtr] = useState<{ x: number; y: number } | null>(null);

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

  // The pointer follows the active view's [data-point] (views with steps move it along).
  useEffect(() => {
    const el = stage.current;
    if (!el || !inView) return;
    const find = () => {
      const t = el.querySelector<HTMLElement>(".dsh-screen.on [data-point]");
      if (!t) return setPtr(null);
      const a = el.getBoundingClientRect();
      const b = t.getBoundingClientRect();
      setPtr({ x: b.left - a.left + b.width * 0.62, y: b.top - a.top + b.height * 0.62 });
    };
    const first = setTimeout(find, 350);
    const iv = setInterval(find, 300);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [inView, active, k]);

  const select = (i: number, byUser: boolean) => {
    setActive(i);
    setHeld(byUser);
    setCycle((c) => c + 1); // restart the progress line
  };
  const next = () => select((active + 1) % features.length, false);

  return (
    <div ref={root} className="dsh">
      <div className="dsh-list" role="tablist" aria-label={label} aria-orientation="vertical">
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
              onClick={() => select(i, true)}
              onKeyDown={(e) => {
                const d = ["ArrowDown", "ArrowRight"].includes(e.key)
                  ? 1
                  : ["ArrowUp", "ArrowLeft"].includes(e.key)
                    ? -1
                    : 0;
                if (!d) return;
                e.preventDefault();
                const n = (i + d + features.length) % features.length;
                select(n, true);
                document.getElementById(`${uid}-t${n}`)?.focus();
              }}
            >
              <span className="dsh-ic" aria-hidden="true">
                <Icon name={f.icon} />
              </span>
              <span className="dsh-txt">
                <b>{f.title}</b>
                <span className="dsh-desc">{f.text}</span>
              </span>
              {on && (
                <span className="dsh-prog" aria-hidden="true">
                  <i
                    key={cycle}
                    style={{
                      animationDuration: `${held ? HOLD_MS : CYCLE_MS}ms`,
                      animationPlayState: inView ? "running" : "paused",
                    }}
                    onAnimationEnd={next}
                  />
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
          className="dsh-stage"
          aria-hidden="true"
          style={{ ["--k" as string]: k, height: CANVAS_H * k }}
        >
          <div className="dsh-canvas" inert style={{ width: CANVAS_W, height: CANVAS_H }}>
            {features.map((f, i) => (
              <div key={f.title} className={i === active ? "dsh-screen on" : "dsh-screen"}>
                <Screen kind={f.screen} live={i === active && inView} pricing={pricing} />
              </div>
            ))}
          </div>
          {ptr && (
            <span
              className="dsh-ptr"
              style={{ transform: `translate(${ptr.x}px, ${ptr.y}px)` }}
              aria-hidden="true"
            >
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path
                  d="M4 2l15 9-6.5 1.6L16 20l-3 1.4-3.6-7.4L4 18z"
                  fill="#111110"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-field">
      <span className="pt-field-label">
        {label} <span className="pt-req">*</span>
      </span>
      {children}
    </div>
  );
}

/* ---------------- Home → Your work ---------------- */

const SHOOT = ["Requested", "Confirmed", "Shot", "Editing", "Delivered", "Completed"];
const EDIT = ["Submitted", "Files received", "In editing", "Delivered", "Completed"];

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

type WorkRow = { title: string; meta: string; steps: string[]; at: number; point?: boolean };

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
                <span className="lnk pt-small" data-point={r.point ? "" : undefined}>
                  Open →
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function YourWork({ point, editAt = 2 }: { point?: "shoot" | "edit"; editAt?: number }) {
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
            point: point === "shoot",
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
            at: editAt,
            point: point === "edit",
          },
        ]}
      />
    </section>
  );
}

/* ---------------- Book media and the shoot booking ---------------- */

const TILES = [
  ["Shoot", "Property, reels or a long-form walkthrough"],
  ["Editing", "Send us your photos or footage"],
  ["AI avatar video", "A video with an AI presenter"],
] as const;

function BookMedia({ point = "Shoot" }: { point?: string }) {
  return (
    <Portal
      modal={
        <Modal title="Book media">
          <div className="pt-form">
            <b style={{ fontSize: 18 }}>What do you need?</b>
            <div className="pt-tiles pt-tiles-lg">
              {TILES.map(([t, hint]) => (
                <span key={t} className="pt-tile" data-point={t === point ? "" : undefined}>
                  <b>{t}</b>
                  <small>{hint}</small>
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

function BookSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="pt-book-steps">
      <li aria-current={step === 1 ? "step" : undefined}>1 · Shoot type</li>
      <li aria-current={step === 2 ? "step" : undefined}>2 · When and where</li>
      <li aria-current={step === 3 ? "step" : undefined}>3 · Summary</li>
    </ol>
  );
}

function BookFoot({ next = "Next" }: { next?: string }) {
  return (
    <>
      <span className="btn btn-g btn-s">Back</span>
      <span className="btn btn-p btn-s" data-point="">
        {next}
      </span>
    </>
  );
}

function BookProperty({ pricing }: { pricing?: PropertyPricing }) {
  return (
    <Portal
      modal={
        <Modal title="Book a shoot" footer={<BookFoot />}>
          <div className="pt-form">
            <BookSteps step={1} />
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
            {pricing && <RealOptions pricing={pricing} />}
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

/** The portal's own property builder, with photography and a short-form video picked. */
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
        <Modal title="Book a shoot" footer={<BookFoot />}>
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
            <div className="pt-places pt-field">
              <span className="pt-field-label">
                Location <span className="pt-req">*</span>
              </span>
              <span className="dsh-in">Marina Gate 1, Dubai Marina</span>
              <div className="pt-map dsh-map">
                <span className="dsh-pin" data-point="">
                  <Icon name="pin" size={28} />
                </span>
              </div>
              <span className="pt-meta">Tap the map or drag the pin to the exact entrance.</span>
            </div>
            <div className="pt-grid2">
              <Field label="Unit">
                <span className="dsh-in">Apt 2304</span>
              </Field>
              <Field label="Access">
                <span className="dsh-in">Keys with the concierge</span>
              </Field>
            </div>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

function Requested() {
  return (
    <Portal
      modal={
        <Modal title="Book a shoot">
          <div className="pt-form">
            <span className="pt-eb">MW-1424 · Requested</span>
            <b style={{ fontSize: 20 }}>Booking request sent</b>
            <p style={{ margin: 0 }}>
              We’ll confirm the date and time, usually within the hour during working hours. You’ll
              get an email when it’s confirmed.
            </p>
            <div className="pt-btns">
              <span className="btn btn-p btn-s" data-point="">
                View in Shoots
              </span>
              <span className="btn btn-g btn-s">Close</span>
            </div>
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

function Confirmed() {
  return (
    <Portal tab="Shoots">
      <ShootHead status="Confirmed" at={1} />
      <section className="pt-card">
        <ul className="pt-summary">
          <li>
            <span>What</span>
            <b>Property shoot · Photography, short-form video</b>
          </li>
          <li>
            <span>When</span>
            <b data-point="">Thu, 16 Oct · Morning, 9:30 am</b>
          </li>
          <li>
            <span>Where</span>
            <b>Marina Gate 1, Dubai Marina · Apt 2304</b>
          </li>
        </ul>
        <span className="pt-meta">Confirmed. Photos in 24 hours, videos in 48–72 hours.</span>
      </section>
    </Portal>
  );
}

const PHOTOS = ["interior", "kitchen", "bath", "villa", "dusk", "aerial"];

function Deliveries({ revision }: { revision?: boolean }) {
  return (
    <Portal tab="Shoots">
      <ShootHead status="Delivered" at={4} />
      <section className="pt-card">
        <div className="pt-row">
          <h2 className="pt-h2">Photos (42)</h2>
          <span className="btn btn-g btn-s" data-point={revision ? undefined : ""}>
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <ul className="pt-thumbs dsh-thumbs">
          {PHOTOS.map((t, i) => (
            <li key={t}>
              <span className={`dsh-ph ph-${t}`} />
              <div className="pt-thumb-foot">
                <span className="pt-small">Photo {i + 1}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="dsh-3">
        <section className="pt-card">
          <h2 className="pt-h2">Vertical videos (2)</h2>
          <div className="dsh-reels">
            <span className="dsh-ph ph-dusk" />
            <span className="dsh-ph ph-interior" />
          </div>
          <span className="pt-link-btn" data-point={revision ? "" : undefined}>
            Request revision
          </span>
        </section>
        <section className="pt-card">
          <h2 className="pt-h2">Long-form video</h2>
          <span className="dsh-ph ph-villa dsh-169" />
          <span className="btn btn-g btn-s">Download</span>
        </section>
        <section className="pt-card">
          <h2 className="pt-h2">360 tour</h2>
          <span className="dsh-ph ph-aerial dsh-169" />
          <span className="btn btn-g btn-s">Open tour</span>
        </section>
      </div>
    </Portal>
  );
}

/* ---------------- listing builder → public listing page ---------------- */

/** Builder for ~2.8s, then the published page. */
function useStep(live: boolean, at = 2800) {
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = [setTimeout(() => setStep(0), 0), setTimeout(() => setStep(1), at)];
    return () => t.forEach(clearTimeout);
  }, [live, at]);
  return step;
}

function Share({ live }: { live: boolean }) {
  const step = useStep(live);
  if (step === 0)
    return (
      <Portal tab="Listings">
        <section className="pt-card">
          <span className="pt-eb">From the booking · MW-1418</span>
          <h2 className="pt-h2">New listing</h2>
          <div className="pt-grid2">
            <Field label="Title">
              <span className="dsh-in">2 Bed apartment, Marina Gate 1</span>
            </Field>
            <Field label="Price (AED)">
              <span className="dsh-in">2,450,000</span>
            </Field>
          </div>
          <span className="pt-field-label">Photos · 12 of 42 chosen</span>
          <ul className="pt-thumbs dsh-thumbs">
            {PHOTOS.map((t) => (
              <li key={t}>
                <span className={`dsh-ph ph-${t}`} />
              </li>
            ))}
          </ul>
          <div className="pt-btns">
            <span className="btn btn-p btn-s" data-point="">
              Publish listing
            </span>
            <span className="btn btn-g btn-s">Save draft</span>
          </div>
        </section>
      </Portal>
    );
  return (
    <div className="dsh-lp" data-tone="light">
      <div className="dsh-lp-mosaic">
        <span className="dsh-ph ph-interior" />
        <span className="dsh-ph ph-kitchen" />
        <span className="dsh-ph ph-bath" />
        <span className="dsh-ph ph-dusk" />
        <span className="dsh-ph ph-aerial" />
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
        </div>
        <div className="dsh-lp-agent">
          <b>Sara Mathew</b>
          <span className="pt-meta">Pinnacle Real Estate</span>
          <span className="btn btn-p btn-s" data-point="">
            <Icon name="whatsapp" size={16} /> WhatsApp
          </span>
          <span className="btn btn-g btn-s">
            <Icon name="phone" size={16} /> Call
          </span>
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
        <Modal title="Edit my files" footer={<BookFoot next="Send request" />}>
          <div className="pt-form">
            <Field label="Type of edit">
              <div className="pt-chips">
                {EDIT_KINDS.map(([k, l]) => (
                  <span
                    key={k}
                    className="pt-pill"
                    style={{ padding: "4px 14px" }}
                    aria-pressed={k === "hdr_photos"}
                  >
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
              <div className="pt-seg">
                <button type="button" aria-pressed>
                  Paste links
                </button>
                <button type="button" aria-pressed={false}>
                  Upload
                </button>
              </div>
            </Field>
            <span className="dsh-in">drive.google.com/drive/folders/willow-creek-oct</span>
            <span className="dsh-in">wetransfer.com/downloads/3f9a2c</span>
          </div>
        </Modal>
      }
    >
      <YourWork />
    </Portal>
  );
}

function EditStatus({ live }: { live: boolean }) {
  // Files received → In editing while the view shows.
  const step = useStep(live, 1600);
  return (
    <Portal tab="Home">
      <YourWork point="edit" editAt={step === 0 ? 1 : 2} />
    </Portal>
  );
}

function EditDelivered() {
  return (
    <Portal tab="Editing">
      <section className="pt-card">
        <div className="pt-row">
          <span className="pt-eb">MW-1420 · HDR photos · 120 items</span>
          <span className="pt-badge">Delivered</span>
        </div>
        <b className="pt-title" style={{ fontSize: 20 }}>
          Willow Creek: October listings
        </b>
        <Steps steps={EDIT} at={3} />
      </section>
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
              <span className={`dsh-ph ph-${t}`} />
              <div className="pt-thumb-foot">
                <span className="pt-small">IMG_33{40 + i}.jpg</span>
              </div>
            </li>
          ))}
        </ul>
        <span className="pt-link-btn" data-point="">
          Request revision
        </span>
      </section>
    </Portal>
  );
}

/* ---------------- AI avatars ---------------- */

function AvatarScript() {
  return (
    <Portal tab="Avatars">
      <section className="pt-card">
        <div className="pt-row">
          <span className="pt-eb">Script · v1 · about 30 seconds</span>
          <span className="pt-badge">Waiting for your approval</span>
        </div>
        <p style={{ margin: 0 }}>
          Hi, I’m Adam from Milkywayy. JVC Heights is the newest address in Jumeirah Village Circle:
          one to three bedroom homes, a rooftop pool, five minutes to Al Khail Road. Book a viewing
          today.
        </p>
        <span className="pt-meta">Production starts once you approve.</span>
        <div className="pt-btns">
          <span className="btn btn-p btn-s" data-point="">
            Approve script
          </span>
          <span className="btn btn-g btn-s">Ask for changes</span>
        </div>
      </section>
    </Portal>
  );
}

const AVATAR = ["Brief received", "Script ready", "In production", "Delivered", "Completed"];

function AvatarTrack() {
  return (
    <Portal tab="Avatars">
      <section className="pt-work">
        <h2 className="pt-h2">Your work</h2>
        <WorkGroup
          name="AI avatars"
          rows={[
            {
              title: "JVC Heights launch video",
              meta: "MW-1422 · 8 Oct · Up to 60 seconds",
              steps: AVATAR,
              at: 2,
              point: true,
            },
            {
              title: "Weekly market update",
              meta: "MW-1425 · 10 Oct · Up to 30 seconds",
              steps: AVATAR,
              at: 1,
            },
          ]}
        />
      </section>
    </Portal>
  );
}

function AvatarFiles() {
  return (
    <Portal tab="Avatars">
      <section className="pt-card">
        <div className="pt-row">
          <h2 className="pt-h2">Videos (3)</h2>
          <span className="btn btn-g btn-s" data-point="">
            <Icon name="download" size={16} /> Download all
          </span>
        </div>
        <div className="dsh-reels dsh-reels-3">
          <span className="dsh-ph ph-adam" />
          <span className="dsh-ph ph-avatar-clinic" />
          <span className="dsh-ph ph-avatar-finance" />
        </div>
      </section>
    </Portal>
  );
}

function AvatarRevision() {
  return (
    <Portal tab="Avatars">
      <section className="pt-card pt-form">
        <b className="pt-title">Revision 1 of 2 · JVC Heights launch video</b>
        <div className="pt-field">
          <span className="pt-field-label">
            What should change? <span className="pt-req">*</span>
          </span>
          <span className="dsh-in dsh-in-tall">At 0:18, say “five minutes to Al Khail Road”.</span>
        </div>
        <div className="pt-btns">
          <span className="btn btn-p btn-s" data-point="">
            Send revision request
          </span>
          <span className="btn btn-g btn-s">Cancel</span>
        </div>
      </section>
    </Portal>
  );
}

function Screen({
  kind,
  live,
  pricing,
}: {
  kind: ShowcaseScreen;
  live: boolean;
  pricing?: PropertyPricing;
}) {
  switch (kind) {
    case "overview":
      return (
        <Portal>
          <YourWork point="shoot" />
        </Portal>
      );
    case "book-media":
      return <BookMedia />;
    case "book-property":
      return <BookProperty pricing={pricing} />;
    case "book-where":
      return <BookWhere />;
    case "requested":
      return <Requested />;
    case "confirmed":
      return <Confirmed />;
    case "deliveries":
      return <Deliveries />;
    case "share":
      return <Share live={live} />;
    case "edit-request":
      return <EditRequest />;
    case "edit-status":
      return <EditStatus live={live} />;
    case "edit-delivered":
      return <EditDelivered />;
    case "script":
      return <AvatarScript />;
    case "track-avatar":
      return <AvatarTrack />;
    case "files-video":
      return <AvatarFiles />;
    case "revision":
      return <AvatarRevision />;
  }
}
