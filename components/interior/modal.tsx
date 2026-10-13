"use client";

/*
 * Modal behaviour from interior.dev (https://www.interior.dev/docs/modal), copied from its
 * registry (r/modal.json): `useModal` is theirs unchanged (scroll lock, inert siblings, Escape
 * stack, focus trap and return, backdrop click that started outside). The surface below,
 * SpringDialog, is ours: it keeps the Viewfinder look (each caller's own classes) and adopts
 * interior's motion: backdrop fade, panel spring from 0.96, a quick ease-out exit, a bottom
 * sheet that springs up on phones and a plain fade with reduced motion.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";

const EASE = [0.23, 1, 0.32, 1] as const;

const SURFACE = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "summary",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex !== -1 &&
      !el.hasAttribute("inert") &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.getClientRects().length > 0,
  );
}

let locks = 0;
let releaseLock: (() => void) | null = null;

function lockDocumentScroll() {
  locks += 1;
  if (locks > 1) return;

  const body = document.body;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  const overflow = body.style.overflow;
  const paddingRight = body.style.paddingRight;
  const base = Number.parseFloat(window.getComputedStyle(body).paddingRight);

  body.style.overflow = "hidden";
  if (gap > 0) {
    body.style.paddingRight = `${(Number.isFinite(base) ? base : 0) + gap}px`;
  }

  releaseLock = () => {
    body.style.overflow = overflow;
    body.style.paddingRight = paddingRight;
  };
}

function unlockDocumentScroll() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  releaseLock?.();
  releaseLock = null;
}

const stack: object[] = [];

/*
 * Milkywayy: `inert` on the page behind a dialog is reference-counted. Two stacked dialogs that
 * close in the same commit (a form and its "save draft?" prompt) used to restore each other's
 * snapshot in the wrong order and leave the whole page inert until a refresh, so "Book media"
 * wouldn't open again. Now the attribute goes only when the last dialog releases it, and an
 * element that was inert before any dialog keeps it.
 */
const inertHolds = new WeakMap<Element, { n: number; had: boolean }>();
function holdInert(el: Element) {
  const h = inertHolds.get(el) ?? { n: 0, had: el.hasAttribute("inert") };
  h.n += 1;
  inertHolds.set(el, h);
  el.setAttribute("inert", "");
}
function releaseInert(el: Element) {
  const h = inertHolds.get(el);
  if (!h) return;
  h.n -= 1;
  if (h.n > 0) return;
  inertHolds.delete(el);
  if (!h.had) el.removeAttribute("inert");
}

export type UseModalOptions = {
  open: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  lockScroll?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  container?: HTMLElement | null;
};

export type ModalOverlayProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent) => void;
};

export type ModalPanelProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  role: "dialog";
  "aria-modal": true;
  "aria-labelledby": string;
  tabIndex: -1;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

export type UseModalResult = {
  target: HTMLElement | null;
  titleId: string;
  descriptionId: string;
  overlayProps: ModalOverlayProps;
  panelProps: ModalPanelProps;
  close: () => void;
};

export function useModal({
  open,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  lockScroll = true,
  initialFocusRef,
  container,
}: UseModalOptions): UseModalResult {
  // Milkywayy: derived instead of set in an effect (lint), same result.
  const target =
    container === undefined ? (typeof document === "undefined" ? null : document.body) : container;

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const downedOutside = useRef(false);

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const latest = useRef({ onClose, closeOnEscape, closeOnBackdrop, initialFocusRef });
  // Milkywayy: updated after render rather than during it (lint), same result.
  useIsomorphicLayoutEffect(() => {
    latest.current = { onClose, closeOnEscape, closeOnBackdrop, initialFocusRef };
  });

  const close = useCallback(() => latest.current.onClose(), []);

  useIsomorphicLayoutEffect(() => {
    if (!open || !lockScroll) return;
    lockDocumentScroll();
    return () => unlockDocumentScroll();
  }, [open, lockScroll]);

  useEffect(() => {
    if (!open || !target) return;
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    if (!overlay || !parent) return;

    const held = Array.from(parent.children).filter((child) => child !== overlay);
    held.forEach(holdInert);
    return () => held.forEach(releaseInert);
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (stack[stack.length - 1] !== token) return;
      if (!latest.current.closeOnEscape) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = stack.indexOf(token);
      if (index > -1) stack.splice(index, 1);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    const onFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      const node = event.target as Node | null;
      if (!panel || !node || panel.contains(node)) return;
      panel.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open, target]);

  useEffect(() => {
    if (!open || !target) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = latest.current.initialFocusRef?.current;
    (preferred ?? focusableWithin(panel)[0] ?? panel).focus({ preventScroll: true });

    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, target]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    const items = focusableWithin(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    const panel = panelRef.current;
    downedOutside.current = !panel?.contains(event.target as Node);
  }, []);

  const onClick = useCallback((event: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!latest.current.closeOnBackdrop) return;
    if (panel?.contains(event.target as Node)) return;
    if (!downedOutside.current) return;
    downedOutside.current = false;
    latest.current.onClose();
  }, []);

  return {
    target,
    titleId,
    descriptionId,
    overlayProps: { ref: overlayRef, onPointerDown, onClick },
    panelProps: {
      ref: panelRef,
      role: "dialog",
      "aria-modal": true,
      "aria-labelledby": titleId,
      tabIndex: -1,
      onKeyDown,
    },
    close,
  };
}

/* ---------- SpringDialog (Milkywayy surface) ---------- */

const PHONE = "(max-width: 640px)";
const EXIT_MS = 140;

/**
 * Plays the exit on a copy of the dialog once React has removed it, so every way of closing
 * animates out, including a parent that simply stops rendering it.
 */
function ghostExit(layer: HTMLElement, parent: HTMLElement, sheet: boolean) {
  if (layer.isConnected) return; // React StrictMode's rehearsal unmount: nothing was removed
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const copy = layer.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.style.pointerEvents = "none";
  (parent.isConnected ? parent : document.body).appendChild(copy);
  const veil = copy.querySelector<HTMLElement>(".spr-veil");
  const panel = copy.querySelector<HTMLElement>(".spr-panel");
  const opts = {
    duration: reduced ? 100 : EXIT_MS,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    fill: "forwards" as const,
  };
  veil?.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const to = reduced
    ? { opacity: 0 }
    : sheet
      ? { opacity: 0, transform: "translateY(32px)" }
      : { opacity: 0, transform: "scale(0.98) translateY(6px)" };
  const run = panel?.animate([{}, to], opts);
  const done = () => copy.remove();
  if (run) run.onfinish = done;
  else setTimeout(done, EXIT_MS);
}

export type SpringDialogProps = {
  /** Mounted and open by default; pass false to keep it mounted but closed. */
  open?: boolean;
  onClose: () => void;
  /** Accessible name, unless `labelledBy` points at a heading inside. */
  label?: string;
  labelledBy?: string;
  role?: "dialog" | "alertdialog";
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** The layer (positioning) and panel classes: each dialog keeps its own look. */
  layerClass: string;
  panelClass: string;
  /** Phones: the panel springs up from the bottom edge as a sheet. */
  sheet?: boolean;
  testId?: string;
  children: ReactNode;
};

export function SpringDialog({
  open = true,
  onClose,
  label,
  labelledBy,
  role = "dialog",
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  layerClass,
  panelClass,
  sheet = true,
  testId,
  children,
}: SpringDialogProps) {
  const reduced = useReducedMotion();
  const [phone] = useState(() => typeof window !== "undefined" && matchMedia(PHONE).matches);
  const asSheet = sheet && phone;
  // Portal into the nearest themed root (admin, portal, light/dark section) so the dialog keeps
  // that tone's colours and fonts; the page body otherwise.
  const anchor = useRef<HTMLSpanElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const a = anchor.current;
    setRoot(a?.parentElement?.closest<HTMLElement>(".ad, .pt, [data-tone]") ?? document.body);
  }, []);
  const { target, overlayProps, panelProps } = useModal({
    open,
    onClose,
    closeOnEscape,
    closeOnBackdrop,
    initialFocusRef,
    container: root,
  });

  // Keep the last rendered layer so the exit can copy it after React removes it.
  const last = useRef<{ el: HTMLElement; parent: HTMLElement } | null>(null);
  useLayoutEffect(() => {
    const el = overlayProps.ref.current;
    if (el?.parentElement) last.current = { el, parent: el.parentElement };
  });
  useLayoutEffect(() => {
    if (!open) return;
    return () => {
      const l = last.current;
      if (l) queueMicrotask(() => ghostExit(l.el, l.parent, asSheet));
    };
  }, [open, asSheet]);

  const here = <span ref={anchor} hidden />;
  if (!target || !open) return here;
  const from = reduced
    ? { opacity: 0 }
    : asSheet
      ? { opacity: 1, y: "100%" }
      : { opacity: 0, scale: 0.96, y: 12 };
  const to = reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 };
  const spring = reduced
    ? { duration: 0.12 }
    : { ...SURFACE, opacity: { duration: 0.16, ease: EASE } };

  const layer = createPortal(
    <LazyMotion features={domAnimation} strict>
      <div
        {...overlayProps}
        className={`spr-layer ${layerClass}`}
        data-sheet={asSheet || undefined}
      >
        <m.div
          className="spr-veil"
          aria-hidden="true"
          style={{ touchAction: "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0.12 : 0.2, ease: EASE }}
        />
        <m.div
          {...panelProps}
          role={role}
          aria-label={label}
          aria-labelledby={labelledBy}
          data-testid={testId}
          className={`spr-panel ${panelClass}`}
          initial={from}
          animate={to}
          transition={spring}
        >
          {children}
        </m.div>
      </div>
    </LazyMotion>,
    target,
  );
  return (
    <>
      {here}
      {layer}
    </>
  );
}
