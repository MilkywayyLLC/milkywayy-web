"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dateLabel, money, monthLabel } from "@/lib/portal/billing";
import { acceptPackageOffer, requestPackage } from "@/lib/portal/package-actions";
import {
  editsLabel,
  hoursFromVolume,
  LONG_MINUTES,
  savingsLine,
  sixMonthLine,
  splitHours,
  splitLabel,
  type MyPackageOffer,
  type PackageNeed,
  type PackageOffer,
  type PackageOption,
} from "@/lib/portal/package-builder";

/**
 * Billing's package corner (owner, 28 Oct 2026): pay-as-you-go clients see what this month would have
 * cost on a package and "Build a monthly package"; after asking, a thank-you; once Milkywayy publishes
 * the offer, "Your package is ready" with the ways to pay.
 */
export function MonthlyPackage({ p }: { p: MyPackageOffer }) {
  const r = p.request;
  if (r?.status === "offered" && r.offer) return <PackageReady id={r.id} o={r.offer} />;
  if (r?.status === "new")
    return (
      <section className="pt-card" role="status" data-testid="package-requested">
        <span className="pt-eb">Monthly package</span>
        <b>Thanks — we’ll build your package and let you know here.</b>
      </section>
    );
  if (r?.status === "six_requested")
    return (
      <section className="pt-card" role="status" data-testid="package-six-requested">
        <span className="pt-eb">Monthly package · 6 months</span>
        <b>Thanks — we’ll confirm your 6-month plan and send the first instalment here.</b>
      </section>
    );
  if (p.mode !== "payg" || r?.status === "accepted") return null;
  return <BuildPackage hint={p.hint} />;
}

function BuildPackage({ hint }: { hint: MyPackageOffer["hint"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pt-card" aria-labelledby="pkg-h" data-testid="package-build">
      {hint && (
        <p className="pt-meta" style={{ margin: 0 }} data-testid="package-hint">
          On a package, this month’s work would have cost{" "}
          <b className="pt-mono">{money(hint.currency, hint.package)}</b> (instead of{" "}
          {money(hint.currency, hint.value)}).
        </p>
      )}
      {!open ? (
        <div className="pt-row">
          <div className="stack" style={{ gap: 2 }}>
            <h2 id="pkg-h" className="pt-h2">
              Shoot every month?
            </h2>
            <span className="pt-meta">
              Tell us your monthly volume and we’ll build a package at a lower rate.
            </span>
          </div>
          <button type="button" className="btn btn-p btn-s" onClick={() => setOpen(true)}>
            Build a monthly package
          </button>
        </div>
      ) : (
        <PackageForm onCancel={() => setOpen(false)} />
      )}
    </section>
  );
}

const num = (v: string) => Math.max(0, Math.min(500, Math.floor(Number(v) || 0)));

function PackageForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [needs, setNeeds] = useState<PackageNeed[]>(["content"]);
  const [short, setShort] = useState("");
  const [long, setLong] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [property, setProperty] = useState("");
  const [pref, setPref] = useState<"upfront" | "usage">("upfront");
  const [six, setSix] = useState(false);
  const [scripting, setScripting] = useState(false);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const editingOnly = needs.includes("editing");
  const toggle = (n: PackageNeed) =>
    setNeeds((cur) =>
      n === "editing"
        ? cur.includes("editing")
          ? ["content"]
          : ["editing"]
        : cur.includes(n)
          ? cur.filter((x) => x !== n)
          : [...cur.filter((x) => x !== "editing"), n],
    );
  const hours = editingOnly ? 0 : hoursFromVolume(num(short), num(long));
  const split = splitHours(hours);
  const videos = needs.includes("content") || editingOnly;

  return (
    <form
      className="pt-form"
      aria-label="Build a monthly package"
      onSubmit={(e) => {
        e.preventDefault();
        if (!needs.length) return setErr("Choose what you need.");
        start(async () => {
          const res = await requestPackage({
            needs,
            short: videos ? num(short) : 0,
            long: videos ? num(long) : 0,
            longMinutes: videos && num(long) > 0 ? Number(minutes) : null,
            property: needs.includes("property") ? num(property) : 0,
            paymentPref: pref,
            sixMonths: six,
            scripting,
            notes,
          });
          if (!res.ok) return setErr(res.error ?? "Couldn’t send it.");
          router.refresh();
        });
      }}
    >
      <h2 id="pkg-h" className="pt-h2">
        Build a monthly package
      </h2>
      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>What do you need?</legend>
        {(["content", "property", "editing"] as PackageNeed[]).map((n) => (
          <label key={n} className="pt-check">
            <input type="checkbox" checked={needs.includes(n)} onChange={() => toggle(n)} />{" "}
            <span>
              {n === "content" ? "Content" : n === "property" ? "Property" : "Editing only"}
              <small className="pt-meta">
                {n === "content"
                  ? " · we shoot and edit short- and long-form videos"
                  : n === "property"
                    ? " · photos, walkthroughs, 360° tours"
                    : " · you send the footage, we edit"}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      {videos && (
        <div className="pt-grid2">
          <label className="pt-field">
            Short-form videos a month
            <input
              inputMode="numeric"
              value={short}
              onChange={(e) => setShort(e.target.value)}
              placeholder="e.g. 12"
            />
          </label>
          <label className="pt-field">
            Long-form videos a month
            <input
              inputMode="numeric"
              value={long}
              onChange={(e) => setLong(e.target.value)}
              placeholder="e.g. 2"
            />
          </label>
          {num(long) > 0 && (
            <label className="pt-field">
              Typical long-form length
              <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                {LONG_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {needs.includes("property") && (
        <label className="pt-field">
          Property shoots a month
          <input
            inputMode="numeric"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
            placeholder="e.g. 6"
          />
        </label>
      )}
      {hours > 0 && (
        <p className="pt-meta" style={{ margin: 0 }} data-testid="package-hours">
          About {hours} hours of shooting a month: {splitLabel(split.full, split.half)} (or{" "}
          {hours / 4} half days).
        </p>
      )}
      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>How would you like to pay?</legend>
        <label className="pt-check">
          <input
            type="radio"
            name="pref"
            checked={pref === "upfront"}
            onChange={() => setPref("upfront")}
          />{" "}
          <span>Upfront each month</span>
        </label>
        <label className="pt-check">
          <input
            type="radio"
            name="pref"
            checked={pref === "usage"}
            onChange={() => setPref("usage")}
          />{" "}
          <span>Pay for what you use</span>
        </label>
      </fieldset>
      <label className="pt-check">
        <input type="checkbox" checked={six} onChange={(e) => setSix(e.target.checked)} />{" "}
        <span>
          Interested in 6 months? <small className="pt-meta">· an extra discount</small>
        </span>
      </label>
      <label className="pt-check">
        <input
          type="checkbox"
          checked={scripting}
          onChange={(e) => setScripting(e.target.checked)}
        />{" "}
        <span>Need scripting or strategy?</span>
      </label>
      <label className="pt-field">
        Anything else (optional)
        <textarea
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {err && (
        <p className="pt-meta pt-warn-text" role="alert" style={{ margin: 0 }}>
          {err}
        </p>
      )}
      <div className="pt-row" style={{ justifyContent: "flex-start", gap: 8 }}>
        <button type="submit" className="btn btn-p btn-s" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
        <button type="button" className="btn btn-s" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "Your package is ready": what's in it, the saving, and the ways to pay. */
function PackageReady({ id, o }: { id: string; o: PackageOffer }) {
  const router = useRouter();
  const m = (n: number) => money(o.currency, n);
  const [choice, setChoice] = useState<PackageOption>("upfront");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const save = savingsLine(o);
  return (
    <section
      className="pt-card pt-plancard"
      aria-labelledby="pkg-ready-h"
      data-testid="package-ready"
    >
      <div className="pt-plan-head">
        <div>
          <span className="pt-eb">Your package is ready</span>
          <h2 id="pkg-ready-h" className="pt-h2">
            {o.name}
          </h2>
        </div>
        <div className="pt-plan-amt">
          <b className="pt-mono">{m(o.price)} / month</b>
        </div>
      </div>
      <ul className="pt-lines" aria-label="What’s in it">
        {o.hours > 0 && (
          <li>
            <span>Shoot hours</span>
            <span className="pt-mono">
              {o.hours} h · {splitLabel(o.full_days, o.half_days)}
            </span>
          </li>
        )}
        <li>
          <span>Edits</span>
          <span className="pt-mono">{editsLabel(o)}</span>
        </li>
        {o.property_value > 0 && (
          <li>
            <span>Property shoots</span>
            <span className="pt-mono">{m(o.property_value)} of shoots at your prices</span>
          </li>
        )}
        <li>
          <span>Pay as you go</span>
          <span className="pt-mono">{m(o.payg_total)}</span>
        </li>
        <li className="pt-lines-total">
          <b>Monthly price</b>
          <b className="pt-mono">{m(o.price)}</b>
        </li>
      </ul>
      {save && (
        <p className="pt-carried" data-testid="package-saving">
          {save}.
        </p>
      )}
      <span className="pt-meta">
        Starts {dateLabel(o.start)}. Extras beyond the package are billed at package rates.
      </span>
      {o.note && (
        <p className="pt-meta" style={{ margin: 0 }}>
          {o.note}
        </p>
      )}

      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>How would you like to pay?</legend>
        <label className="pt-check">
          <input
            type="radio"
            name="pkg-opt"
            checked={choice === "upfront"}
            onChange={() => setChoice("upfront")}
          />{" "}
          <span>
            <b>Upfront monthly · {m(o.price)}</b>
            <small className="pt-meta">
              {" "}
              · paid at the start of each month. Unused hours and edits carry over for 1 month.
              Change or stop with 7 days’ notice before the 1st.
            </small>
          </span>
        </label>
        {o.usage_enabled && (
          <label className="pt-check">
            <input
              type="radio"
              name="pkg-opt"
              checked={choice === "usage"}
              onChange={() => setChoice("usage")}
            />{" "}
            <span>
              <b>Pay for what you use</b>
              <small className="pt-meta">
                {" "}
                · month 1 is paid upfront; from month 2 you’re billed at month end for what you
                used, at package rates
                {o.minimum ? ` (minimum ${m(o.minimum)} a month)` : ""}.
              </small>
            </span>
          </label>
        )}
        {o.six_enabled && (
          <label className="pt-check">
            <input
              type="radio"
              name="pkg-opt"
              checked={choice === "six"}
              onChange={() => setChoice("six")}
            />{" "}
            <span>
              <b>6 months · {o.six_month_pct}% off</b>
              <small className="pt-meta">
                {" "}
                · {o.currency} {sixMonthLine(o)}. Bank transfer. Unused value carries into month 7.
                We confirm before it starts.
              </small>
            </span>
          </label>
        )}
      </fieldset>
      {choice !== "six" && (
        <span className="pt-meta">
          Accepting sets up your plan and sends the first invoice: {m(o.price)} for{" "}
          {monthLabel(o.start)}.
        </span>
      )}
      {err && (
        <p className="pt-meta pt-warn-text" role="alert" style={{ margin: 0 }}>
          {err}
        </p>
      )}
      <button
        type="button"
        className="btn btn-p btn-s"
        style={{ justifySelf: "start" }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptPackageOffer(id, choice);
            if (!r.ok) return setErr(r.error ?? "Couldn’t accept it.");
            router.refresh();
          })
        }
      >
        {pending
          ? "Accepting…"
          : choice === "six"
            ? "Ask for the 6-month plan"
            : "Accept the package"}
      </button>
    </section>
  );
}
