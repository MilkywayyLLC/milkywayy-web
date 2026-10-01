"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlaceholderKey } from "@/content/types";
import { CONTACTS, type Shoot } from "@/lib/portal-mock/data";
import { Icon } from "./Icon";
import { usePersona } from "./persona";
import { Ph, Sheet } from "./ui";

const PHOTOS: PlaceholderKey[] = [
  "night",
  "interior",
  "kitchen",
  "bath",
  "dusk",
  "aerial",
  "villa",
  "interior",
  "kitchen",
  "bath",
  "night",
  "dusk",
];
const PURPOSES = ["Sale", "Rent yearly", "Holiday home"] as const;
const UNIT: Record<(typeof PURPOSES)[number], string> = {
  Sale: "AED",
  "Rent yearly": "AED / year",
  "Holiday home": "AED / night",
};

/** The individual agent's own contact; companies pick from their saved contacts. */
export function useContacts() {
  const { account } = usePersona();
  if (account.id === "post")
    return [
      {
        id: "me",
        name: account.me.name,
        role: "Producer",
        brn: "",
        whatsapp: "+1 416 555 0142",
        initials: account.me.initials,
        default: true,
      },
    ];
  if (account.kind === "individual")
    return [
      {
        id: "me",
        name: account.me.name,
        role: "Agent",
        brn: "BRN 47720",
        whatsapp: account.me.phone ?? "",
        initials: account.me.initials,
        default: true,
      },
    ];
  return CONTACTS;
}

/** "Create share link" sheet (guide §6.1): booking details pre-filled, client adds the rest. */
export function ShareSheet({ shoot, onClose }: { shoot: Shoot; onClose: () => void }) {
  const contacts = useContacts();
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>("Sale");
  const [picked, setPicked] = useState<string[]>([contacts.find((c) => c.default)!.id]);
  const [photos, setPhotos] = useState<number[]>(PHOTOS.map((_, i) => i));
  const [chips, setChips] = useState([
    "Burj Khalifa view",
    "Private terrace",
    "Vacant on transfer",
  ]);
  const [chip, setChip] = useState("");
  const [done, setDone] = useState(false);

  const toggleContact = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id],
    );
  const togglePhoto = (i: number) =>
    setPhotos((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  if (done)
    return (
      <Sheet title="Link ready" onClose={onClose}>
        <p className="pt-muted">
          Details are saved to this property, so the next share is one tap.
        </p>
        <div className="pt-card" style={{ background: "var(--bg)" }}>
          <span className="pt-eb">Your link</span>
          <b className="pt-mono" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
            milkywayy.com/l/burj-vista-3br-penthouse
          </b>
        </div>
        <div className="pt-btns">
          <button type="button" className="btn btn-p btn-s">
            <Icon name="link" size={16} /> Copy link
          </button>
          <button type="button" className="btn btn-g btn-s">
            Share on WhatsApp
          </button>
          <Link href="/portal-preview/l/burj-vista-3br-penthouse" className="btn btn-g btn-s">
            Open page
          </Link>
        </div>
      </Sheet>
    );

  return (
    <Sheet title="Create share link" onClose={onClose}>
      <div className="pt-card" style={{ background: "var(--bg)", gap: 6 }}>
        <span className="pt-eb">From the booking · {shoot.ref}</span>
        <b>{shoot.address}</b>
        <span className="pt-meta">
          {shoot.property.type} · {shoot.property.beds} · {photos.length} photos, reel, 360 tour
        </span>
      </div>

      <form className="pt-form" onSubmit={(e) => (e.preventDefault(), setDone(true))}>
        <label className="pt-field">
          Title *
          <input type="text" required defaultValue="Sky-high 3 bed penthouse with Burj views" />
        </label>
        <div className="pt-field">
          Purpose *
          <div className="pt-seg" role="group" aria-label="Purpose">
            {PURPOSES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={purpose === p}
                onClick={() => setPurpose(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <label className="pt-field">
          Price * ({UNIT[purpose]})
          <input
            type="text"
            inputMode="numeric"
            required
            defaultValue={purpose === "Sale" ? "6,950,000" : ""}
          />
        </label>
        <div className="pt-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="pt-field">
            Size (sq ft)
            <input type="text" inputMode="numeric" defaultValue="2,410" />
          </label>
          <label className="pt-field">
            Bathrooms
            <input type="number" defaultValue={4} />
          </label>
        </div>
        <label className="pt-field">
          Furnishing
          <select defaultValue="Furnished">
            <option>Furnished</option>
            <option>Unfurnished</option>
            <option>Partly furnished</option>
          </select>
        </label>
        <label className="pt-field">
          Description
          <textarea defaultValue="Full-floor penthouse on the 51st floor with a wraparound terrace facing the Burj Khalifa and the fountain." />
        </label>
        <div className="pt-field">
          Highlights
          <div className="pt-chips">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="pt-chip"
                onClick={() => setChips(chips.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
              >
                {c} <Icon name="close" size={12} />
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={chip}
              onChange={(e) => setChip(e.target.value)}
              placeholder="Add a highlight"
            />
            <button
              type="button"
              className="btn btn-g btn-s"
              onClick={() => {
                if (chip.trim()) setChips([...chips, chip.trim()]);
                setChip("");
              }}
            >
              Add
            </button>
          </div>
        </div>
        <label className="pt-field">
          DLD permit number (optional)
          <input type="text" placeholder="e.g. 7120345678" />
          <small className="pt-muted" style={{ fontWeight: 400 }}>
            Shown with its QR on the page when filled in.
          </small>
        </label>

        <div className="pt-field">
          Point of contact (up to 2)
          <div className="pt-pills">
            {contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                className="pt-pill"
                aria-pressed={picked.includes(c.id)}
                onClick={() => toggleContact(c.id)}
              >
                <span className="pt-pill-face">{c.initials}</span>
                <span>
                  {c.name}
                  <small>{c.role}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-field">
          <span className="pt-row">
            Photos: tap to leave out ({photos.length} of {PHOTOS.length})
            <button
              type="button"
              className="lnk pt-small"
              onClick={() => setPhotos(PHOTOS.map((_, i) => i))}
            >
              All
            </button>
          </span>
          <div className="pt-photos">
            {PHOTOS.map((k, i) => {
              const at = photos.indexOf(i);
              return (
                <button
                  key={i}
                  type="button"
                  className="pt-photo"
                  aria-pressed={at >= 0}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => togglePhoto(i)}
                >
                  <Ph k={k} ratio="1" />
                  {at >= 0 && <b>{at + 1}</b>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="pt-check">
            <input type="checkbox" defaultChecked /> Include the reel
          </label>
          <label className="pt-check">
            <input type="checkbox" defaultChecked /> Include the 360 tour
          </label>
          <label className="pt-check">
            <input type="checkbox" /> Expires on a date
          </label>
        </div>
        <button type="submit" className="btn btn-p">
          Create link
        </button>
      </form>
    </Sheet>
  );
}
