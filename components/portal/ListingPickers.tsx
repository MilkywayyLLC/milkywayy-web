"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import { useState, useTransition } from "react";
import { saveInlineContact } from "@/lib/portal/listing-actions";
import { ContactPhotoField, photoPick, savePickedPhoto, type PhotoPick } from "./ContactPhotoField";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";

export type PickContact = {
  id: string;
  name: string;
  role: string | null;
  initials: string;
  whatsapp?: string | null;
  email?: string | null;
  show_whatsapp?: boolean;
  brn?: string | null;
  /** Signed preview of the round photo, if any. */
  photo?: string | null;
};
export type PickPhoto = { id: string; label: string; src: string | null };

const initialsOf = (n: string) => {
  const p = n.trim().split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] ?? "?").slice(0, 2)).toUpperCase();
};

type Draft = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  brn: string;
  show_whatsapp: boolean;
  /** The photo picked in the form (square-cropped), uploaded after the contact saves. */
  photo: PhotoPick;
};
const EMPTY: Draft = {
  name: "",
  phone: "",
  email: "",
  brn: "",
  show_whatsapp: true,
  photo: photoPick(null),
};

/** Round photo, or initials when there's none. */
export function Face({
  c,
  size,
}: {
  c: { initials: string; photo?: string | null };
  size?: number;
}) {
  const st = size ? { width: size, height: size } : undefined;
  return c.photo ? (
    <img src={c.photo} alt="" className="pt-pill-face" style={st} />
  ) : (
    <span className="pt-pill-face" style={st}>
      {c.initials}
    </span>
  );
}

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
  const [d, setD] = useState<Draft>(EMPTY);
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
      const { photo: pick, ...fields } = d;
      const r = await saveInlineContact(fields);
      if (!r.ok || !r.contact) return setErr({ form: r.error ?? "Couldn’t save the contact." });
      const before = all.find((x) => x.id === r.contact!.id);
      const photoErr = await savePickedPhoto(r.contact.id, pick);
      const photo = photoErr ? (before?.photo ?? null) : pick.preview;
      const c: PickContact = {
        id: r.contact.id,
        name: r.contact.name,
        role: before?.role ?? null,
        initials: initialsOf(r.contact.name),
        whatsapp: r.contact.whatsapp,
        email: r.contact.email || null,
        show_whatsapp: r.contact.show_whatsapp,
        brn: r.contact.brn || null,
        photo,
      };
      onContacts(
        all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? c : x)) : [...all, c],
      );
      if (!chosen.includes(c.id)) onChange([...chosen, c.id].slice(-2));
      setMode("");
      setD(EMPTY);
    });
  }

  return (
    <div className={`pt-field ${error ? "is-bad" : ""}`} data-field="contacts">
      <span className="pt-field-label">
        Point of contact (up to 2) <span className="pt-req">*</span>
      </span>
      {picked.length > 0 && (
        <div className="pt-pills" aria-label="Chosen contacts">
          {picked.map((c) => (
            <span key={c.id} className="pt-pill" aria-pressed="true" style={{ cursor: "default" }}>
              <Face c={c} />
              <span>
                {c.name}
                <small>
                  {[c.whatsapp ?? c.role, c.brn && `BRN ${c.brn}`].filter(Boolean).join(" · ")}
                </small>
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
                    brn: c.brn ?? "",
                    show_whatsapp: c.show_whatsapp ?? true,
                    photo: photoPick(c.photo),
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
              setD(EMPTY);
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
            <label className={`pt-field ${err.name ? "is-bad" : ""}`}>
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
            <label className={`pt-field ${err.phone ? "is-bad" : ""}`}>
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
          <div className="pt-grid2">
            <label className="pt-field">
              Email
              <input
                type="email"
                value={d.email}
                onChange={(e) => setD({ ...d, email: e.target.value })}
              />
            </label>
            <label className="pt-field">
              RERA / BRN number (optional)
              <input
                type="text"
                maxLength={40}
                value={d.brn}
                onChange={(e) => setD({ ...d, brn: e.target.value })}
              />
            </label>
          </div>
          <ContactPhotoField
            value={d.photo}
            onChange={(photo) => setD((x) => ({ ...x, photo }))}
            initials={d.name.trim() ? initialsOf(d.name) : ""}
            onError={(m) => setErr((x) => ({ ...x, form: m }))}
          />
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

/** One photo in the sortable grid: drag anywhere on it; Space/Enter + arrows from the keyboard. */
function SortablePhoto({
  p,
  i,
  selected,
  onSelect,
  onRemove,
}: {
  p: PickPhoto;
  i: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });
  return (
    <li
      ref={setNodeRef}
      className={`pt-sphoto ${isDragging ? "is-drag" : ""} ${selected ? "is-sel" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="pt-sphoto-hit"
        aria-label={`Photo ${i + 1}: ${p.label}${i === 0 ? " (cover)" : ""}. Press space to drag.`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {p.src ? (
          <img src={p.src} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <span className="pt-photo-none">{p.label}</span>
        )}
      </button>
      {i === 0 && <b className="pt-sphoto-cover">Cover</b>}
      <button
        type="button"
        className="pt-sphoto-x"
        aria-label={`Leave out ${p.label}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}

/**
 * Photo order (site-refine, Oct 2026): a compact sortable grid (@dnd-kit; 6 across on desktop,
 * 3 on phones) with real drag-and-drop to any position, auto-scroll near the edges and a drop
 * placeholder; keyboard sorting from dnd-kit. Clicking a photo selects it and shows it large in
 * a sticky panel, with "Make cover". The first photo is the cover. Photos left out are listed
 * below; tap one to add it at the end.
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
  const [sel, setSel] = useState<string | null>(order[0] ?? null);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const on = order.map((id) => byId.get(id)).filter(Boolean) as PickPhoto[];
  const off = photos.filter((p) => !order.includes(p.id));
  const picked = sel && order.includes(sel) ? byId.get(sel) : on[0];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [dragging, setDragging] = useState<PickPhoto | null>(null);
  const onDragStart = ({ active }: DragStartEvent) =>
    setDragging(byId.get(String(active.id)) ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    onChange(arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id))));
  };
  return (
    <div className={`pt-field ${error ? "is-bad" : ""}`} data-field="photos">
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
        Drag to reorder, or focus a photo and use Space and the arrow keys. The first one is the
        cover.
      </span>
      <div className="pt-sort">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
          autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 12 }}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <ol className="pt-sort-grid" data-testid="photo-picker">
              {on.map((p, i) => (
                <SortablePhoto
                  key={p.id}
                  p={p}
                  i={i}
                  selected={picked?.id === p.id}
                  onSelect={() => setSel(p.id)}
                  onRemove={() => onChange(order.filter((x) => x !== p.id))}
                />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {dragging && (
              <div className="pt-sphoto pt-sphoto-lift">
                {dragging.src ? (
                  <img src={dragging.src} alt="" />
                ) : (
                  <span className="pt-photo-none">{dragging.label}</span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {picked && (
          <aside className="pt-sort-preview" aria-label="Selected photo">
            {picked.src ? (
              <img src={picked.src} alt={picked.label} />
            ) : (
              <span className="pt-photo-none">{picked.label}</span>
            )}
            <div className="pt-row">
              <span className="pt-meta">
                {order.indexOf(picked.id) === 0
                  ? "Cover photo"
                  : `Photo ${order.indexOf(picked.id) + 1} of ${order.length}`}
              </span>
              {order.indexOf(picked.id) > 0 && (
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={() => onChange([picked.id, ...order.filter((x) => x !== picked.id)])}
                >
                  Make cover
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
      {off.length > 0 && (
        <>
          <span className="pt-meta">Not on the page: tap to add at the end.</span>
          <div className="pt-sort-grid">
            {off.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pt-sphoto pt-sphoto-off"
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
