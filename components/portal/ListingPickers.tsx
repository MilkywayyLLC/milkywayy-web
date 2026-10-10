"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import { useState, useTransition } from "react";
import { saveInlineContact } from "@/lib/portal/listing-actions";
import { Icon } from "./Icon";

export type PickContact = {
  id: string;
  name: string;
  role: string | null;
  initials: string;
  whatsapp?: string | null;
  email?: string | null;
  show_whatsapp?: boolean;
};
export type PickPhoto = { id: string; label: string; src: string | null };

const initialsOf = (n: string) => {
  const p = n.trim().split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] ?? "?").slice(0, 2)).toUpperCase();
};

type Draft = { id?: string; name: string; phone: string; email: string; show_whatsapp: boolean };

/**
 * Point of contact, inline (owner, 10 Oct 2026): the chosen contacts as pills (2 at most) with
 * edit and remove; "Pick existing" (searchable) or "+ New contact" (name, phone, email, the
 * WhatsApp button switch). Saving adds or updates the contact in Contacts as well.
 */
export function ContactsField({
  all,
  chosen,
  onChange,
  onContacts,
  error,
}: {
  all: PickContact[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  onContacts: (list: PickContact[]) => void;
  error?: string;
}) {
  const [mode, setMode] = useState<"" | "pick" | "edit">("");
  const [q, setQ] = useState("");
  const [d, setD] = useState<Draft>({ name: "", phone: "", email: "", show_whatsapp: true });
  const [err, setErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const picked = chosen.map((id) => all.find((c) => c.id === id)).filter(Boolean) as PickContact[];
  const full = picked.length >= 2;
  const options = all.filter(
    (c) =>
      !chosen.includes(c.id) &&
      `${c.name} ${c.role ?? ""} ${c.whatsapp ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = "Add the name.";
    if (!d.phone.trim()) e.phone = "Add a phone or WhatsApp number.";
    setErr(e);
    if (Object.keys(e).length) return;
    start(async () => {
      const r = await saveInlineContact(d);
      if (!r.ok || !r.contact) return setErr({ form: r.error ?? "Couldn’t save the contact." });
      const c: PickContact = {
        id: r.contact.id,
        name: r.contact.name,
        role: all.find((x) => x.id === r.contact!.id)?.role ?? null,
        initials: initialsOf(r.contact.name),
        whatsapp: r.contact.whatsapp,
        email: r.contact.email || null,
        show_whatsapp: r.contact.show_whatsapp,
      };
      onContacts(
        all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? c : x)) : [...all, c],
      );
      if (!chosen.includes(c.id)) onChange([...chosen, c.id].slice(-2));
      setMode("");
      setD({ name: "", phone: "", email: "", show_whatsapp: true });
    });
  }

  return (
    <div className={`pt-field${error ? "is-bad" : ""}`} data-field="contacts">
      <span className="pt-field-label">
        Point of contact (up to 2) <span className="pt-req">*</span>
      </span>
      {picked.length > 0 && (
        <div className="pt-pills" aria-label="Chosen contacts">
          {picked.map((c) => (
            <span key={c.id} className="pt-pill" aria-pressed="true" style={{ cursor: "default" }}>
              <span className="pt-pill-face">{c.initials}</span>
              <span>
                {c.name}
                <small>{c.whatsapp ?? c.role ?? ""}</small>
              </span>
              <button
                type="button"
                className="pt-link-btn"
                aria-label={`Edit ${c.name}`}
                onClick={() => {
                  setD({
                    id: c.id,
                    name: c.name,
                    phone: c.whatsapp ?? "",
                    email: c.email ?? "",
                    show_whatsapp: c.show_whatsapp ?? true,
                  });
                  setErr({});
                  setMode("edit");
                }}
              >
                <Icon name="editing" size={14} />
              </button>
              <button
                type="button"
                className="pt-link-btn"
                aria-label={`Remove ${c.name}`}
                onClick={() => onChange(chosen.filter((x) => x !== c.id))}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      {!full && mode === "" && (
        <span className="pt-btns">
          {all.some((c) => !chosen.includes(c.id)) && (
            <button type="button" className="btn btn-g btn-s" onClick={() => setMode("pick")}>
              Pick existing
            </button>
          )}
          <button
            type="button"
            className="btn btn-g btn-s"
            onClick={() => {
              setD({ name: "", phone: "", email: "", show_whatsapp: true });
              setErr({});
              setMode("edit");
            }}
          >
            + New contact
          </button>
        </span>
      )}
      {mode === "pick" && (
        <div className="pt-card" style={{ background: "var(--bg)", gap: 8 }}>
          <input
            type="search"
            autoFocus
            aria-label="Search contacts"
            placeholder="Search by name or number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="pt-pick-list" role="listbox" aria-label="Contacts">
            {options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    onChange([...chosen, c.id].slice(-2));
                    setMode("");
                    setQ("");
                  }}
                >
                  <b>{c.name}</b> <span className="pt-meta">{c.whatsapp ?? c.role ?? ""}</span>
                </button>
              </li>
            ))}
            {!options.length && <li className="pt-meta">No match.</li>}
          </ul>
          <button type="button" className="btn btn-g btn-s" onClick={() => setMode("")}>
            Cancel
          </button>
        </div>
      )}
      {mode === "edit" && (
        <div className="pt-card pt-form" style={{ background: "var(--bg)", gap: 10 }}>
          <b>{d.id ? "Edit contact" : "New contact"}</b>
          <div className="pt-grid2">
            <label className={`pt-field${err.name ? "is-bad" : ""}`}>
              <span>
                Name <span className="pt-req">*</span>
              </span>
              <input
                type="text"
                maxLength={120}
                value={d.name}
                onChange={(e) => setD({ ...d, name: e.target.value })}
              />
              {err.name && <span className="pt-field-msg">{err.name}</span>}
            </label>
            <label className={`pt-field${err.phone ? "is-bad" : ""}`}>
              <span>
                Phone / WhatsApp <span className="pt-req">*</span>
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={d.phone}
                placeholder="+971 50 123 4567"
                onChange={(e) => setD({ ...d, phone: e.target.value })}
              />
              {err.phone && <span className="pt-field-msg">{err.phone}</span>}
            </label>
          </div>
          <label className="pt-field">
            Email
            <input
              type="email"
              value={d.email}
              onChange={(e) => setD({ ...d, email: e.target.value })}
            />
          </label>
          <label className="pt-check">
            <input
              type="checkbox"
              checked={d.show_whatsapp}
              onChange={(e) => setD({ ...d, show_whatsapp: e.target.checked })}
            />{" "}
            Show WhatsApp button
          </label>
          {err.form && (
            <p className="pt-error" role="alert">
              {err.form}
            </p>
          )}
          <span className="pt-btns">
            <button type="button" className="btn btn-p btn-s" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save contact"}
            </button>
            <button type="button" className="btn btn-g btn-s" onClick={() => setMode("")}>
              Cancel
            </button>
          </span>
          <span className="pt-meta">Saved to Contacts too. Edits update it everywhere.</span>
        </div>
      )}
      {error && <span className="pt-field-msg">{error}</span>}
    </div>
  );
}

/**
 * Photo order (owner, 10 Oct 2026): drag to reorder (arrow buttons on touch); the first photo is
 * the cover. Photos left out are listed below; tap one to add it at the end.
 */
export function PhotoOrder({
  photos,
  order,
  onChange,
  error,
}: {
  photos: PickPhoto[];
  order: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const on = order.map((id) => byId.get(id)).filter(Boolean) as PickPhoto[];
  const off = photos.filter((p) => !order.includes(p.id));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <div className={`pt-field${error ? "is-bad" : ""}`} data-field="photos">
      <span className="pt-row">
        <span className="pt-field-label">
          Photos on the page ({on.length} of {photos.length}) <span className="pt-req">*</span>
        </span>
        <span style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            className="lnk pt-small"
            onClick={() => onChange([...order, ...off.map((p) => p.id)])}
          >
            Add all
          </button>
          <button type="button" className="lnk pt-small" onClick={() => onChange([])}>
            Remove all
          </button>
        </span>
      </span>
      <span className="pt-meta">
        Drag to reorder (or use the arrows). The first one is the cover.
      </span>
      <ol className="pt-photos pt-photo-order" data-testid="photo-picker">
        {on.map((p, i) => (
          <li
            key={p.id}
            className={`pt-photo${drag === i ? "is-drag" : ""}`}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag != null) move(drag, i);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            aria-label={`Photo ${i + 1}: ${p.label}${i === 0 ? " (cover)" : ""}`}
          >
            {p.src ? (
              <img src={p.src} alt="" loading="lazy" decoding="async" draggable={false} />
            ) : (
              <span className="pt-photo-none">{p.label}</span>
            )}
            <b>{i === 0 ? "Cover" : i + 1}</b>
            <span className="pt-photo-tools">
              <button
                type="button"
                aria-label="Move earlier"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move later"
                disabled={i === on.length - 1}
                onClick={() => move(i, i + 1)}
              >
                →
              </button>
              <button
                type="button"
                aria-label={`Leave out ${p.label}`}
                onClick={() => onChange(order.filter((x) => x !== p.id))}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      {off.length > 0 && (
        <>
          <span className="pt-meta">Not on the page: tap to add at the end.</span>
          <div className="pt-photos">
            {off.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pt-photo"
                aria-pressed="false"
                aria-label={`Add ${p.label}`}
                onClick={() => onChange([...order, p.id])}
              >
                {p.src ? (
                  <img src={p.src} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="pt-photo-none">{p.label}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <span className="pt-field-msg">{error}</span>}
    </div>
  );
}
