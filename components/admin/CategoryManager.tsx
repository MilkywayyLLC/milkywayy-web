"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Option } from "@/lib/admin/fields";
import { deleteCategory, renameCategory } from "@/lib/admin/placement-actions";
import { Confirm } from "./Confirm";

/**
 * Media library categories (Portfolio list): rename or delete. New ones are added by typing a
 * new name in an item's Category field.
 */
export function CategoryManager({
  categories,
  disabled,
}: {
  categories: Option[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [names, setNames] = useState(() =>
    Object.fromEntries(categories.map((c) => [c.value, c.label])),
  );
  const [status, setStatus] = useState<string>();
  const [removing, setRemoving] = useState<Option | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? ok : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <details className="ad-card">
      <summary className="ad-h2">Categories ({categories.length})</summary>
      <p className="ad-small ad-muted">
        Used by every media type. Type a new name in an item’s Category field to add one.
      </p>
      {categories.map((c) => (
        <div key={c.value} className="ad-row-side" style={{ justifyContent: "flex-start" }}>
          <input
            type="text"
            aria-label={`Name of ${c.label}`}
            maxLength={40}
            value={names[c.value] ?? ""}
            disabled={disabled || pending}
            onChange={(e) => setNames((n) => ({ ...n, [c.value]: e.target.value }))}
          />
          <button
            type="button"
            className="ad-btn ghost small"
            disabled={disabled || pending || names[c.value] === c.label}
            onClick={() => run(() => renameCategory(c.value, names[c.value] ?? ""), "Renamed.")}
          >
            Rename
          </button>
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={disabled || pending}
            onClick={() => setRemoving(c)}
          >
            Delete
          </button>
        </div>
      ))}
      <Confirm
        open={!!removing}
        title={`Delete “${removing?.label ?? ""}”?`}
        confirmLabel="Delete"
        danger
        busy={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const id = removing!.value;
          setRemoving(null);
          run(() => deleteCategory(id), "Deleted.");
        }}
      >
        <p>Items in it keep everything else and ask for a category on their next save.</p>
      </Confirm>
      {status && (
        <p className="ad-small" role="status">
          {status}
        </p>
      )}
    </details>
  );
}
