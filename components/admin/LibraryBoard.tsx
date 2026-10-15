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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setLibraryOrder, setShowOnWork } from "@/lib/admin/placement-actions";

export type LibraryRow = {
  id: string;
  title: string;
  thumb?: string;
  published: boolean;
  sample: boolean;
  showOnWork: boolean;
  /** Filter keys this item belongs to. */
  kinds: string[];
  meta: string;
  where: string[];
  flag?: string;
};

const CHIPS = [
  ["photos", "Photos"],
  ["reels", "Reels"],
  ["long-form", "Long-form"],
  ["avatars", "AI avatars"],
  ["360", "360"],
  ["editing", "Editing"],
] as const;

/** Admin → Library: filter chips, drag to reorder (saved at once), On Work page, Edit. */
export function LibraryBoard({
  items,
  counts,
  migrated,
}: {
  items: LibraryRow[];
  counts: Record<string, number>;
  migrated: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [order, setOrder] = useState(items);
  const [filter, setFilter] = useState<string>("all");
  const [toast, setToast] = useState<{ ok: boolean; text: string }>();
  // A fresh server list (after a save or an edit) replaces the local one.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setOrder(items);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.ok ? 1800 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const shown = filter === "all" ? order : order.filter((x) => x.kinds.includes(filter));

  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, rollback: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setToast({ ok: true, text: "Saved" });
        router.refresh();
      } else {
        rollback();
        setToast({ ok: false, text: r.error ?? "Didn’t save." });
      }
    });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = shown.map((x) => x.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const before = order;
    const byId = new Map(order.map((x) => [x.id, x]));
    // The filtered items trade places among the positions they already hold.
    let n = 0;
    const set = new Set(ids);
    setOrder(order.map((x) => (set.has(x.id) ? byId.get(next[n++])! : x)));
    save(
      () => setLibraryOrder(next),
      () => setOrder(before),
    );
  };

  const toggleWork = (x: LibraryRow) => {
    const before = order;
    setOrder(order.map((o) => (o.id === x.id ? { ...o, showOnWork: !x.showOnWork } : o)));
    save(
      () => setShowOnWork(x.id, !x.showOnWork),
      () => setOrder(before),
    );
  };

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Content</span>
          <h1 className="ad-h1">Library</h1>
        </div>
        <Link className="ad-btn" href="/admin/portfolio/new" prefetch={false}>
          Add item
        </Link>
      </div>
      <p className="ad-small ad-muted">
        This order is the order on the Work page, and the order automatic sections pick in. Drag to
        change it; it saves as you drop.
      </p>
      {!migrated && (
        <p className="ad-small ad-err" role="alert">
          The library-order update hasn’t been applied to this database yet, so dragging can’t be
          saved.
        </p>
      )}

      <nav className="ad-chips" aria-label="Filter" data-testid="library-chips">
        <button
          type="button"
          aria-current={filter === "all" ? "true" : undefined}
          onClick={() => setFilter("all")}
        >
          All <span className="ad-muted">{order.length}</span>
        </button>
        {CHIPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={filter === key ? "true" : undefined}
            onClick={() => setFilter(key)}
          >
            {label} <span className="ad-muted">{counts[key] ?? 0}</span>
          </button>
        ))}
      </nav>

      {shown.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <ul className="ad-lib" data-testid="library-list">
              {shown.map((x) => (
                <Row key={x.id} x={x} onToggleWork={() => toggleWork(x)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="ad-small ad-muted">Nothing in this filter yet.</p>
      )}

      {toast && (
        <div
          className={`ad-toast ${toast.ok ? "" : "error"}`}
          role="status"
          aria-live="polite"
          data-testid="library-toast"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Row({ x, onToggleWork }: { x: LibraryRow; onToggleWork: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: x.id,
  });
  return (
    <li
      ref={setNodeRef}
      className={`ad-lib-row ${isDragging ? "is-drag" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="library-row"
      data-id={x.id}
    >
      <button
        type="button"
        className="ad-handle"
        aria-label={`Drag ${x.title} to reorder`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {x.thumb ? (
        <img className="ad-lib-thumb" src={x.thumb} alt="" loading="lazy" draggable={false} />
      ) : (
        <span className="ad-lib-thumb" aria-hidden="true" />
      )}
      <div className="ad-lib-main">
        <b className="ad-lib-title">
          {x.title}
          {x.sample ? " · sample" : ""}
        </b>
        <span className="ad-small ad-muted">{x.meta}</span>
        <span className="ad-lib-tags">
          {x.where.map((w) => (
            <span key={w} className="ad-tag">
              {w}
            </span>
          ))}
        </span>
        {x.flag && <span className="ad-small ad-err">{x.flag}</span>}
      </div>
      <label className="ad-lib-work">
        <input type="checkbox" checked={x.showOnWork} onChange={onToggleWork} />
        On Work page
      </label>
      <span className={`ad-pill ${x.published ? "live" : ""}`}>
        {x.published ? "Live" : "Draft"}
      </span>
      <Link className="ad-btn ghost small" href={`/admin/portfolio/${x.id}`} prefetch={false}>
        Edit
      </Link>
    </li>
  );
}
