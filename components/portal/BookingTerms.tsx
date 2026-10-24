"use client";

import { useState } from "react";
import { money } from "@/lib/portal/billing";
import {
  BOOKING_TERMS,
  dueNow,
  packageSplit,
  shootDays,
  type TermsView,
} from "@/lib/portal/payments";
import { Sheet } from "./ui";

/**
 * "I agree to the Booking Terms" (owner, 24 Oct 2026): required before Confirm / Pay on every
 * booking (shoots, content, edits, AI avatars). The link opens the terms in a modal, with the full
 * Terms page linked from there.
 */
export function TermsCheck({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ gap: 4 }} data-testid="terms-check">
      <label className="bkp-terms">
        <input
          type="checkbox"
          name="terms"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error || undefined}
          required
        />
        <span>
          I agree to the{" "}
          <button
            type="button"
            className="bkp-link"
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
          >
            Booking Terms
          </button>
        </span>
      </label>
      {error && (
        <span className="bkp-terms-err" role="alert">
          {error}
        </span>
      )}
      {open && <TermsModal onClose={() => setOpen(false)} />}
    </div>
  );
}

export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Booking Terms" onClose={onClose}>
      <ol className="pt-terms-list" data-testid="terms-modal">
        {BOOKING_TERMS.map((t) => (
          <li key={t.title}>
            <b>{t.title}</b>
            <span className="bkp-muted">{t.text}</span>
          </li>
        ))}
      </ol>
      <p className="bkp-muted" style={{ margin: 0 }}>
        The full terms are on our{" "}
        <a href="/terms" target="_blank" rel="noopener">
          Terms page
        </a>
        .
      </p>
      <button type="button" className="btn btn-p btn-s" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}

/**
 * What's due now, by the client's term: "Due now: AED X (50% deposit)", or "Invoiced at the end of
 * the month". A value package client sees what the package covers and what's extra.
 */
export function DueNow({
  terms,
  estimate,
  currency,
  halfDays = 0,
  flexible = false,
}: {
  terms: TermsView;
  /** The estimate (null without price access). */
  estimate: number | null;
  currency: string;
  halfDays?: number;
  /** A flexible booking's estimate is the minimum ("from"). */
  flexible?: boolean;
}) {
  const m = (n: number) => money(currency, n);
  if (terms.package) {
    if (estimate == null) return null;
    const s = packageSplit(estimate, halfDays, terms.package);
    return (
      <div className="bkp-due" data-testid="due-now">
        <span className="bkp-muted">
          Your package ({terms.package.name}) covers {m(s.included)}
          {halfDays ? ` and ${shootDays(halfDays)}` : ""}
          {s.extra > 0 ? `; ${m(s.extra)} is an extra on your month-end invoice` : ""}. Left after
          this: {m(s.allowance_after)} · {shootDays(s.half_days_after)}.
        </span>
      </div>
    );
  }
  if (terms.terms === "month_end")
    return (
      <div className="bkp-due" data-testid="due-now">
        <span className="bkp-muted">Nothing to pay now: it’s on your month-end invoice.</span>
      </div>
    );
  const d = dueNow(terms.terms, estimate, terms.vat_rate);
  if (!d.total)
    return (
      <div className="bkp-due" data-testid="due-now">
        <span className="bkp-muted">We’ll send the invoice when we confirm.</span>
      </div>
    );
  return (
    <div className="bkp-due" data-testid="due-now">
      <div className="pt-row">
        <b className="bkp-sec">Due now</b>
        <b className="bkp-price">{m(d.total)}</b>
      </div>
      <span className="bkp-muted">
        {d.pct === 100 ? "100% before the shoot" : "50% now, the balance when it’s delivered"}
        {d.vat ? ` · incl. VAT ${m(d.vat)}` : ""}
        {flexible ? " · from the minimum; the final total follows the shoot" : ""}. Your booking is
        confirmed once it’s paid.
      </span>
    </div>
  );
}

/** The Confirm button's text by term: "Pay AED X now" (50% / 100% with card on), else "Request booking". */
export function confirmText(
  terms: TermsView,
  estimate: number | null,
  card: boolean,
  currency: string,
) {
  if (terms.package || terms.terms === "month_end") return "Request booking";
  const d = dueNow(terms.terms, estimate, terms.vat_rate);
  return d.total && card ? `Pay ${money(currency, d.total)} now` : "Request booking";
}

/** One line at the top of the summary: what the package has left, or what's due now. */
export function DueLine({
  terms,
  estimate,
  currency,
}: {
  terms: TermsView;
  estimate: number | null;
  currency: string;
}) {
  const m = (n: number) => money(currency, n);
  const text = terms.package
    ? `${terms.package.name}: ${m(terms.package.allowance_left)} and ${shootDays(terms.package.half_days_left)} left this month`
    : terms.terms === "month_end"
      ? "Nothing due now: it goes on your month-end invoice"
      : (() => {
          const d = dueNow(terms.terms, estimate, terms.vat_rate);
          return d.total
            ? `Due now: ${m(d.total)} (${d.pct === 100 ? "100% upfront" : "50% upfront, the rest on delivery"})`
            : null;
        })();
  if (!text) return null;
  return (
    <p className="bkp-dueline" data-testid="due-line">
      {text}
    </p>
  );
}
