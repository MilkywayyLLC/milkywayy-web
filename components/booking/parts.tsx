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
  title,
  sub,
  price,
  pressed,
  disabled,
  badge,
  onClick,
}: {
  id?: string;
  title: string;
  sub?: string;
  price?: string;
  pressed: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      className="sc"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <b>{title}</b>
      {sub && <small>{sub}</small>}
      {price && <span className="p">{price}</span>}
      {/* After the title so the accessible name starts with it; positioned by CSS. */}
      {badge && <span className="pop">{badge}</span>}
    </button>
  );
}

export function ChoiceCards({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <div className={cols === 4 ? "cards four" : "cards"} style={{ ["--cols" as string]: cols }}>
      {children}
    </div>
  );
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

/** Dashed sub-panel under a service (twilight add-on, video format, lighting). */
export function SubPanel({ children }: { children: ReactNode }) {
  return <div className="sub">{children}</div>;
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
