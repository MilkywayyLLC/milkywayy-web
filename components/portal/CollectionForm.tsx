"use client";

import { useState, useTransition } from "react";
import { saveCollection } from "@/lib/portal/listing-actions";
import type { PickContact } from "./ListingForm";
import { ShareDone } from "./ListingParts";

/** A collection (§6.3): a title, a short note, the listings in order, and who to contact. */
export function CollectionForm({
  id,
  initial,
  listings,
  contacts,
}: {
  id?: string;
  initial: {
    title: string;
    note: string;
    listing_ids: string[];
    contact_ids: string[];
    expires_on: string;
  };
  listings: { id: string; title: string; meta: string }[];
  contacts: PickContact[];
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <ShareDone kind="c" slug={done} title={v.title} edited={!!id} />;

  const toggle = (k: "listing_ids" | "contact_ids", x: string, max: number) =>
    setV((s) => {
      const has = s[k].includes(x);
      const next = has ? s[k].filter((y) => y !== x) : [...s[k], x];
      return { ...s, [k]: next.length > max ? next.slice(-max) : next };
    });

  return (
    <form
      className="pt-form"
      aria-label={id ? "Edit collection" : "New collection"}
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await saveCollection(v, id);
          if (!r.ok) return setError(r.error ?? "Couldn’t save.");
          setDone(r.slug!);
        });
      }}
    >
      <label className="pt-field">
        Title *
        <input
          type="text"
          required
          minLength={3}
          maxLength={120}
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          placeholder="e.g. 3 homes picked for you"
        />
      </label>
      <label className="pt-field">
        A short note (optional)
        <textarea
          rows={3}
          maxLength={600}
          value={v.note}
          onChange={(e) => setV({ ...v, note: e.target.value })}
          placeholder="Hi Imran and Sara, here are the three we talked about."
        />
      </label>
      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Listings, in this order *</legend>
        {listings.map((l) => {
          const at = v.listing_ids.indexOf(l.id);
          return (
            <label key={l.id} className="pt-check">
              <input
                type="checkbox"
                checked={at >= 0}
                onChange={() => toggle("listing_ids", l.id, 30)}
              />{" "}
              <span>
                {at >= 0 ? `${at + 1}. ` : ""}
                {l.title} <small className="pt-meta">{l.meta}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="pt-field">
        <span id="c-contacts">Point of contact (up to 2) *</span>
        <div className="pt-pills" role="group" aria-labelledby="c-contacts">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pt-pill"
              aria-pressed={v.contact_ids.includes(c.id)}
              onClick={() => toggle("contact_ids", c.id, 2)}
            >
              <span className="pt-pill-face">{c.initials}</span>
              <span>
                {c.name}
                {c.role && <small>{c.role}</small>}
              </span>
            </button>
          ))}
        </div>
      </div>
      <label className="pt-check">
        <input
          type="checkbox"
          checked={!!v.expires_on}
          onChange={(e) =>
            setV({
              ...v,
              expires_on: e.target.checked
                ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
                : "",
            })
          }
        />{" "}
        Expires on a date
      </label>
      {v.expires_on && (
        <label className="pt-field">
          Expiry date
          <input
            type="date"
            value={v.expires_on}
            onChange={(e) => setV({ ...v, expires_on: e.target.value })}
          />
        </label>
      )}
      {error && (
        <p className="pt-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-p"
        disabled={pending || !v.listing_ids.length || !v.contact_ids.length}
      >
        {pending ? "Saving…" : id ? "Save changes" : "Create collection link"}
      </button>
    </form>
  );
}
