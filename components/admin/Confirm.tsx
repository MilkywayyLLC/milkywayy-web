"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Change } from "@/lib/admin/fields";

/**
 * A modal confirmation. With `changes`, lists every change old → new (prices, settings) so
 * nothing goes live by accident.
 */
export function Confirm({
  open,
  title,
  children,
  changes,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  changes?: Change[];
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ad-dialog"
      aria-labelledby="ad-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="ad-dialog-body">
        <h2 className="ad-h2" id="ad-confirm-title">
          {title}
        </h2>
        {children}
        {changes && (
          <div className="ad-changes" data-testid="changes">
            {changes.map((c, i) => (
              <div className="ad-change" key={i}>
                <span className="ad-small ad-muted">{c.label}</span>
                <span>
                  <s>{c.old}</s> → <b>{c.new}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="ad-btns">
          <button
            type="button"
            className={`ad-btn${danger ? "danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
          <button type="button" className="ad-btn quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
