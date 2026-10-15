"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SpringDialog } from "@/components/interior/modal";
import {
  pinItem,
  setAutoFill,
  setHeroTemplate,
  setSectionOrder,
  unpinSlot,
} from "@/lib/admin/placement-actions";
import type { HeroTemplate, Mode } from "@/lib/placements";

export type PItem = {
  id: string;
  title: string;
  thumb?: string;
  published: boolean;
  sample: boolean;
  /** "9:16", "16:9" or "3:2". */
  ratio: string;
  type: string;
};
export type PBlock = {
  key: string;
  title: string;
  rule: string;
  ratio: string;
  count: number;
  kind: "hero" | "section" | "standalone" | "work";
  mode: Mode;
  /** Set while the page still uses its previous source (nothing pinned yet). */
  legacy?: string;
  slots: { slot: number; id: string; pinned: boolean }[];
  /** Ids a hand pick may choose: any item of a compatible type. */
  candidates: string[];
  lookup: "lib" | "pairs";
  uploadHref: string;
  path: string;
  hero?: {
    page: string;
    template: HeroTemplate;
    options: { value: HeroTemplate; label: string }[];
  };
};

const previewHref = (path: string) => `/admin/preview?path=${encodeURIComponent(path)}`;
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;

/** Admin → Pages: a tab per page, its blocks in site order. */
export function PagesBoard({
  tabs,
  tab,
  blocks,
  items,
  pairs,
  migrated,
}: {
  tabs: { key: string; label: string }[];
  tab: string;
  blocks: PBlock[];
  items: PItem[];
  pairs: PItem[];
  migrated: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [picking, setPicking] = useState<{ block: PBlock; slot: number }>();

  const run: Run = (fn, ok) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Didn’t save." });
      router.refresh();
    });

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Content</span>
          <h1 className="ad-h1">Pages</h1>
        </div>
      </div>
      <nav className="ad-chips" aria-label="Page" data-testid="pages-tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/pages?tab=${t.key}`}
            prefetch={false}
            aria-current={t.key === tab ? "true" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
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

      {blocks.map((b) => {
        const lookup = new Map((b.lookup === "pairs" ? pairs : items).map((i) => [i.id, i]));
        return b.kind === "hero" ? (
          <HeroBlock
            key={`${b.key}:${b.hero?.template}`}
            b={b}
            lookup={lookup}
            pending={pending}
            run={run}
            onPick={(slot) => setPicking({ block: b, slot })}
          />
        ) : (
          <SectionBlock
            key={`${b.key}:${b.mode}:${b.slots.map((s) => s.id).join(",")}`}
            b={b}
            lookup={lookup}
            pending={pending}
            run={run}
            onPick={(slot) => setPicking({ block: b, slot })}
          />
        );
      })}

      <Picker
        picking={picking}
        lookup={picking ? (picking.block.lookup === "pairs" ? pairs : items) : []}
        onClose={() => setPicking(undefined)}
        onChoose={(id) => {
          const p = picking!;
          setPicking(undefined);
          run(() => pinItem(p.block.key, p.slot, id), "Added.");
        }}
      />
    </div>
  );
}

const upload = (b: PBlock, slot: number) =>
  b.lookup === "pairs"
    ? b.uploadHref
    : `${b.uploadHref}?place=${b.key}:${slot}${b.hero ? `:${b.hero.template}` : ""}`;

function Head({ b, children }: { b: PBlock; children?: React.ReactNode }) {
  return (
    <div className="ad-row-side" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
      <div>
        <h2 className="ad-h2">
          {b.title} {b.kind === "standalone" && <span className="ad-pill">Manual block</span>}
        </h2>
        <p className="ad-pl-rule">{b.rule}</p>
      </div>
      <div className="ad-pl-actions">
        {children}
        <a
          className="ad-btn quiet small"
          href={previewHref(b.path)}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </a>
      </div>
    </div>
  );
}

function Thumb({ it, label }: { it?: PItem; label?: string }) {
  return it?.thumb ? (
    <img className="ad-pl-thumb" src={it.thumb} alt="" draggable={false} />
  ) : (
    <span className="ad-pl-thumb ad-pl-empty" aria-hidden="true">
      {label}
    </span>
  );
}

/** The hero: template dropdown, then one slot per picture the template shows. */
function HeroBlock({
  b,
  lookup,
  pending,
  run,
  onPick,
}: {
  b: PBlock;
  lookup: Map<string, PItem>;
  pending: boolean;
  run: Run;
  onPick: (slot: number) => void;
}) {
  const hero = b.hero!;
  const at = new Map(b.slots.map((s) => [s.slot, s]));
  const hidden = b.slots.filter((s) => s.slot >= b.count).length;
  return (
    <section className="ad-card" aria-label={b.title} data-testid={`placement-${b.key}`}>
      <Head b={b}>
        {hero.options.length > 1 ? (
          <label className="ad-small">
            Template{" "}
            <select
              className="ad-input"
              value={hero.template}
              disabled={pending}
              data-testid="hero-template"
              onChange={(e) =>
                run(
                  () => setHeroTemplate(hero.page, e.target.value as HeroTemplate),
                  "Template saved.",
                )
              }
            >
              {hero.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ad-small ad-muted">Template: {hero.options[0]?.label ?? ""}</span>
        )}
      </Head>
      {b.legacy && (
        <p className="ad-small ad-muted">
          Nothing picked: the page shows {b.legacy} until you pick something here.
        </p>
      )}
      <div className="ad-pl-slots" data-ratio={b.ratio}>
        {Array.from({ length: b.count }, (_, slot) => {
          const s = at.get(slot);
          const it = s ? lookup.get(s.id) : undefined;
          return (
            <div key={slot} className="ad-pl-slot" data-pinned={s ? true : undefined}>
              <Thumb it={it} label={`${b.ratio}`} />
              <span className="ad-pl-name" title={it?.title}>
                {slot + 1}. {it ? it.title : "Empty"}
              </span>
              <div className="ad-pl-actions">
                <button
                  type="button"
                  className="ad-btn ghost small"
                  disabled={pending}
                  onClick={() => onPick(slot)}
                >
                  Pick from library
                </button>
                <Link className="ad-btn quiet small" href={upload(b, slot)} prefetch={false}>
                  Upload new
                </Link>
                {s && (
                  <button
                    type="button"
                    className="ad-btn quiet small"
                    aria-label={`Remove slot ${slot + 1}`}
                    disabled={pending}
                    onClick={() => run(() => unpinSlot(b.key, slot), "Removed.")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <p className="ad-small ad-muted">
          {hidden} more picked item{hidden === 1 ? " isn’t" : "s aren’t"} shown with this template.
        </p>
      )}
    </section>
  );
}

/** A media section: thumbnails in live order, drag to pin the order, add, remove, auto-fill. */
function SectionBlock({
  b,
  lookup,
  pending,
  run,
  onPick,
}: {
  b: PBlock;
  lookup: Map<string, PItem>;
  pending: boolean;
  run: Run;
  onPick: (slot: number) => void;
}) {
  const [order, setOrder] = useState(b.slots.map((s) => s.id));
  const pinned = new Map(b.slots.map((s) => [s.id, s.pinned]));
  const auto = b.mode === "auto";
  const work = b.kind === "work";
  const full = b.count !== Infinity && order.length >= b.count;
  const next = b.slots.length ? Math.max(...b.slots.map((s) => s.slot)) + 1 : 0;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(ids);
    run(() => setSectionOrder(b.key, ids), "Order saved.");
  };

  return (
    <section className="ad-card" aria-label={b.title} data-testid={`placement-${b.key}`}>
      <Head b={b}>
        {b.kind === "section" && (
          <label className="ad-lib-work">
            <input
              type="checkbox"
              checked={auto}
              disabled={pending}
              data-testid="auto-fill"
              onChange={(e) =>
                run(
                  () => setAutoFill(b.key, e.target.checked),
                  e.target.checked ? "Auto-fill on." : "Auto-fill off.",
                )
              }
            />
            Auto-fill from library
          </label>
        )}
      </Head>
      {b.kind === "standalone" && (
        <p className="ad-small ad-muted">
          Picked by hand only: never auto-fills, and what you upload here stays off the Work page.
        </p>
      )}
      {work && (
        <p className="ad-small ad-muted">
          Everything with “On Work page” on, in Library order.{" "}
          <Link href="/admin/library">Reorder in Library →</Link>
        </p>
      )}
      {b.legacy && (
        <p className="ad-small ad-muted">
          Nothing picked: the page shows {b.legacy} until you pick something here.
        </p>
      )}
      {order.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={work ? undefined : onDragEnd}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <ul className="ad-pl-slots" data-ratio={b.ratio} data-testid="section-items">
              {order.map((id, i) => (
                <Card
                  key={id}
                  id={id}
                  index={i}
                  it={lookup.get(id)}
                  pinned={!!pinned.get(id)}
                  mismatch={ratioMismatch(b.ratio, lookup.get(id)?.ratio)}
                  locked={work}
                  canRemove={!work && (!auto || !!pinned.get(id))}
                  pending={pending}
                  onRemove={() => {
                    const slot = b.slots.find((s) => s.id === id)?.slot;
                    if (!auto) {
                      const ids = order.filter((x) => x !== id);
                      setOrder(ids);
                      run(() => setSectionOrder(b.key, ids), "Removed.");
                    } else if (slot !== undefined) run(() => unpinSlot(b.key, slot), "Unpinned.");
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="ad-small ad-muted">Nothing here yet.</p>
      )}
      {!work && (
        <div className="ad-pl-actions">
          <button
            type="button"
            className="ad-btn ghost small"
            disabled={pending || full}
            onClick={() => onPick(next)}
          >
            Add from library
          </button>
          <Link className="ad-btn quiet small" href={upload(b, next)} prefetch={false}>
            Upload new
          </Link>
          {full && (
            <span className="ad-small ad-muted">
              Full ({b.count}).{" "}
              {auto ? "Turn off auto-fill to choose by hand." : "Remove one to add another."}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function ratioMismatch(want: string, have?: string) {
  return /^\d+:\d+$/.test(want) && have && have !== want ? have : undefined;
}

function Card({
  id,
  index,
  it,
  pinned,
  mismatch,
  locked,
  canRemove,
  pending,
  onRemove,
}: {
  id: string;
  index: number;
  it?: PItem;
  pinned: boolean;
  mismatch?: string;
  locked: boolean;
  canRemove: boolean;
  pending: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  });
  return (
    <li
      ref={setNodeRef}
      className={`ad-pl-slot ${isDragging ? "is-drag" : ""}`}
      data-pinned={pinned || undefined}
      data-id={id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="ad-pl-cardwrap">
        <button
          type="button"
          className="ad-pl-drag"
          aria-label={`${index + 1}. ${it?.title ?? id}${locked ? "" : ". Press space to drag."}`}
          {...(locked ? {} : { ...attributes, ...listeners })}
        >
          <Thumb it={it} />
        </button>
        {canRemove && (
          <button
            type="button"
            className="ad-pl-x"
            aria-label={`Remove ${it?.title ?? id}`}
            disabled={pending}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <span className="ad-pl-name" title={it?.title}>
        {index + 1}. {it?.title ?? id}
        {it?.sample ? " · sample" : ""}
      </span>
      <span className="ad-small ad-muted">
        {pinned ? "Pinned" : "Auto"}
        {mismatch ? ` · ⚠ ${mismatch}` : ""}
      </span>
    </li>
  );
}

/** Library items of a compatible type, whatever their category. */
function Picker({
  picking,
  lookup,
  onClose,
  onChoose,
}: {
  picking?: { block: PBlock; slot: number };
  lookup: PItem[];
  onClose: () => void;
  onChoose: (id: string) => void;
}) {
  const ids = new Set(picking?.block.candidates ?? []);
  const taken = new Set(picking?.block.slots.map((s) => s.id));
  const list = lookup.filter((i) => ids.has(i.id) && !taken.has(i.id));

  return (
    <SpringDialog
      open={!!picking}
      onClose={onClose}
      labelledBy="pl-pick-title"
      layerClass="ad-layer"
      panelClass="ad-dialog"
    >
      {picking && (
        <div className="ad-dialog-body">
          <h2 className="ad-h2" id="pl-pick-title">
            {picking.block.title}: slot {picking.slot + 1}
          </h2>
          <p className="ad-pl-rule">
            Any{" "}
            {picking.block.lookup === "pairs" ? "before / after pair" : "library item of this type"}
            . A ⚠ means its ratio differs from this block’s {picking.block.ratio}; you can still use
            it.
          </p>
          {list.length ? (
            <div className="ad-pl-picker" data-testid="picker">
              {list.map((i) => {
                const bad = ratioMismatch(picking.block.ratio, i.ratio);
                return (
                  <button
                    key={i.id}
                    type="button"
                    className="ad-pl-pick"
                    onClick={() => onChoose(i.id)}
                  >
                    <Thumb it={i} />
                    <span className="ad-pl-name">{i.title}</span>
                    <span className="ad-small ad-muted">
                      {i.ratio}
                      {bad ? " ⚠" : ""}
                      {i.published ? "" : " · Draft"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="ad-small ad-muted">Nothing left in the library for this block.</p>
          )}
          <div>
            <button type="button" className="ad-btn ghost small" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </SpringDialog>
  );
}
