"use client";

/* eslint-disable @next/next/no-img-element -- admin thumbnails */
import { cx } from "@/lib/cx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { reorder, setPublished } from "@/lib/admin/actions";
import { sectionByKey, type Row } from "@/lib/admin/sections";

const previewHref = (path: string) => `/admin/preview?path=${encodeURIComponent(path)}`;

/**
 * A section's list: filter by placement/page, drag (or arrow keys, or ↑↓ on desktop) to reorder,
 * publish or unpublish in one tap, open an item to edit it.
 */
export function ListView({
  sectionKey,
  rows: initial,
  extra,
}: {
  sectionKey: string;
  rows: Row[];
  /** Section-specific controls under the heading (e.g. proof-strip toggles on Clients). */
  extra?: ReactNode;
}) {
  const section = sectionByKey(sectionKey)!;
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  const filterValue = params.get("show") ?? "";
  const perValue = !!(filterValue && section.filter?.orderPerValue);

  const order = (r: Row) =>
    perValue
      ? Number(
          (r.placement_order as Record<string, number> | undefined)?.[filterValue] ?? r.sort_order,
        )
      : r.sort_order;
  const visible = useMemo(
    () =>
      rows
        .filter((r) => !filterValue || section.filter?.match(r, filterValue))
        .sort((a, b) => order(a) - order(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filterValue],
  );

  function commit(next: Row[]) {
    // Write the new positions back into the rows so the list stays in this order.
    let ids: string[];
    if (perValue) {
      ids = next.map((r) => r.id);
      setRows((all) =>
        all.map((r) => {
          const i = ids.indexOf(r.id);
          return i < 0
            ? r
            : { ...r, placement_order: { ...(r.placement_order as object), [filterValue]: i + 1 } };
        }),
      );
    } else {
      // Filtered by page: slot the reordered items back into their places in the full list.
      const global = [...rows].sort((a, b) => a.sort_order - b.sort_order);
      const slots = global
        .map((r, i) => (next.some((n) => n.id === r.id) ? i : -1))
        .filter((i) => i >= 0);
      slots.forEach((slot, k) => (global[slot] = next[k]));
      ids = global.map((r) => r.id);
      setRows(global.map((r, i) => ({ ...r, sort_order: i + 1 })));
    }
    start(async () => {
      const r = await reorder(sectionKey, ids, perValue ? filterValue : undefined);
      setStatus(
        r.ok
          ? { ok: true, text: "Order saved. Live in a few seconds." }
          : { ok: false, text: r.error ?? "Couldn't save the order." },
      );
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= visible.length || from === to) return;
    const next = [...visible];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    commit(next);
  }

  /* Pointer drag on the handle (mouse and touch). */
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; order: Row[] } | null>(null);
  function dragStart(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, order: visible });
  }
  function dragMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || !list.current) return;
    const items = [...list.current.querySelectorAll<HTMLElement>("[data-row]")];
    const from = drag.order.findIndex((r) => r.id === drag.id);
    let to = items.findIndex((el) => {
      const b = el.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (to < 0) to = items.length - 1;
    if (to !== from) {
      const next = [...drag.order];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      setDrag({ id: drag.id, order: next });
    }
  }
  function dragEnd() {
    if (!drag) return;
    const changed = drag.order.some((r, i) => r.id !== visible[i]?.id);
    setDrag(null);
    if (changed) commit(drag.order);
  }
  function keyMove(e: KeyboardEvent, i: number) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
    }
  }

  function toggle(r: Row) {
    const next = !r.published;
    setRows((all) => all.map((x) => (x.id === r.id ? { ...x, published: next } : x)));
    start(async () => {
      const res = await setPublished(sectionKey, r.id, next);
      if (!res.ok) {
        setRows((all) => all.map((x) => (x.id === r.id ? { ...x, published: !next } : x)));
        setStatus({ ok: false, text: res.error ?? "Couldn't change it." });
      } else
        setStatus({
          ok: true,
          text: `${section.title_of(r)}: ${next ? "published. Live in a few seconds." : "unpublished. Hidden from the site."}`,
        });
    });
  }

  const shown = drag?.order ?? visible;
  const newHref = `/admin/${sectionKey}/new${filterValue ? `?show=${filterValue}` : ""}`;
  const previewPath = section.preview(
    filterValue ? ({ page: filterValue, placements: [filterValue] } as unknown as Row) : shown[0],
  );

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">Content</span>
          <h1 className="ad-h1">{section.title}</h1>
        </div>
        <div className="ad-btns">
          <a
            className="ad-btn ghost"
            href={previewHref(previewPath)}
            target="_blank"
            rel="noopener"
          >
            Preview
          </a>
          <Link className="ad-btn" href={newHref} prefetch={false}>
            Add {section.singular}
          </Link>
        </div>
      </div>
      {section.help && <p className="ad-note">{section.help}</p>}
      {extra}
      {section.filter && (
        <div className="ad-filter">
          <label className="ad-eb" htmlFor="ad-filter">
            {section.filter.label}
          </label>
          <select
            id="ad-filter"
            value={filterValue}
            onChange={(e) =>
              router.replace(e.target.value ? `?show=${e.target.value}` : "?", { scroll: false })
            }
          >
            <option value="">All</option>
            {section.filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {perValue && (
            <span className="ad-small ad-muted">Drag to set the order on this placement.</span>
          )}
        </div>
      )}
      <p
        className={cx("ad-status", status && (status.ok ? "ok" : "error"))}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving…" : status?.text}
      </p>
      <div className="ad-list" ref={list}>
        {shown.length === 0 && <p className="ad-empty">Nothing here yet.</p>}
        {shown.map((r, i) => {
          const thumb = section.thumb
            ? (r[section.thumb] as { src?: string } | undefined)?.src
            : undefined;
          const title = section.title_of(r);
          return (
            <div
              className="ad-row"
              key={r.id}
              data-row
              data-dragging={drag?.id === r.id}
              data-testid={`row-${r.id}`}
            >
              <button
                type="button"
                className="ad-handle"
                aria-label={`Move “${title}”. Use the arrow keys.`}
                onPointerDown={(e) => dragStart(e, r.id)}
                onPointerMove={dragMove}
                onPointerUp={dragEnd}
                onPointerCancel={dragEnd}
                onKeyDown={(e) => keyMove(e, i)}
              >
                ⋮⋮
              </button>
              <Link className="ad-row-main" href={`/admin/${sectionKey}/${r.id}`} prefetch={false}>
                {section.thumb &&
                  (thumb ? (
                    <img className="ad-thumb" src={thumb} alt="" />
                  ) : (
                    <span className="ad-thumb" aria-hidden="true" />
                  ))}
                <div>
                  <div className="ad-row-title">{title}</div>
                  {section.meta_of && <div className="ad-row-meta">{section.meta_of(r)}</div>}
                </div>
              </Link>
              <div className="ad-row-side">
                <button
                  type="button"
                  className="ad-icon-btn ad-move"
                  aria-label={`Move “${title}” up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ad-icon-btn ad-move"
                  aria-label={`Move “${title}” down`}
                  disabled={i === shown.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`ad-pill ${r.published ? "live" : "draft"}`}
                  style={{ cursor: "pointer", height: 36 }}
                  aria-label={`${title}: ${r.published ? "published, tap to unpublish" : "draft, tap to publish"}`}
                  onClick={() => toggle(r)}
                >
                  {r.published ? "Live" : "Draft"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
