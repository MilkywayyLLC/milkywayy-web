"use client";

import { useId } from "react";
import type { Media } from "@/content/types";
import { getPath, type Field, type Option } from "@/lib/admin/fields";
import { embedUrl } from "@/lib/video";
import { ImageField } from "./ImageField";

type Values = Record<string, unknown>;

/** Renders a list of fields against a value object (dotted paths), reporting edits upward. */
export function FormFields({
  fields,
  values,
  onChange,
  errors = {},
  isOwner,
  portfolio = [],
}: {
  fields: Field[];
  values: Values;
  onChange: (name: string, value: unknown) => void;
  errors?: Record<string, string>;
  isOwner: boolean;
  /** Choices for "related portfolio items". */
  portfolio?: Option[];
}) {
  return (
    <>
      {fields
        .filter((f) => !f.ownerOnly || isOwner)
        .map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={getPath(values, f.name)}
            onChange={(v) => onChange(f.name, v)}
            error={errors[f.name]}
            portfolio={portfolio}
          />
        ))}
    </>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  error,
  portfolio,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  portfolio: Option[];
}) {
  const id = useId();
  const described =
    [f.help && `${id}-help`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described,
    "data-field": f.name,
  } as const;
  const label = f.label;

  if (f.kind === "image")
    return (
      <div data-field={f.name}>
        <ImageField
          label={f.label}
          value={value as Media}
          onChange={onChange}
          error={error}
          crops={f.crops}
          video={f.video}
          bright={f.bright}
          required={f.required}
        />
      </div>
    );

  if (f.kind === "gallery") {
    const list = (Array.isArray(value) ? value : []) as Media[];
    return (
      <fieldset className="ad-field ad-gallery" data-field={f.name}>
        <legend className="ad-label">{f.label}</legend>
        {list.map((m, i) => (
          <div key={i} className="ad-card">
            <ImageField
              label={`Image ${i + 1}`}
              value={m}
              onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
              crops={f.crops}
              required
            />
            <button
              type="button"
              className="ad-btn danger small"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
            >
              Remove image {i + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ad-btn ghost small"
          onClick={() => onChange([...list, { alt: "" }])}
        >
          Add an image
        </button>
        {error && (
          <span className="ad-err" role="alert">
            {error}
          </span>
        )}
      </fieldset>
    );
  }

  if (f.kind === "toggle")
    return (
      <div className="ad-field">
        <label className="ad-check">
          <input
            type="checkbox"
            {...common}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            <b>{f.label}</b>
            {f.help && (
              <span className="ad-help" style={{ display: "block" }} id={`${id}-help`}>
                {f.help}
              </span>
            )}
          </span>
        </label>
        {error && (
          <span className="ad-err" id={`${id}-err`}>
            {error}
          </span>
        )}
      </div>
    );

  if (f.kind === "multi" || f.kind === "portfolio-picker") {
    const options = f.kind === "multi" ? f.options : portfolio;
    const chosen = (Array.isArray(value) ? value : []).map(String);
    return (
      <fieldset className="ad-field" data-field={f.name} aria-describedby={described}>
        <legend className="ad-label">{f.label}</legend>
        <div className="ad-checks">
          {options.map((o) => (
            <label key={o.value} className="ad-check">
              <input
                type="checkbox"
                checked={chosen.includes(o.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...chosen, o.value]
                    : chosen.filter((v) => v !== o.value);
                  onChange(f.kind === "multi" && f.numeric ? next.map(Number) : next);
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {f.help && (
          <span className="ad-help" id={`${id}-help`}>
            {f.help}
          </span>
        )}
        {error && (
          <span className="ad-err" id={`${id}-err`}>
            {error}
          </span>
        )}
      </fieldset>
    );
  }

  if (f.kind === "pairs") {
    const list = (Array.isArray(value) ? value : []) as { value: string; label: string }[];
    const set = (i: number, k: "value" | "label", v: string) =>
      onChange(list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    return (
      <fieldset className="ad-field" data-field={f.name}>
        <legend className="ad-label">{f.label}</legend>
        <div className="ad-pairs">
          {list.map((p, i) => (
            <div className="ad-pair" key={i}>
              <input
                type="text"
                aria-label={`Result ${i + 1} value`}
                placeholder="40"
                value={p.value}
                onChange={(e) => set(i, "value", e.target.value)}
              />
              <input
                type="text"
                aria-label={`Result ${i + 1} label`}
                placeholder="reels a month"
                value={p.label}
                onChange={(e) => set(i, "label", e.target.value)}
              />
              <button
                type="button"
                className="ad-icon-btn"
                aria-label={`Remove result ${i + 1}`}
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ad-btn ghost small"
          onClick={() => onChange([...list, { value: "", label: "" }])}
        >
          Add a result
        </button>
        {error && <span className="ad-err">{error}</span>}
      </fieldset>
    );
  }

  let control;
  switch (f.kind) {
    case "textarea":
      control = (
        <textarea
          {...common}
          rows={f.rows ?? 4}
          maxLength={f.max}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "lines":
      control = (
        <textarea
          {...common}
          rows={Math.min(8, Math.max(2, f.exactly ?? f.max ?? 4))}
          value={(Array.isArray(value) ? value : []).join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
        />
      );
      break;
    case "number":
      control = (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            {...common}
            type="number"
            inputMode={f.step && f.step < 1 ? "decimal" : "numeric"}
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
          />
          {f.unit && <span className="ad-mono ad-muted">{f.unit}</span>}
        </div>
      );
      break;
    case "select":
      control = (
        <select
          {...common}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(f.numeric ? Number(e.target.value) : e.target.value)}
        >
          {!f.required && <option value="">—</option>}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "video": {
      const ok = !value || !!embedUrl(String(value));
      control = (
        <input
          {...common}
          type="url"
          inputMode="url"
          placeholder="Bunny, Mux, YouTube or Vimeo link"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!ok || !!error}
        />
      );
      if (!ok && !error) error = "Link not recognised. Use a Bunny, Mux, YouTube or Vimeo link.";
      break;
    }
    default:
      control = (
        <input
          {...common}
          type={f.kind === "url" ? "url" : "text"}
          inputMode={f.kind === "url" ? "url" : undefined}
          autoCapitalize={f.kind === "slug" || f.kind === "url" ? "none" : undefined}
          placeholder={
            f.kind === "text" ? f.placeholder : f.kind === "url" ? "https://" : undefined
          }
          maxLength={f.kind === "text" ? f.max : undefined}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              f.kind === "slug"
                ? e.target.value.toLowerCase().replace(/\s+/g, "-")
                : e.target.value,
            )
          }
        />
      );
  }
  return (
    <div className="ad-field">
      <label htmlFor={id}>{label}</label>
      {control}
      {f.help && (
        <span className="ad-help" id={`${id}-help`}>
          {f.help}
        </span>
      )}
      {error && (
        <span className="ad-err" id={`${id}-err`}>
          {error}
        </span>
      )}
    </div>
  );
}
