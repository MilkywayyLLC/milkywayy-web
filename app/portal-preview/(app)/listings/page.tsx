"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { ShareSheet } from "@/components/portal-mock/ShareSheet";
import { Badge, NotFor, Ph, Sheet, useToast } from "@/components/portal/ui";
import { LISTINGS, SHOOTS } from "@/lib/portal-mock/data";

const B = "/portal-preview";

export default function Listings() {
  const { account } = usePersona();
  const [share, setShare] = useState(false);
  const [coll, setColl] = useState(false);
  const [paused, setPaused] = useState<Record<string, boolean>>({ "bloom-towers-1br": true });
  const [toast, say] = useToast();
  if (!account.services.includes("shoots"))
    return <NotFor what="property shoots (listings come from delivered shoots)" />;

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Share pages for your delivered shoots</span>
          <h1 className="pt-h1">Listings</h1>
        </div>
        <button type="button" className="btn btn-p btn-s" onClick={() => setShare(true)}>
          <Icon name="plus" size={16} /> New share link
        </button>
      </div>

      <div className="pt-grid2">
        {LISTINGS.map((l) => {
          const off = paused[l.slug];
          return (
            <article key={l.slug} className="pt-card">
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12 }}>
                <Ph k={l.photo} ratio="1" />
                <div style={{ display: "grid", gap: 2, alignContent: "start" }}>
                  <Badge tone={off ? undefined : "ok"}>{off ? "Paused" : "Live"}</Badge>
                  <b className="pt-title">{l.title}</b>
                  <span className="pt-meta">
                    {l.price} · {l.purpose}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <div className="pt-stat">
                  <b>{l.views}</b>
                  <span className="pt-meta">views</span>
                </div>
                <div className="pt-stat">
                  <b>{l.taps}</b>
                  <span className="pt-meta">WhatsApp/Call taps</span>
                </div>
              </div>
              <div className="pt-btns">
                <button
                  type="button"
                  className="btn btn-g btn-s pt-btn-sm"
                  onClick={() => say("Link copied (mockup)")}
                >
                  <Icon name="link" size={16} /> Copy
                </button>
                <Link href={`${B}/l/${l.slug}`} className="btn btn-g btn-s pt-btn-sm">
                  Open
                </Link>
                <button
                  type="button"
                  className="btn btn-g btn-s pt-btn-sm"
                  onClick={() => setPaused({ ...paused, [l.slug]: !off })}
                >
                  {off ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  className="btn btn-g btn-s pt-btn-sm"
                  onClick={() => setShare(true)}
                >
                  Edit
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <div className="pt-row">
          <h2 className="pt-h2">Collections</h2>
          <button type="button" className="lnk pt-small" onClick={() => setColl(true)}>
            + New collection
          </button>
        </div>
        <div className="pt-list">
          <Link
            href={`${B}/c/picked-for-the-khans`}
            className="pt-row"
            style={{ textDecoration: "none" }}
          >
            <div>
              <b>3 homes picked for the Khans</b>
              <div className="pt-meta">3 listings · 58 views · 4 taps</div>
            </div>
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      </section>

      {share && <ShareSheet shoot={SHOOTS[2]} onClose={() => setShare(false)} />}
      {coll && (
        <Sheet title="New collection" onClose={() => setColl(false)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setColl(false);
              say("Collection link created (mockup)");
            }}
          >
            <label className="pt-field">
              Title
              <input type="text" defaultValue="Homes picked for you" />
            </label>
            <div>
              {[...LISTINGS, { slug: "marina-gate-2br", title: "2 bed in Marina Gate 1" }].map(
                (l) => (
                  <label key={l.slug} className="pt-check">
                    <input type="checkbox" defaultChecked /> {l.title}
                  </label>
                ),
              )}
            </div>
            <button type="submit" className="btn btn-p">
              Create collection link
            </button>
          </form>
        </Sheet>
      )}
      {toast}
    </>
  );
}
