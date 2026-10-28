"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Book media's page frame (owner, 18 Oct 2026): the step on the left (max ~720px), "Your
 * booking" sticky on the right, Back / Next under the step. Phones: one column and a sticky bottom
 * bar (the total, which opens the lines, and the main button). Typography and spacing tokens are
 * listed in DECISIONS.md (classes `bkp-`).
 */
export function BookStep({
  label,
  heading,
  children,
  panel,
  panelTitle = "Your booking",
  onBack,
  primary,
  barText,
  wide,
  steps,
  eyebrow,
  icon,
}: {
  /** Full content width (no panel): "What are you booking?". */
  wide?: boolean;
  /** The stepper under the title (V2 reskin): "01 Details", … and where you are. */
  steps?: { labels: string[]; at: number };
  /** Small mono line above the title ("Book media"). */
  eyebrow?: string;
  /** The title's icon tile. */
  icon?: string;
  /** "Step 1 of 3". */
  label?: string;
  heading: string;
  children: ReactNode;
  panel?: ReactNode;
  panelTitle?: string;
  onBack?: () => void;
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  /** The phone bar's total (opens the panel's lines). */
  barText?: string;
}) {
  const [sheet, setSheet] = useState(false);
  return (
    <div className="bkp-grid" data-panel={panel ? "" : undefined} data-wide={wide ? "" : undefined}>
      {/* The heading sits above both columns, so the panel lines up with the step's content. */}
      <div className="bkp-head">
        {onBack && (
          <button type="button" className="bkp-backlink" onClick={onBack}>
            <Icon name="back" size={14} /> Back
          </button>
        )}
        {label && !steps && <span className="pt-eb">{label}</span>}
        <div className="bkp-title">
          {icon && (
            <span className="bkp-title-ic" aria-hidden="true">
              <Icon name={icon} size={22} />
            </span>
          )}
          <div>
            {eyebrow && <span className="pt-eb">{eyebrow}</span>}
            <h2 className="bkp-sec" id="bkp-step-h">
              {heading}
            </h2>
          </div>
        </div>
        {steps && (
          <ol className="bkp-stepper" aria-label={label}>
            {steps.labels.map((l, i) => (
              <li
                key={l}
                data-done={i < steps.at ? "" : undefined}
                aria-current={i === steps.at ? "step" : undefined}
              >
                <span>{l}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <section className="bkp-main" aria-labelledby="bkp-step-h">
        {children}
        {primary && (
          <div className="bkp-nav">
            {onBack && (
              <button type="button" className="btn btn-g btn-s" onClick={onBack}>
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-p btn-s"
              disabled={primary.disabled}
              onClick={primary.onClick}
            >
              {primary.label}
            </button>
          </div>
        )}
      </section>
      {panel && (
        <aside className="bkp-side" aria-label={panelTitle}>
          <span className="bkp-sec">{panelTitle}</span>
          {panel}
        </aside>
      )}
      {primary && (
        <div className="bkp-bar">
          {sheet && panel && (
            <div className="bkp-sheet" id="bkp-sheet" role="region" aria-label={panelTitle}>
              <span className="bkp-sec">{panelTitle}</span>
              {panel}
            </div>
          )}
          {panel ? (
            <button
              type="button"
              className="bkp-sumbtn"
              aria-expanded={sheet}
              aria-controls="bkp-sheet"
              onClick={() => setSheet((o) => !o)}
            >
              <b>{barText}</b>
              <span className="bkp-chev" aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-p btn-s"
            disabled={primary.disabled}
            onClick={primary.onClick}
          >
            {primary.label}
          </button>
        </div>
      )}
    </div>
  );
}

/** The compact, centred thank-you (shoot booked, edit request sent). */
export function ThankYou({
  idLabel,
  id,
  heading,
  text,
  children,
}: {
  idLabel: string;
  id: string;
  heading: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="bkp-done" role="status">
      <span className="bkp-done-ic" aria-hidden="true">
        <Icon name="check" size={24} />
      </span>
      <span className="pt-eb">{idLabel}</span>
      <b className="bkp-sec">{id}</b>
      <p className="bkp-body">
        <b>{heading}</b>
        <br />
        <span className="bkp-muted">{text}</span>
      </p>
      <div className="bkp-done-btns">{children}</div>
    </div>
  );
}

/** − n + */
export function Counter({
  label,
  value,
  min = 1,
  max = 100,
  editable,
  onChange,
}: {
  /** A number input between − and + (large counts). */
  editable?: boolean;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      className="bkp-count"
      role="group"
      aria-label={label}
      data-testid={`qty-${label.toLowerCase().replace(/\W+/g, "-")}`}
    >
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      {editable ? (
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          aria-label={`${label} count`}
          value={value}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
          }}
        />
      ) : (
        <output aria-live="polite">{value}</output>
      )}
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}

/** A card that toggles (or goes somewhere): the whole card is the button; a counter inside sits
 *  above the hit area. */
export function ServiceCard({
  icon,
  title,
  line,
  meta,
  price,
  on,
  tick = true,
  onToggle,
  children,
  list,
}: {
  /** A short "includes" list under the line. */
  list?: string[];
  icon?: string;
  title: string;
  line?: string;
  /** Small muted, bottom left (delivery). */
  meta?: ReactNode;
  /** Bottom right. */
  price?: ReactNode;
  on: boolean;
  tick?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="bkp-card" data-on={on ? "" : undefined}>
      <button
        type="button"
        className="bkp-hit"
        aria-pressed={tick ? on : undefined}
        onClick={onToggle}
      >
        <span className="bkp-sr">{title}</span>
        {list && <span className="bkp-sr">{`: ${line ?? ""}`}</span>}
      </button>
      {tick && (
        <span className="bkp-tick" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      )}
      {icon && (
        <span className="bkp-card-ic" aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
      )}
      <span className="bkp-card-t" aria-hidden="true">
        {title}
      </span>
      {line && (
        <span className="bkp-muted" aria-hidden="true">
          {line}
        </span>
      )}
      {list && (
        <ul className="bkp-card-list" aria-hidden="true">
          {list.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {children && <div className="bkp-card-ctl">{children}</div>}
      {(meta || price) && (
        <span className="bkp-card-f">
          <span className="bkp-muted">{meta}</span>
          {price}
        </span>
      )}
    </div>
  );
}

/** A checkbox with a label, an optional muted line and something on the right. */
export function Check({
  label,
  sub,
  right,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  sub?: ReactNode;
  right?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  testId?: string;
}) {
  return (
    <label
      className="bkp-check"
      data-on={checked ? "" : undefined}
      data-off={disabled ? "" : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={onChange}
      />
      <span className="bkp-box" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      <span className="bkp-check-t">
        {label}
        {sub && <span className="bkp-muted">{sub}</span>}
      </span>
      {right}
    </label>
  );
}

/** A segmented control: equal parts, the chosen one with the dark border. */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="bkp-seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}
