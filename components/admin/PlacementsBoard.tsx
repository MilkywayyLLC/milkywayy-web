"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pinItem, resetSection, unpinSlot } from "@/lib/admin/placement-actions";
import type { Mode } from "@/lib/placements";

export type BoardItem = {
  id: string;
  title: string;
  thumb?: string;
  published: boolean;
  sample: boolean;
};
export type BoardBlock = {
  key: string;
  page: string;
  title: string;
  rule: string;
  count: number;
  hero: boolean;
  mode: Mode;
  /** Set while the page still uses its previous source (nothing pinned yet). */
  legacy?: string;
  slots: { slot: number; id: string; pinned: boolean }[];
  /** Ids that match the rule, for Replace. */
  candidates: string[];
  newHref: string;
  path: string;
};

const previewHref = (path: string) => `/admin/preview?path=${encodeURIComponent(path)}`;

/** Admin → Placements: hero slots first, then each page's sections, as they are live now. */
export function PlacementsBoard({
  heroes,
  sections,
  items,
  pairs,
  migrated,
}: {
  heroes: BoardBlock[];
  sections: BoardBlock[];
  items: BoardItem[];
  pairs: BoardItem[];
  migrated: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [picking, setPicking] = useState<{ block: BoardBlock; slot: number }>();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Didn’t save." });
      if (r.ok) router.refresh();
    });

  const pages = [...new Set(sections.map((s) => s.page))];

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Content</span>
          <h1 className="ad-h1">Placements</h1>
        </div>
      </div>
      <p className="ad-small ad-muted">
        What each part of the site shows right now, in order. Sections fill themselves with the
        newest library items that match their rule; a pin holds an item in its slot regardless of
        newer uploads. A manual section shows only its pins. Hero slots are always set by hand.
      </p>
      {!migrated && (
        <p className="ad-small ad-err" role="alert">
          The placements update hasn’t been applied to this database yet: this shows the old
          placements, and changes can’t be saved until it is.
        </p>
      )}
      {status && (
        <p className={`ad-status ${status.ok ? "ok" : "error"}`} role="status" aria-live="polite">
          {status.text}
        </p>
      )}

      <section className="ad-card" aria-labelledby="pl-heroes">
        <h2 className="ad-h2" id="pl-heroes">
          Hero slots
        </h2>
        {heroes.map((b) => (
          <Block
            key={b.key}
            b={b}
            heading={`${b.page} · ${b.title}`}
            lookup={b.newHref.includes("before-after") ? pairs : items}
            pending={pending}
            onPick={(slot) => setPicking({ block: b, slot })}
            onUnpin={(slot) => run(() => unpinSlot(b.key, slot), "Removed.")}
            onPin={(slot, id) => run(() => pinItem(b.key, slot, id), "Pinned.")}
            onReset={() => run(() => resetSection(b.key), "Cleared.")}
          />
        ))}
      </section>

      {pages.map((page) => (
        <section key={page} className="ad-card" aria-label={page}>
          <h2 className="ad-h2">{page}</h2>
          {sections
            .filter((s) => s.page === page)
            .map((b) => (
              <Block
                key={b.key}
                b={b}
                heading={b.title}
                lookup={items}
                pending={pending}
                onPick={(slot) => setPicking({ block: b, slot })}
                onUnpin={(slot) => run(() => unpinSlot(b.key, slot), "Unpinned.")}
                onPin={(slot, id) => run(() => pinItem(b.key, slot, id), "Pinned.")}
                onReset={() => run(() => resetSection(b.key), "Back to automatic.")}
              />
            ))}
        </section>
      ))}

      <Picker
        picking={picking}
        lookup={picking?.block.newHref.includes("before-after") ? pairs : items}
        onClose={() => setPicking(undefined)}
        onChoose={(id) => {
          const p = picking!;
          setPicking(undefined);
          run(() => pinItem(p.block.key, p.slot, id), "Placed and pinned.");
        }}
      />
    </div>
  );
}

function Block({
  b,
  heading,
  lookup,
  pending,
  onPick,
  onPin,
  onUnpin,
  onReset,
}: {
  b: BoardBlock;
  heading: string;
  lookup: BoardItem[];
  pending: boolean;
  onPick: (slot: number) => void;
  onPin: (slot: number, id: string) => void;
  onUnpin: (slot: number) => void;
  onReset: () => void;
}) {
  const byId = new Map(lookup.map((i) => [i.id, i]));
  const next = b.slots.length ? Math.max(...b.slots.map((s) => s.slot)) + 1 : 0;
  const canAdd = b.slots.length < b.count;
  const pinned = b.slots.some((s) => s.pinned);
  const upload = (slot: number) =>
    b.newHref.includes("before-after") ? b.newHref : `${b.newHref}?place=${b.key}:${slot}`;

  return (
    <div className="ad-pl" data-testid={`placement-${b.key}`}>
      <div className="ad-row-side" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h3 className="ad-row-title">
            {heading}{" "}
            {!b.hero && (
              <span className={`ad-pill ${b.mode === "auto" ? "live" : ""}`}>
                {b.mode === "auto" ? "Automatic" : "Manual"}
              </span>
            )}
          </h3>
          <p className="ad-pl-rule">{b.rule}</p>
        </div>
        <div className="ad-pl-actions">
          <a
            className="ad-btn quiet small"
            href={previewHref(b.path)}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          {(pinned || b.mode === "manual") && (
            <button
              type="button"
              className="ad-btn quiet small"
              disabled={pending}
              onClick={onReset}
            >
              {b.hero ? "Clear" : "Reset to automatic"}
            </button>
          )}
        </div>
      </div>
      {b.legacy && (
        <p className="ad-small ad-muted">
          Nothing pinned: the page shows {b.legacy} until you pick something here.
        </p>
      )}
      <div className="ad-pl-slots">
        {b.slots.map((s) => {
          const it = byId.get(s.id);
          return (
            <div key={s.slot} className="ad-pl-slot" data-pinned={s.pinned || undefined}>
              {it?.thumb ? (
                <img className="ad-pl-thumb" src={it.thumb} alt="" />
              ) : (
                <span className="ad-pl-thumb" aria-hidden="true" />
              )}
              <span className="ad-pl-name" title={it?.title}>
                {s.slot + 1}. {it?.title ?? s.id}
                {it?.sample ? " · sample" : ""}
              </span>
              <span className="ad-small ad-muted">{s.pinned ? "Pinned" : "Automatic"}</span>
              <div className="ad-pl-actions">
                <button
                  type="button"
                  className="ad-btn ghost small"
                  disabled={pending}
                  onClick={() => onPick(s.slot)}
                >
                  Replace
                </button>
                {s.pinned ? (
                  <button
                    type="button"
                    className="ad-btn quiet small"
                    disabled={pending}
                    onClick={() => onUnpin(s.slot)}
                  >
                    Unpin
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ad-btn quiet small"
                    disabled={pending}
                    onClick={() => onPin(s.slot, s.id)}
                  >
                    Pin
                  </button>
                )}
                <Link className="ad-btn quiet small" href={upload(s.slot)} prefetch={false}>
                  Upload new
                </Link>
              </div>
            </div>
          );
        })}
        {canAdd && (
          <div className="ad-pl-slot">
            <span className="ad-pl-thumb" aria-hidden="true" />
            <span className="ad-pl-name">
              {next + 1}. {b.slots.length ? "Empty" : "Nothing here yet"}
            </span>
            <div className="ad-pl-actions">
              <button
                type="button"
                className="ad-btn ghost small"
                disabled={pending}
                onClick={() => onPick(next)}
              >
                Choose
              </button>
              <Link className="ad-btn quiet small" href={upload(next)} prefetch={false}>
                Upload new
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Library items that match the section's rule. */
function Picker({
  picking,
  lookup = [],
  onClose,
  onChoose,
}: {
  picking?: { block: BoardBlock; slot: number };
  lookup?: BoardItem[];
  onClose: () => void;
  onChoose: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (picking && !d.open) d.showModal();
    if (!picking && d.open) d.close();
  }, [picking]);
  const ids = new Set(picking?.block.candidates ?? []);
  const list = lookup.filter((i) => ids.has(i.id));

  return (
    <dialog ref={ref} className="ad-dialog" onClose={onClose} aria-labelledby="pl-pick-title">
      {picking && (
        <div className="ad-dialog-body">
          <h2 className="ad-h2" id="pl-pick-title">
            {picking.block.title}: slot {picking.slot + 1}
          </h2>
          <p className="ad-pl-rule">{picking.block.rule}</p>
          {list.length ? (
            <div className="ad-pl-picker">
              {list.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="ad-pl-pick"
                  onClick={() => onChoose(i.id)}
                >
                  {i.thumb ? (
                    <img className="ad-pl-thumb" src={i.thumb} alt="" />
                  ) : (
                    <span className="ad-pl-thumb" aria-hidden="true" />
                  )}
                  <span className="ad-pl-name">{i.title}</span>
                  {!i.published && <span className="ad-small ad-muted">Draft</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="ad-small ad-muted">Nothing in the library matches this rule yet.</p>
          )}
          <div>
            <button type="button" className="ad-btn ghost small" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
