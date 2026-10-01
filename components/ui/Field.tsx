import { Children, type ComponentProps, type ReactNode } from "react";

/** Labelled input with an optional inline error that says how to fix it. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  // The error sits outside the <label> so it isn't read as part of the field's name; the label
  // uses display: contents so the grid layout is unchanged.
  return (
    <div className="fld">
      <label className="fld-in">
        {label}
        {children}
      </label>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} />;
}

export function TextArea(props: ComponentProps<"textarea">) {
  return <textarea {...props} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: string[] }) {
  return (
    <select {...props}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

/** Radio or checkbox rendered as a square chip, or as a card with a sub-line. */
export function Option({
  type = "radio",
  name,
  value,
  label,
  sub,
  defaultChecked,
  checked,
  onChange,
}: {
  type?: "radio" | "checkbox";
  name: string;
  value: string;
  label: string;
  sub?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: ComponentProps<"input">["onChange"];
}) {
  return (
    <label className={sub ? "opt card" : "opt"}>
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
      />
      {sub ? (
        <span>
          <b>{label}</b>
          <small>{sub}</small>
        </span>
      ) : (
        <span>{label}</span>
      )}
    </label>
  );
}

/**
 * A labelled set of radio/checkbox options. On phones (≤ 560px) the group becomes a full-width grid
 * so it lines up with the full-width submit button: 3 options → one row of three, 2 or 4 → two
 * columns (2 × 2), `cards` (options with a sub-line) → one per row. Desktop keeps natural widths.
 */
export function OptionGroup({
  legend,
  cards,
  error,
  children,
}: {
  legend: string;
  cards?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const n = Children.count(children);
  const cls = ["opts", cards ? "opts-cards" : `opts-n${n}`].join(" ");
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend>{legend}</legend>
      <div className={cls}>{children}</div>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}
