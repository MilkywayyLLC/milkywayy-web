"use client";

import type { ReactNode } from "react";

export type PayOption = { value: string; title: string; detail: string; note?: ReactNode };

/** "How would you like to pay?": the options as cards in one row on desktop, stacked on mobile. */
export function PayOptions({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: PayOption[];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="pt-field pt-payopts" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>How would you like to pay?</legend>
      <div className="pt-payopts-row" data-n={options.length}>
        {options.map((o) => (
          <label key={o.value} className="pt-payopt" data-on={value === o.value ? "" : undefined}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              <b>{o.title}</b>
              <small className="pt-meta">({o.detail})</small>
            </span>
          </label>
        ))}
      </div>
      {options.find((o) => o.value === value)?.note}
    </fieldset>
  );
}
