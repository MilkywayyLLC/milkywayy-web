"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/portal/Icon";
import {
  discardDraft,
  loadDraft,
  saveDraft,
  type Draft,
  type DraftKind,
} from "@/lib/portal/draft-actions";

/* ---------- validation (owner, 10 Oct 2026): every portal form behaves the same ---------- */

type Rules = Record<string, string | false | null | undefined>;
const clean = (r: Rules) =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => !!v)) as Record<string, string>;

/** Where the form is: the topmost open modal or sheet, else the page. */
const scope = () => {
  const open = document.querySelectorAll<HTMLElement>(".pt-modal, .pt-sheet");
  return open.length ? open[open.length - 1] : document.body;
};

/** Scroll smoothly to the first invalid field (in page order) and focus it. */
function focusFirst(names: string[]) {
  const el = [...scope().querySelectorAll<HTMLElement>("[data-field]")].find((e) =>
    names.includes(e.dataset.field ?? ""),
  );
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = el.matches("input, select, textarea, button")
    ? el
    : el.querySelector<HTMLElement>("input, select, textarea, button");
  input?.focus({ preventScroll: true });
}

/**
 * Pass the rules (field → message when invalid). Nothing is checked until the first submit; from
 * then on errors update live, so each one clears as soon as its field is fixed. `check()` returns
 * whether the form may be sent; if not, it scrolls to and focuses the first invalid field.
 * Server errors go in the same banner (`fail`), so no form fails silently.
 */
export function useFormCheck(rules: () => Rules) {
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = tried ? clean(rules()) : {};
  const banner =
    serverError ?? (Object.keys(errors).length ? "Please fix the highlighted fields" : null);
  const check = () => {
    setTried(true);
    setServerError(null);
    const e = clean(rules());
    if (!Object.keys(e).length) return true;
    setTimeout(() => focusFirst(Object.keys(e)), 0);
    return false;
  };
  const fail = (message: string) => {
    setServerError(message || "Something went wrong. Try again.");
    setTimeout(
      () =>
        scope()
          .querySelector(".pt-form-banner")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };
  const reset = () => {
    setTried(false);
    setServerError(null);
  };
  return { errors, banner, check, fail, reset };
}

/** The red banner at the top of a form. */
export function FormBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="pt-form-banner" role="alert">
      {text}
    </p>
  );
}

/** A labelled field: * when required, red border and a short message when invalid. */
export function Field({
  name,
  label,
  required,
  error,
  hint,
  group,
  children,
}: {
  name: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  /** A group of buttons (no single input): a div with a group role instead of a label. */
  group?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="pt-field-label">
        {label}
        {required && (
          <span className="pt-req" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="pt-meta pt-field-hint">{hint}</span>}
      {error && <span className="pt-field-msg">{error}</span>}
    </>
  );
  const cls = `pt-field${error ? " is-bad" : ""}`;
  return group ? (
    <div className={cls} data-field={name} role="group" aria-label={String(label)}>
      {body}
    </div>
  ) : (
    <label className={cls} data-field={name}>
      {body}
    </label>
  );
}

/* ---------- modal: centred on desktop, a full-screen sheet with a sticky action bar on phones ---------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  title: string;
  /** Ask to close (the form decides: maybe the draft dialog first). */
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".pt-choice-bg")) close.current();
    };
    addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="pt-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="pt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div className="pt-modal-head">
          <span className="pt-h2">{title}</span>
          <button type="button" className="pt-icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="pt-modal-body">{children}</div>
        {footer && <div className="pt-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A small custom dialog with a few choices (never the browser's confirm()). */
export function ChoiceDialog({
  title,
  body,
  choices,
}: {
  title: string;
  body?: ReactNode;
  choices: { label: string; onClick: () => void; primary?: boolean }[];
}) {
  return (
    <div className="pt-choice-bg">
      <div className="pt-choice-box" role="alertdialog" aria-modal="true" aria-label={title}>
        <b>{title}</b>
        {body && (
          <p className="pt-meta" style={{ margin: 0 }}>
            {body}
          </p>
        )}
        <div className="pt-btns">
          {choices.map((c, i) => (
            <button
              key={c.label}
              type="button"
              autoFocus={i === 0}
              className={`btn btn-s ${c.primary ? "btn-p" : "btn-g"}`}
              onClick={c.onClick}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- drafts ---------- */

export const draftDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

/**
 * Autosave a form as its owner types (debounced, to the database). On open it looks for an earlier
 * draft and offers it (`offer`) unless `resume` is set, in which case it restores it straight away.
 * While an offer is open nothing is saved, so the old draft isn't overwritten by accident.
 */
export function useDraft<T extends Record<string, unknown>>(
  kind: DraftKind,
  snapshot: T,
  {
    touched,
    resume,
    onRestore,
    enabled = true,
  }: { touched: boolean; resume?: boolean; onRestore: (data: T) => void; enabled?: boolean },
) {
  const [offer, setOffer] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const restore = useRef(onRestore);
  useEffect(() => {
    restore.current = onRestore;
  }, [onRestore]);
  useEffect(() => {
    let live = true;
    if (!enabled) return;
    loadDraft(kind)
      .then((d) => {
        if (!live) return;
        if (d && resume) restore.current(d.data as T);
        else if (d) setOffer(d);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      live = false;
    };
  }, [kind, resume, enabled]);
  const json = JSON.stringify(snapshot);
  useEffect(() => {
    if (!enabled || !touched || offer || !ready) return;
    const t = setTimeout(() => void saveDraft(kind, JSON.parse(json)), 900);
    return () => clearTimeout(t);
  }, [json, touched, offer, ready, kind, enabled]);
  const saveNow = useCallback(() => saveDraft(kind, JSON.parse(json)), [kind, json]);
  const discard = useCallback(() => discardDraft(kind), [kind]);
  return {
    offer,
    continueOffer: () => {
      if (offer) restore.current(offer.data as T);
      setOffer(null);
    },
    startFresh: () => {
      setOffer(null);
      void discardDraft(kind);
    },
    saveNow,
    discard,
  };
}

/** "Continue your draft from 10 Oct, 14:20?" */
export function DraftOffer({
  offer,
  onContinue,
  onFresh,
}: {
  offer: Draft | null;
  onContinue: () => void;
  onFresh: () => void;
}) {
  if (!offer) return null;
  return (
    <div className="pt-draft-offer" role="status">
      <span>Continue your draft from {draftDate(offer.updated_at)}?</span>
      <span className="pt-btns">
        <button type="button" className="btn btn-p btn-s" onClick={onContinue}>
          Continue
        </button>
        <button type="button" className="btn btn-g btn-s" onClick={onFresh}>
          Start fresh
        </button>
      </span>
    </div>
  );
}

/**
 * Closing with unsaved input: "Keep as draft", "Discard", "Keep editing". Returns the guard to
 * call instead of closing, and the dialog to render.
 */
export function useCloseGuard({
  dirty,
  close,
  saveNow,
  discard,
}: {
  dirty: boolean;
  close: () => void;
  saveNow: () => Promise<unknown>;
  discard: () => Promise<unknown>;
}) {
  const [asking, setAsking] = useState(false);
  const request = () => (dirty ? setAsking(true) : close());
  const dialog = asking ? (
    <ChoiceDialog
      title="Leave this form?"
      body="You’ve started filling it in."
      choices={[
        {
          label: "Keep as draft",
          primary: true,
          onClick: () => {
            setAsking(false);
            void saveNow().finally(close);
          },
        },
        {
          label: "Discard",
          onClick: () => {
            setAsking(false);
            void discard().finally(close);
          },
        },
        { label: "Keep editing", onClick: () => setAsking(false) },
      ]}
    />
  ) : null;
  return { request, dialog };
}

/** Pages with a form: links clicked with unsaved input ask the same three questions first. */
export function useLeaveGuard(opts: {
  dirty: boolean;
  saveNow: () => Promise<unknown>;
  discard: () => Promise<unknown>;
}) {
  const [to, setTo] = useState<string | null>(null);
  const dirty = useRef(opts.dirty);
  useEffect(() => {
    dirty.current = opts.dirty;
  }, [opts.dirty]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirty.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setTo(url.pathname + url.search);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  const go = (href: string) => {
    dirty.current = false;
    location.assign(href);
  };
  return to ? (
    <ChoiceDialog
      title="Leave this page?"
      body="You’ve started filling in the form."
      choices={[
        {
          label: "Keep as draft",
          primary: true,
          onClick: () => void opts.saveNow().finally(() => go(to)),
        },
        { label: "Discard", onClick: () => void opts.discard().finally(() => go(to)) },
        { label: "Keep editing", onClick: () => setTo(null) },
      ]}
    />
  ) : null;
}
