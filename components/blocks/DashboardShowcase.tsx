"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/portal/Icon";
import type { ShowcaseRates } from "@/lib/showcase";
import { CANVAS, MAX_SCALE, type Layout } from "./showcase/canvas";

/**
 * The client dashboard, shown like a SaaS feature section: feature tabs on the left, and the
 * selected tab shows ONE still frame of the real portal (mock data). No pointer, no fake clicks,
 * no motion inside a frame: frames only crossfade (200ms).
 *
 * Auto-advances every 5s while in view and never pauses on hover; clicking a tab selects it and
 * holds it for 10s before auto-advance resumes.
 *
 * The frames (owner, 20 Oct 2026) match the portal as it is now: always the desktop portal on a
 * compact ~16:10 canvas, scaled to the window's width, so on phones it reads like a screenshot.
 * They load on their own, with their styles, only when the section is near the screen, so the
 * pages above the fold carry none of it.
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

export type ShowcaseFeature = {
  icon: string;
  title: string;
  text: string;
  screen: ShowcaseScreen;
};

const Frames = dynamic(() => import("./showcase/ShowcaseFrames").then((m) => m.ShowcaseFrames), {
  ssr: false,
});

const CYCLE_MS = 5000;
const HOLD_MS = 10000;

export function DashboardShowcase({
  features,
  label = "Client dashboard features",
  rates,
  photos = [],
}: {
  features: ShowcaseFeature[];
  label?: string;
  /** Published portfolio photos for the property images. */
  photos?: ShowcasePhoto[];
  /** The page's rate card, so the frames show real prices (lib/showcase showcaseRates). */
  rates?: ShowcaseRates;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false); // a click: this frame stays 10s
  const [tick, setTick] = useState(0); // restarts the timer and the progress line
  const [inView, setInView] = useState(false);
  const [near, setNear] = useState(false); // load the frames once the section is close
  const [width, setWidth] = useState(0);
  const n = features.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.35,
    });
    const pre = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setNear(true);
        pre.disconnect();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    pre.observe(el);
    return () => {
      io.disconnect();
      pre.disconnect();
    };
  }, []);

  // The window's width decides the layout and the scale.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout: Layout = "desk";
  const canvas = CANVAS[layout];
  const k = width ? Math.min(MAX_SCALE, width / canvas.w) : 0;

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
          data-l={width ? layout : undefined}
          aria-hidden="true"
          style={
            k
              ? {
                  ["--k" as string]: k,
                  ["--cw" as string]: `${canvas.w * k}px`,
                  height: canvas.h * k,
                }
              : undefined
          }
        >
          {near && k > 0 && (
            <Frames
              features={features}
              active={active}
              layout={layout}
              photos={photos}
              rates={rates}
            />
          )}
        </div>
      </div>
    </div>
  );
}
