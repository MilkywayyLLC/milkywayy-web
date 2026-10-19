"use client";

import { SpringDialog } from "@/components/interior/modal";
import { Icon } from "@/components/portal/Icon";

/**
 * The video tour or 360° tour on a public share page: centred, with the spring dialogs' motion
 * (components/interior/modal). Loaded on tap (ShareClient), so the page doesn't ship Motion.
 */
export function ShareModal({
  label,
  onClose,
  children,
  aside,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <SpringDialog
      label={label}
      onClose={onClose}
      layerClass="sh-layer"
      panelClass="sh-modal"
      sheet={false}
    >
      <div className="sh-modal-head">
        <b>{label}</b>
        <span className="sh-modal-tools">
          {aside}
          <button type="button" className="sh-modal-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </span>
      </div>
      <div className="sh-modal-body">{children}</div>
    </SpringDialog>
  );
}
