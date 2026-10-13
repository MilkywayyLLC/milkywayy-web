"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PlaceholderKey } from "@/content/types";
import { Icon } from "@/components/portal/Icon";
import { SpringDialog } from "@/components/interior/modal";

/** Placeholder "photo" (the site's mockup photography) at any aspect ratio. */
export function Ph({
  k,
  ratio = "4 / 3",
  className = "",
  children,
}: {
  k: PlaceholderKey;
  ratio?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`pt-ph ph-${k} ${className}`}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label="Photo"
    >
      {children}
    </div>
  );
}

/** Status stepper: done steps solid, the current one in brass, the rest grey. */
export function Stepper({
  steps,
  now,
  label,
}: {
  steps: readonly string[];
  now: string;
  label?: string;
}) {
  const at = steps.indexOf(now);
  const next = steps[at + 1];
  return (
    <div className="pt-steps-wrap">
      <ol className="pt-steps" aria-label={label ?? `Status: ${now}`}>
        {steps.map((s, i) => (
          <li
            key={s}
            className={i < at ? "pt-st-done" : i === at ? "pt-st-now" : undefined}
            aria-current={i === at ? "step" : undefined}
          >
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <span className="pt-steps-cap" aria-hidden="true">
        Step {at + 1} of {steps.length}: <b>{now}</b>
        {next && ` · next: ${next}`}
      </span>
    </div>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "solid" | "warn" | "ok" | "gold";
}) {
  return <span className={`pt-badge ${tone ?? ""}`}>{children}</span>;
}

/**
 * Bottom sheet on phone, centred dialog on desktop, with the spring dialogs' motion and focus
 * handling (components/interior/modal): Esc and a backdrop tap close it.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <SpringDialog label={title} onClose={onClose} layerClass="pt-sheet-bg" panelClass="pt-sheet">
      <div className="pt-sheet-head">
        <span className="pt-h2">{title}</span>
        <button type="button" className="pt-icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </SpringDialog>
  );
}

/** "Mockup: nothing is saved" confirmation after a fake action. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="pt-toast" role="status">
      <Icon name="check" size={16} /> {msg}
    </div>
  ) : null;
  return [node, setMsg] as const;
}

export function Back({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="pt-back">
      <Icon name="back" size={16} /> {label}
    </a>
  );
}

export const money = (cur: string, n: number) =>
  `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
