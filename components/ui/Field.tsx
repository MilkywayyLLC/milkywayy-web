import type { ComponentProps, ReactNode } from "react";

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
  return (
    <label className="fld">
      {label}
      {children}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </label>
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

export function OptionGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="opts">{children}</div>
    </fieldset>
  );
}
