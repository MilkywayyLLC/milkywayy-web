"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * The client dashboard, shown like a SaaS feature section (site-refine, 3 Oct 2026): four features
 * on the left, a portal window on the right. The screens are real UI mirroring the portal (no
 * screenshots). The active feature advances every ~5s while the section is in view, with a thin
 * progress line; hover or focus pauses it, a click or tap selects. Screens crossfade with an 8px
 * slide. Reduced motion: no auto-advance, no slides, the screens' end state.
 *
 * Auto-advance is driven by the progress line's CSS animation (animationend → next), so pausing is
 * just animation-play-state, and the global reduced-motion rule (animation: none) stops it.
 */
export type ShowcaseScreen =
  | "track-shoot"
  | "track-edit"
  | "track-avatar"
  | "files"
  | "files-video"
  | "revision"
  | "invoices"
  | "script"
  | "upload";

export type ShowcaseFeature = {
  icon: IconName;
  title: string;
  text: string;
  screen: ShowcaseScreen;
};

export function DashboardShowcase({
  features,
  label = "Client dashboard features",
  account = "Marina Realty",
}: {
  features: ShowcaseFeature[];
  label?: string;
  account?: string;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false); // hover or focus inside

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const select = (i: number) => {
    setActive(i);
    setCycle((c) => c + 1); // restart the progress line
  };
  const next = () => select((active + 1) % features.length);
  const running = inView && !held;

  return (
    <div
      ref={root}
      className="dsh"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
    >
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
              onClick={() => select(i)}
              onKeyDown={(e) => {
                const d = ["ArrowDown", "ArrowRight"].includes(e.key)
                  ? 1
                  : ["ArrowUp", "ArrowLeft"].includes(e.key)
                    ? -1
                    : 0;
                if (!d) return;
                e.preventDefault();
                const n = (i + d + features.length) % features.length;
                select(n);
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
                    style={{ animationPlayState: running ? "running" : "paused" }}
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
          <span>milkywayy.com/portal</span>
        </div>
        <div className="dsh-app">
          <div className="dsh-top" aria-hidden="true">
            <span className="dsh-mark">MW</span>
            <span className="dsh-acc">{account}</span>
          </div>
          <div className="dsh-screens">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={i === active ? "dsh-screen on" : "dsh-screen"}
                aria-hidden={i !== active}
                inert={i !== active}
              >
                <Screen kind={f.screen} live={i === active && inView} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- screens: the portal's own words and layout ---------------- */

const PIPE = {
  "track-shoot": ["Requested", "Confirmed", "Shot", "Editing", "Delivered", "Completed"],
  "track-edit": ["Submitted", "Files received", "In editing", "Delivered", "Completed"],
  "track-avatar": ["Brief received", "Script ready", "In production", "Delivered", "Completed"],
} as const;

/** Steps 0 → 1 → 2 while the screen is showing; the end state with reduced motion. */
function useSteps(live: boolean) {
  const [step, setStep] = useState(2);
  useEffect(() => {
    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = [
      setTimeout(() => setStep(0), 0),
      setTimeout(() => setStep(1), 1100),
      setTimeout(() => setStep(2), 2300),
    ];
    return () => t.forEach(clearTimeout);
  }, [live]);
  return step;
}

function Stepper({ steps, now }: { steps: readonly string[]; now: number }) {
  return (
    <div className="dsh-steps">
      <div className="dsh-seg">
        {steps.map((s, i) => (
          <i key={s} className={i < now ? "is-done" : i === now ? "is-now" : undefined} />
        ))}
      </div>
      <span className="dsh-mono">
        Step {now + 1} of {steps.length}: <b>{steps[now]}</b>
        {steps[now + 1] ? ` · next: ${steps[now + 1]}` : ""}
      </span>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `dsh-card ${className}` : "dsh-card"}>{children}</div>;
}

function Track({ kind, live }: { kind: keyof typeof PIPE; live: boolean }) {
  const step = useSteps(live);
  const steps = PIPE[kind];
  const head = {
    "track-shoot": ["MW-1418 · Thu 9 Oct · Morning", "2 Bed apartment, Marina Gate 1"],
    "track-edit": ["MW-1420 · HDR photos · 120 items", "Willow Creek: October listings"],
    "track-avatar": ["MW-1422 · Up to 60 seconds", "JVC Heights launch video"],
  }[kind];
  const log = {
    "track-shoot": [
      "Requested on milkywayy.com",
      "Confirmed: Thu 9 Oct, morning",
      "Shot · editing starts",
    ],
    "track-edit": ["Submitted by you", "Files received", "In editing"],
    "track-avatar": [
      "Brief received",
      "Script v1 ready for approval",
      "Script approved · in production",
    ],
  }[kind];
  return (
    <>
      <span className="dsh-eb">
        {kind === "track-shoot" ? "Shoots" : kind === "track-edit" ? "Editing" : "Avatars"}
      </span>
      <Card>
        <div className="dsh-row">
          <span className="dsh-mono">{head[0]}</span>
          <span className="dsh-badge">{steps[step]}</span>
        </div>
        <b className="dsh-title">{head[1]}</b>
        <Stepper steps={steps} now={step} />
      </Card>
      <ul className="dsh-log">
        {log.map((l, i) => (
          <li key={l} className={i <= step ? "on" : undefined}>
            {l}
          </li>
        ))}
      </ul>
    </>
  );
}

function Files({ video }: { video?: boolean }) {
  const tiles = video
    ? ["adam", "avatar-clinic", "avatar-finance"]
    : ["interior", "kitchen", "bath", "villa", "dusk", "aerial"];
  return (
    <>
      <div className="dsh-row">
        <span className="dsh-eb">
          {video ? "Delivery 1 · 3 videos · 9:16" : "Delivery 1 · 42 photos · reel"}
        </span>
        <span className="dsh-btn">Download all</span>
      </div>
      <div className={video ? "dsh-grid vid" : "dsh-grid"}>
        {tiles.map((t) => (
          <span key={t} className={`dsh-ph ph-${t}`} />
        ))}
      </div>
      <div className="dsh-row">
        <span className="dsh-mono">Kept 12 months after completion</span>
        <span className="dsh-btn ghost">Approve</span>
      </div>
    </>
  );
}

function Revision() {
  return (
    <>
      <span className="dsh-eb">Delivery 1 · 2 Bed apartment, Marina Gate 1</span>
      <Card>
        <b className="dsh-title">Revision 1 of 2</b>
        <span className="dsh-label">What should change?</span>
        <div className="dsh-input">
          Photo 12: brighten the kitchen. Reel at 0:18: swap the music.
          <i className="dsh-caret" />
        </div>
        <span className="dsh-mono">Point to photo numbers or video timecodes.</span>
        <span className="dsh-btn">Send revision request</span>
      </Card>
      <span className="dsh-note">Revision 1 of 2 is with us. We’ll email you when it’s ready.</span>
    </>
  );
}

function Invoices() {
  const rows = [
    ["INV-2026-031", "Oct · 3 shoots", "AED 3,200", "Due 15 Oct"],
    ["INV-2026-024", "Sep · 2 shoots + reels", "AED 2,650", "Paid"],
    ["INV-2026-017", "Aug · 1 shoot", "AED 1,050", "Paid"],
  ];
  return (
    <>
      <div className="dsh-row">
        <span className="dsh-eb">Billing</span>
        <span className="dsh-mono">1 due · pay by card or bank transfer</span>
      </div>
      <div className="dsh-list-ui">
        {rows.map((r) => (
          <div key={r[0]} className="dsh-inv">
            <span>
              <b>{r[0]}</b>
              <span className="dsh-mono">{r[1]}</span>
            </span>
            <span className="dsh-amt">{r[2]}</span>
            <span className={r[3] === "Paid" ? "dsh-badge ok" : "dsh-badge due"}>{r[3]}</span>
            <span className="dsh-btn ghost sm">PDF</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Script() {
  return (
    <>
      <div className="dsh-row">
        <span className="dsh-eb">Script · v1 · about 30 seconds</span>
        <span className="dsh-badge">Waiting for your approval</span>
      </div>
      <div className="dsh-script">
        Hi, I’m Adam from Milkywayy. JVC Heights is the newest address in Jumeirah Village Circle:
        one to three bedroom homes, a rooftop pool, five minutes to Al Khail Road. Book a viewing
        today.
      </div>
      <span className="dsh-mono">Production starts once you approve.</span>
      <div className="dsh-row start">
        <span className="dsh-btn">Approve script</span>
        <span className="dsh-btn ghost">Ask for changes</span>
      </div>
    </>
  );
}

function Upload({ live }: { live: boolean }) {
  const files = [
    ["IMG_3340.CR3", "42 MB", 100],
    ["IMG_3341.CR3", "39 MB", 100],
    ["IMG_3342.CR3", "44 MB", 64],
    ["Drone_0912.MP4", "1.2 GB", 18],
  ] as const;
  return (
    <>
      <span className="dsh-eb">New batch</span>
      <Card>
        <b className="dsh-title">Willow Creek: October listings</b>
        <div className="dsh-chips">
          <span className="on">HDR photos</span>
          <span>Short-form</span>
          <span>Long-form</span>
        </div>
        <div className="dsh-up">
          {files.map(([n, size, pct]) => (
            <div key={n}>
              <span className="dsh-mono">
                {n} · {size} · {pct === 100 ? "Done" : `${pct}%`}
              </span>
              <span className="dsh-bar-p">
                <i className={live ? "grow" : undefined} style={{ width: `${pct}%` }} />
              </span>
            </div>
          ))}
        </div>
        <span className="dsh-mono">Up to 5 GB per file · resumes if the connection drops</span>
      </Card>
    </>
  );
}

function Screen({ kind, live }: { kind: ShowcaseScreen; live: boolean }) {
  switch (kind) {
    case "track-shoot":
    case "track-edit":
    case "track-avatar":
      return <Track kind={kind} live={live} />;
    case "files":
      return <Files />;
    case "files-video":
      return <Files video />;
    case "revision":
      return <Revision />;
    case "invoices":
      return <Invoices />;
    case "script":
      return <Script />;
    case "upload":
      return <Upload live={live} />;
  }
}

/* ---------------- icons (1.5px line, 20px) ---------------- */

export type IconName = "track" | "download" | "revision" | "invoice" | "script" | "upload";

function Icon({ name }: { name: IconName }) {
  const p = {
    track: "M3 12h4l3-8 4 16 3-8h4",
    download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
    revision: "M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4",
    invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6m-6 4h3",
    script: "M5 4h10l4 4v12H5V4zm9 0v5h5M8 13h8M8 17h5",
    upload: "M12 20V9m0 0-4 4m4-4 4 4M5 4h14",
  }[name];
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={p} />
    </svg>
  );
}
