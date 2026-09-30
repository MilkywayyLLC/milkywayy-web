"use client";

import type { ReactNode } from "react";

export interface SegOption<T> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is shortened (e.g. on phones). */
  ariaLabel?: string;
}

/**
 * Segmented choice buttons (aria-pressed). Controlled. `cols` lays the buttons out as a grid of
 * equal columns (one row of three for property type, sizes on one row, etc.); CSS in
 * components.css drops to fewer columns on phones where needed.
 */
export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
  isDisabled,
  className,
}: {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: (value: T) => boolean;
  className?: string;
}) {
  return (
    <div
      className={["seg", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      style={{ ["--n" as string]: options.length }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          disabled={isDisabled?.(o.value)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
