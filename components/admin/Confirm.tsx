"use client";

import { useId, useRef, type ReactNode } from "react";
import { SpringDialog } from "@/components/interior/modal";
import type { Change } from "@/lib/admin/fields";

/**
 * A modal confirmation (spring dialog, components/interior/modal). With `changes`, lists every
 * change old → new (prices, settings) so nothing goes live by accident. A `danger` confirm puts
 * Cancel first and focused, the red action on the right, and doesn't close on a backdrop click.
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
  const titleId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = (
    <button
      type="button"
      className={danger ? "ad-btn danger" : "ad-btn"}
      onClick={onConfirm}
      disabled={busy}
    >
      {busy ? "Working…" : confirmLabel}
    </button>
  );
  const no = (
    <button ref={cancel} type="button" className="ad-btn quiet" onClick={onCancel} disabled={busy}>
      Cancel
    </button>
  );
  return (
    <SpringDialog
      open={open}
      onClose={() => !busy && onCancel()}
      role={danger ? "alertdialog" : "dialog"}
      labelledBy={titleId}
      closeOnBackdrop={!danger}
      initialFocusRef={danger ? cancel : undefined}
      layerClass="ad-layer"
      panelClass="ad-dialog"
    >
      <div className="ad-dialog-body">
        <h2 className="ad-h2" id={titleId}>
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
        <div className="ad-btns" data-danger={danger || undefined}>
          {danger ? (
            <>
              {no}
              {confirm}
            </>
          ) : (
            <>
              {confirm}
              {no}
            </>
          )}
        </div>
      </div>
    </SpringDialog>
  );
}
