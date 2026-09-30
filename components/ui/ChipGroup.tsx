"use client";

/** Single-select filter chips (aria-pressed). Controlled. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Non-interactive chips, e.g. what a package can include. */
export function StaticChips({ items }: { items: string[] }) {
  return (
    <div className="chips-static">
      {items.map((i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}
