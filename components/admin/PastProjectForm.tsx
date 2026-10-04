"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPastProject, type PastProjectInput } from "@/lib/portal/admin-project-actions";
import { AVATAR_LENGTHS, EDIT_KINDS } from "@/lib/portal/projects";

const TYPES = [
  ["shoot", "Property shoot"],
  ["edit", "Editing batch"],
  ["avatar", "Avatar video"],
] as const;

/**
 * Add a client's earlier work (owner, 4 Oct 2026: nothing is imported from the old portal). It's
 * created as Completed with its original date; the files are added on the next page.
 */
export function PastProjectForm({ account }: { account: string }) {
  const router = useRouter();
  const [type, setType] = useState<PastProjectInput["type"]>("shoot");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="ad-card ad-form"
      aria-label="Add past project"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const r = await createPastProject({
            account,
            type,
            title: v("title"),
            date: v("date"),
            area: v("area"),
            building: v("building"),
            unit: v("unit"),
            propertyType: v("property_type"),
            size: v("size"),
            kind: v("kind"),
            notes: v("notes"),
          });
          if (!r.ok || !r.id) return setError(r.error ?? "Couldn’t save.");
          router.push(`/admin/projects/${r.id}?past=1`);
        });
      }}
    >
      <div className="ad-btns" role="group" aria-label="Type">
        {TYPES.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={type === k ? "ad-btn small" : "ad-btn small ghost"}
            aria-pressed={type === k}
            onClick={() => setType(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="pp-title">Title</label>
          <input
            id="pp-title"
            name="title"
            maxLength={160}
            placeholder={
              type === "shoot" ? "2 Bed apartment, Marina Gate 1" : "October reels for Instagram"
            }
          />
        </div>
        <div className="ad-field">
          <label htmlFor="pp-date">Original date</label>
          <input id="pp-date" name="date" type="date" max={today} />
        </div>
      </div>
      {type === "shoot" ? (
        <>
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="pp-building">Building</label>
              <input id="pp-building" name="building" maxLength={120} />
            </div>
            <div className="ad-field">
              <label htmlFor="pp-area">Area</label>
              <input id="pp-area" name="area" maxLength={120} placeholder="Dubai Marina" />
            </div>
          </div>
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="pp-unit">Unit (optional)</label>
              <input id="pp-unit" name="unit" maxLength={40} />
            </div>
            <div className="ad-field">
              <label htmlFor="pp-type">Property type</label>
              <select id="pp-type" name="property_type" defaultValue="apartment">
                <option value="apartment">Apartment</option>
                <option value="villa">Villa</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
          </div>
          <div className="ad-field">
            <label htmlFor="pp-size">Size (optional)</label>
            <input id="pp-size" name="size" maxLength={40} placeholder="2 Bed" />
          </div>
        </>
      ) : (
        <div className="ad-field">
          <label htmlFor="pp-kind">{type === "edit" ? "What it was" : "Length"}</label>
          <select id="pp-kind" name="kind" defaultValue="">
            <option value="">Not stated</option>
            {(type === "edit" ? EDIT_KINDS : AVATAR_LENGTHS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="ad-field">
        <label htmlFor="pp-notes">Notes (optional, the client sees them)</label>
        <textarea id="pp-notes" name="notes" rows={2} maxLength={2000} />
      </div>
      <span className="ad-small ad-muted">
        It’s saved as Completed. Next you add the delivered files or links; the client isn’t emailed
        unless you tick “Notify client” when you publish them.
      </span>
      {error && (
        <p className="ad-status error" role="alert">
          {error}
        </p>
      )}
      <div className="ad-btns">
        <button type="submit" className="ad-btn" disabled={pending}>
          {pending ? "Saving…" : "Add past project"}
        </button>
      </div>
    </form>
  );
}
