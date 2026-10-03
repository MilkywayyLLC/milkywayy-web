"use client";

/**
 * Presentational pieces of the property BookingBuilder (guide §8). They take values and callbacks
 * only; the builder state, price rules and locks live in lib/booking and arrive in Phase 3.
 */
import type { ReactNode } from "react";
import { formatAED } from "@/lib/format";

/** Collapsible property card: number · title · location/services · subtotal. */
export function PropertyCard({
  index,
  title,
  summary,
  subtotal,
  open,
  invalid,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  summary: string;
  subtotal: number;
  open: boolean;
  invalid?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const id = `prop-${index}`;
  return (
    <div className={["prop", open && "open", invalid && "invalid"].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="prop-h"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="no">{String(index + 1).padStart(2, "0")}</span>
        <span>
          <b>{title}</b>
          <small>{summary}</small>
        </span>
        <span className="amt">{formatAED(subtotal)}</span>
        <span className="chev" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <div className="prop-b" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Labelled group inside an open card (Property type, Size, Services …). */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grp" role="group" aria-label={label}>
      <span className="gl" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Toggle card: service, commercial scale tier, or video format. */
export function ChoiceCard({
  id,
  controls,
  expanded,
  title,
  sub,
  price,
  summary,
  pressed,
  disabled,
  badge,
  onClick,
  onRemove,
  col,
}: {
  id?: string;
  /** id of the options panel this card opens, when it has one. */
  controls?: string;
  /** Whether that options panel is showing (desktop: one panel at a time). */
  expanded?: boolean;
  title: string;
  sub?: string;
  price?: string;
  /** One line summarising the chosen options, shown while selected (e.g. "+ 5 twilight"). */
  summary?: string;
  pressed: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
  /**
   * Service cards: a separate ✓ corner button that deselects (shows ✕ on hover). Used from 768px,
   * where clicking a selected card reopens its options instead of deselecting it.
   */
  onRemove?: () => void;
  /** Grid column (0–2) inside `.svc-grid`. */
  col?: number;
}) {
  const card = (
    <button
      id={id}
      type="button"
      className="sc"
      aria-pressed={pressed}
      aria-controls={controls}
      aria-expanded={controls ? !!expanded : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <b>{title}</b>
      {sub && <small>{sub}</small>}
      {price && <span className="p">{price}</span>}
      {pressed && summary && <small className="opt-sum">{summary}</small>}
      {/* After the title so the accessible name starts with it; positioned by CSS. */}
      {badge && <span className="pop">{badge}</span>}
    </button>
  );
  if (!onRemove && col === undefined) return card;
  return (
    <div className="sc-wrap" data-col={col}>
      {card}
      {pressed && onRemove && (
        <button type="button" className="sc-x" aria-label={`Remove ${title}`} onClick={onRemove} />
      )}
    </div>
  );
}

/**
 * Grid of choice cards. Layout per `cols` is in CSS (components.css, "choice cards"): 3 → one row
 * on desktop, stacked on phones; 4 (commercial tiers) → one row, 2 × 2 on phones; 2 → two columns.
 */
export function ChoiceCards({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return <div className={`cards cols-${cols}`}>{children}</div>;
}

/** Commercial tier inclusions; "Not included" items are dimmed. */
export function InclusionsStrip({ items }: { items: { label: string; value: string | null }[] }) {
  return (
    <div className="incl-strip">
      {items.map((i) => (
        <span key={i.label} className={i.value ? undefined : "off"}>
          <b>{i.label}</b> {i.value ?? "Not included"}
        </span>
      ))}
    </div>
  );
}

/**
 * Dashed options panel for a service (twilight, video format, lighting). Inside `.svc-grid` it opens
 * under its parent card; `pointTo` is that card's column (0–2) for the desktop pointer.
 */
export function SubPanel({
  children,
  pointTo,
  id,
  label,
  active,
}: {
  children: ReactNode;
  pointTo?: number;
  id?: string;
  label?: string;
  /** From 768px only the active panel shows (one at a time); phones show every selected one. */
  active?: boolean;
}) {
  return (
    <div
      className={active ? "sub is-active" : "sub"}
      id={id}
      role={label ? "group" : undefined}
      aria-label={label}
      style={pointTo !== undefined ? { ["--c" as string]: pointTo } : undefined}
    >
      {children}
    </div>
  );
}

export interface SummaryItem {
  title: string;
  location: string;
  services: string;
  when: string;
  subtotal: number;
}

/** Sticky booking summary with total and the WhatsApp message preview. */
export function BookingSummary({
  items,
  total,
  message,
  action,
}: {
  items: SummaryItem[];
  total: number;
  message: string;
  action: ReactNode;
}) {
  return (
    <aside className="b-sum" aria-label="Booking summary">
      <span className="eb">Booking summary</span>
      <div className="sum-list">
        {items.map((it, i) => (
          <div className="sum-item" key={i}>
            <span>
              <b>{it.title}</b>
              {it.location && <small>{it.location}</small>}
              <small>{it.services}</small>
              <small>{it.when}</small>
            </span>
            <span>{formatAED(it.subtotal)}</span>
          </div>
        ))}
      </div>
      <div aria-live="polite">
        <span className="fine">Estimated total</span>
        <div className="tot">{formatAED(total)}</div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="fine">This message opens in WhatsApp:</span>
        <WhatsAppPreview message={message} />
      </div>
      {action}
      <p className="fine">
        No payment now. We confirm your slot, shoot, deliver, then invoice. Media is licensed for
        your marketing use.
      </p>
    </aside>
  );
}

/** Green chat bubble showing the exact message that will open in WhatsApp. */
export function WhatsAppPreview({ message }: { message: string }) {
  return <p className="wa-preview">{message}</p>;
}
