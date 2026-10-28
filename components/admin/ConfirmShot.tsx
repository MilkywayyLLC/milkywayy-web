"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { money } from "@/lib/portal/billing";
import {
  LONG_LENGTHS,
  roundUpLength,
  shotDiff,
  shotNote,
  type ContentPrices,
  type ShotPlan,
} from "@/lib/portal/booking";
import { confirmShot, refundCredit, type ShootResult } from "@/lib/portal/shoot-actions";

export type ShotConfirmation = {
  booked: ShotPlan;
  actual: ShotPlan;
  lines: { description: string; qty: number; unit_price: number }[];
  booked_total: number;
  actual_total: number;
  diff: number;
  outcome: string;
  note: string | null;
  confirmed_by: string | null;
  confirmed_at: string;
  invoice_number: string | null;
  invoice_status: string | null;
  credit: {
    id: string;
    amount: number;
    remaining: number;
    status: string;
    applied: { number: string | null; amount: number }[];
    card: boolean;
  } | null;
};

const OUTCOME: Record<string, string> = {
  invoice: "Adjustment invoice",
  balance: "Balance on delivery follows the actual",
  credit: "Account credit",
  usage: "Package usage adjusted",
  month_end: "Month-end invoice at the actual",
  none: "No change to invoices",
};

function Note({ r, pending }: { r?: ShootResult; pending?: boolean }) {
  if (pending) return <span className="ad-small ad-muted">Saving…</span>;
  if (!r) return null;
  return (
    <span className={r.ok ? "ad-small" : "ad-err"} role={r.ok ? "status" : "alert"}>
      {r.ok ? r.notice : r.error}
    </span>
  );
}

const hoursText = (h: number) => `${h.toLocaleString("en-US")} h`;
const HOUR_STEPS = Array.from({ length: 32 }, (_, i) => (i + 1) / 2);

/**
 * Confirm what we shot (owner, 28 Oct 2026): a v2 content shoot's booked vs actual side by side. Edit
 * what differs (shoot length in 30-minute steps, short-form count, each long-form's final length,
 * raw files); the lines and the total update live at the booking's prices. Required before the
 * booking can be delivered. More = an adjustment invoice (downloads locked until paid); less = a
 * smaller balance (50%), an account credit (paid in full) or package usage.
 */
export function ConfirmShot({
  project,
  currency,
  booked,
  prices,
  done,
  terms,
}: {
  project: string;
  currency: string;
  booked: ShotPlan;
  prices: ContentPrices;
  done: ShotConfirmation | null;
  /** "package" | "month_end" | "split" | "prepay": what less or more turns into. */
  terms: string | null;
}) {
  const router = useRouter();
  const [actual, setActual] = useState<ShotPlan>({
    ...booked,
    longs: [...booked.longs],
    extra: null,
  });
  /** A long-form's finished length as typed (minutes), rounded up on blur. */
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [r, setR] = useState<ShootResult>();
  const [pending, start] = useTransition();
  const m = (n: number) => money(currency, n);

  if (done) return <Confirmed project={project} currency={currency} c={done} />;

  let calc: ReturnType<typeof shotDiff> | null = null;
  let missing = "";
  try {
    calc = shotDiff(booked, actual, prices);
  } catch (e) {
    missing = e instanceof Error ? e.message : "A price is missing.";
  }
  const auto = calc ? shotNote(booked, actual, calc.lines) : "";
  const set = (patch: Partial<ShotPlan>) => setActual((a) => ({ ...a, ...patch }));
  const setLong = (i: number, min: number) =>
    set({ longs: actual.longs.map((x, j) => (j === i ? min : x)) });
  const less =
    terms === "package"
      ? "package usage goes down"
      : terms === "month_end"
        ? "their month-end invoice is lower"
        : terms === "split"
          ? "the balance invoice is reduced"
          : "an account credit comes off their next invoice";
  const more =
    terms === "package"
      ? "package usage goes up"
      : terms === "month_end"
        ? "it’s on their month-end invoice"
        : "an adjustment invoice is issued; downloads stay locked until it’s paid";

  const row = (label: string, b: string, a: React.ReactNode) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{b}</td>
      <td>{a}</td>
    </tr>
  );

  return (
    <section
      className="ad-card ad-form"
      aria-label="Confirm what we shot"
      data-testid="confirm-shot"
    >
      <div className="ad-row-between">
        <h2 className="ad-h2 ad-m0">Confirm what we shot</h2>
        <span className="ad-small ad-muted">Required before delivery</span>
      </div>
      <p className="ad-small ad-muted ad-m0">
        Change only what differs. More than booked: {more}. Less: {less}. A shorter shoot isn’t
        credited.
      </p>
      <table className="ad-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Booked</th>
            <th scope="col">Actual</th>
          </tr>
        </thead>
        <tbody>
          {row(
            "Shoot length",
            hoursText(booked.hours),
            <select
              aria-label="Actual shoot length"
              value={actual.hours}
              onChange={(e) => set({ hours: Number(e.target.value) })}
            >
              {HOUR_STEPS.map((h) => (
                <option key={h} value={h}>
                  {hoursText(h)}
                </option>
              ))}
            </select>,
          )}
          {row(
            "Short-form edits",
            String(booked.short),
            <input
              aria-label="Actual short-form edits"
              type="number"
              min={0}
              max={100}
              value={actual.short}
              onChange={(e) => set({ short: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />,
          )}
          {Array.from({ length: Math.max(booked.longs.length, actual.longs.length) }, (_, i) => {
            const b = booked.longs[i];
            const a = actual.longs[i];
            return row(
              `Long-form ${i + 1}`,
              b != null ? `${b} min` : "—",
              a != null ? (
                <span className="ad-btns">
                  <input
                    aria-label={`Long-form ${i + 1}: final length in minutes`}
                    inputMode="numeric"
                    value={typed[i] ?? String(a)}
                    onChange={(e) => setTyped((t) => ({ ...t, [i]: e.target.value }))}
                    onBlur={() => {
                      const n = Number(typed[i]);
                      const up = roundUpLength(n);
                      if (typed[i] != null && up) setLong(i, up);
                      setTyped((t) => {
                        const { [i]: _, ...rest } = t;
                        void _;
                        return rest;
                      });
                      if (typed[i] != null && n > 30)
                        setR({
                          ok: false,
                          error:
                            "Over 30 min is a custom quote: keep 30 and add the rest as Other.",
                        });
                    }}
                    style={{ width: "5em" }}
                  />
                  <span className="ad-small ad-muted">min</span>
                  <button
                    type="button"
                    className="ad-icon-btn"
                    aria-label={`Not made: long-form ${i + 1}`}
                    onClick={() => set({ longs: actual.longs.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="ad-small ad-muted">Not made</span>
              ),
            );
          })}
          {row(
            "Raw files",
            booked.raw ? "Yes" : "No",
            <label className="ad-check ad-small">
              <input
                type="checkbox"
                checked={actual.raw}
                onChange={(e) => set({ raw: e.target.checked })}
              />
              <span>Delivered</span>
            </label>,
          )}
          {row(
            "Other",
            "—",
            <span className="ad-btns">
              <input
                aria-label="Other: what it is"
                placeholder="e.g. Long-form 3: 38 min (custom quote)"
                maxLength={120}
                value={actual.extra?.description ?? ""}
                onChange={(e) =>
                  set({ extra: { description: e.target.value, amount: actual.extra?.amount ?? 0 } })
                }
              />
              <input
                aria-label="Other: amount"
                inputMode="decimal"
                placeholder="0"
                style={{ width: "6em" }}
                value={actual.extra?.amount || ""}
                onChange={(e) =>
                  set({
                    extra: {
                      description: actual.extra?.description ?? "",
                      amount: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </span>,
          )}
        </tbody>
      </table>
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={actual.longs.length >= 10}
          onClick={() => set({ longs: [...actual.longs, LONG_LENGTHS[1]] })}
        >
          Add a long-form
        </button>
      </div>
      {missing && (
        <p className="ad-err" role="alert">
          {missing}
        </p>
      )}
      {calc && (
        <div data-testid="confirm-lines">
          {calc.lines.length ? (
            <ul className="ad-small ad-m0">
              {calc.lines.map((l, i) => (
                <li key={i}>
                  {l.description}{" "}
                  <b className="ad-mono">
                    {l.unit_price > 0 ? "+" : "−"}
                    {m(Math.abs(l.unit_price))}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-small ad-m0">As booked: no change.</p>
          )}
          <p className="ad-small ad-m0">
            Booked {m(calc.bookedTotal)} → actual <b>{m(calc.actualTotal)}</b>
            {calc.diff ? ` (${calc.diff > 0 ? "+" : "−"}${m(Math.abs(calc.diff))})` : ""}
          </p>
        </div>
      )}
      <label className="ad-field">
        <span className="ad-small">Note for the client (on the booking)</span>
        <input
          maxLength={500}
          value={note ?? auto}
          placeholder="Updated after the shoot: …"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="ad-btns ad-center">
        <button
          type="button"
          className="ad-btn small"
          disabled={pending || !calc}
          onClick={() =>
            start(async () => {
              const res = await confirmShot(project, actual, note ?? auto);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          Confirm what we shot
        </button>
        <Note r={r} pending={pending} />
      </div>
    </section>
  );
}

/** After confirming: what was decided, and the credit's "Refund to card instead". */
function Confirmed({
  project,
  currency,
  c,
}: {
  project: string;
  currency: string;
  c: ShotConfirmation;
}) {
  const router = useRouter();
  const [r, setR] = useState<ShootResult>();
  const [pending, start] = useTransition();
  const m = (n: number) => money(currency, n);
  const credit = c.credit;
  return (
    <section
      className="ad-card ad-form"
      aria-label="Confirm what we shot"
      data-testid="confirm-shot"
    >
      <div className="ad-row-between">
        <h2 className="ad-h2 ad-m0">What we shot</h2>
        <span className="ad-small ad-muted">
          Confirmed{c.confirmed_by ? ` by ${c.confirmed_by}` : ""} ·{" "}
          {new Date(c.confirmed_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}
        </span>
      </div>
      {c.lines.length ? (
        <ul className="ad-small ad-m0">
          {c.lines.map((l, i) => (
            <li key={i}>
              {l.description}{" "}
              <b className="ad-mono">
                {Number(l.unit_price) > 0 ? "+" : "−"}
                {m(Math.abs(Number(l.unit_price)))}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-small ad-m0">As booked.</p>
      )}
      <p className="ad-small ad-m0">
        Booked {m(Number(c.booked_total))} → actual <b>{m(Number(c.actual_total))}</b> ·{" "}
        {OUTCOME[c.outcome] ?? c.outcome}
        {c.invoice_number ? ` ${c.invoice_number} (${c.invoice_status})` : ""}
      </p>
      {c.note && <p className="ad-small ad-muted ad-m0">Client sees: “{c.note}”</p>}
      {credit && (
        <div className="ad-btns">
          <span className="ad-small">
            Credit {m(Number(credit.amount))}
            {credit.status === "open"
              ? ` · ${m(Number(credit.remaining))} left, comes off their next invoice`
              : credit.status === "applied"
                ? ` · applied${credit.applied.map((a) => (a.number ? ` to ${a.number}` : "")).join(",")}`
                : credit.status === "refunded"
                  ? " · refunded to card"
                  : ` · ${credit.status}`}
          </span>
          {credit.status === "open" && credit.card && (
            <button
              type="button"
              className="ad-btn ghost small"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await refundCredit(project, credit.id);
                  setR(res);
                  if (res.ok) router.refresh();
                })
              }
            >
              Refund to card instead
            </button>
          )}
          <Note r={r} pending={pending} />
        </div>
      )}
    </section>
  );
}
