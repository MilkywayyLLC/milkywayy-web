"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DEFAULT_COUNTRY, flag, TOP_COUNTRIES } from "@/lib/phone";
import type { Country } from "@/lib/phone/countries";

/**
 * Phone number with a country-code picker (owner, 2 Oct 2026): +971 UAE by default, the most
 * common countries first, and every country searchable by name or code. The full list is loaded
 * only when the picker opens. Submits `phone`, `phone_country` (ISO) and `phone_dial`.
 */
export function PhoneField({
  label,
  error,
  invalid,
}: {
  label: string;
  error?: string;
  invalid?: boolean;
}) {
  const id = useId();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Country[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!all) import("@/lib/phone/countries").then((m) => setAll(m.COUNTRIES));
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, all]);

  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const options = useMemo(() => {
    const match = (c: Country) =>
      !q || c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q || c.dial.startsWith(q);
    const top = TOP_COUNTRIES.filter(match).map((c) => ({ ...c, group: "Popular" }));
    const rest = (all ?? [])
      .filter((c) => match(c) && !TOP_COUNTRIES.some((t) => t.iso === c.iso))
      .map((c) => ({ ...c, group: "All countries" }));
    return [...top, ...rest];
  }, [q, all]);

  function choose(c: Country) {
    setCountry(c);
    setOpen(false);
    setQuery("");
    button.current?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(
        0,
        Math.min(options.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)),
      );
      setActive(next);
      list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
  }

  return (
    <div className="fld" ref={wrap}>
      <span id={`${id}-l`}>{label}</span>
      <div className="phone">
        <button
          ref={button}
          type="button"
          className="cc"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Country code: ${country.name} +${country.dial}. Change`}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{flag(country.iso)}</span> +{country.dial}
          <span className="cc-caret" aria-hidden="true" />
        </button>
        <input
          name="phone"
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          aria-labelledby={`${id}-l`}
          aria-invalid={invalid || undefined}
          placeholder={country.iso === "AE" ? "50 123 4567" : "Phone number"}
        />
        <input type="hidden" name="phone_country" value={country.iso} />
        <input type="hidden" name="phone_dial" value={country.dial} />
      </div>
      {open && (
        <div className="cc-pop" role="dialog" aria-label="Choose a country code">
          <input
            ref={search}
            type="search"
            className="cc-search"
            placeholder="Search country or code"
            aria-label="Search country or code"
            aria-controls={`${id}-list`}
            aria-activedescendant={options[active] ? `${id}-o${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Countries"
            className="cc-list"
          >
            {options.map((c, i) => (
              <li
                key={`${c.group}-${c.iso}`}
                id={`${id}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={c.iso === country.iso}
                data-active={i === active || undefined}
                data-group-start={i === 0 || options[i - 1].group !== c.group ? c.group : undefined}
                onClick={() => choose(c)}
                onPointerMove={() => setActive(i)}
              >
                <span aria-hidden="true">{flag(c.iso)}</span>
                <span className="cc-name">{c.name}</span>
                <span className="cc-dial">+{c.dial}</span>
              </li>
            ))}
            {!options.length && (
              <li className="cc-empty">{all ? "No country matches." : "Loading…"}</li>
            )}
          </ul>
        </div>
      )}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
