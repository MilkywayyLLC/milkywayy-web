"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * Tab list (WAI-ARIA tabs pattern, arrow keys move between tabs). Controlled; the caller renders
 * one panel with `role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${value}`}`.
 */
export function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
  idPrefix,
  flush,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  idPrefix: string;
  /** No bottom rule or gap: tabs sit directly on top of the media below. */
  flush?: boolean;
}) {
  const prefix = idPrefix;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={label}
      style={flush ? { marginBottom: 0, borderBottom: 0 } : undefined}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${prefix}-tab-${o.value}`}
          aria-controls={`${prefix}-panel`}
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
