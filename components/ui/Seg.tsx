"use client";

/** Segmented choice buttons used in the booking builder (aria-pressed). Controlled. */
export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: (value: T) => boolean;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={isDisabled?.(o.value)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
