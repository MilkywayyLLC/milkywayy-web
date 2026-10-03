"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  attachBooking,
  createClientProject,
  setMemberPhone,
  type ActionResult,
} from "@/lib/portal/admin-project-actions";
import { AVATAR_LENGTHS, EDIT_KINDS, SHOOT_SERVICE_LABEL } from "@/lib/portal/projects";

function Note({
  r,
  pending,
  busy = "Saving…",
}: {
  r?: ActionResult;
  pending?: boolean;
  busy?: string;
}) {
  return (
    <span className={`ad-status${r && !r.ok ? "error" : ""}`} role="status">
      {pending ? busy : (r?.notice ?? r?.error)}
    </span>
  );
}

/**
 * New project for a client (owner QA, 3 Oct 2026): for shoots booked on WhatsApp or by phone,
 * and batches or avatar videos agreed outside the portal. It lands in their portal straight away.
 */
export function AdminNewProject({
  clients,
  account: initial,
}: {
  clients: { id: string; name: string }[];
  account?: string;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(initial ?? "");
  const [type, setType] = useState<"shoot" | "edit" | "avatar">("shoot");
  const [services, setServices] = useState<string[]>(["photo"]);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const kinds = type === "avatar" ? AVATAR_LENGTHS : EDIT_KINDS;

  return (
    <form
      className="ad-card ad-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const res = await createClientProject({
            account,
            type,
            title: s("title"),
            kind: s("kind"),
            quantity: Number(s("quantity")) || null,
            notes: s("notes"),
            due: s("due"),
            shootDate: s("date"),
            slot: s("slot"),
            area: s("area"),
            building: s("building"),
            unit: s("unit"),
            services,
            price: s("price") ? Number(s("price")) : null,
            scriptBy: s("script_by") === "client" ? "client" : "milkywayy",
          });
          setR(res);
          if (res.ok && res.id) router.push(`/admin/projects/${res.id}`);
        });
      }}
    >
      <div className="ad-field">
        <label htmlFor="np-client">Client</label>
        <select id="np-client" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ad-field">
        <span>Type</span>
        <div className="ad-btns" role="group" aria-label="Type">
          {(
            [
              ["shoot", "Shoot"],
              ["edit", "Editing batch"],
              ["avatar", "Avatar video"],
            ] as const
          ).map(([t, l]) => (
            <button
              key={t}
              type="button"
              className={`ad-btn small ${type === t ? "" : "ghost"}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="ad-field">
        <label htmlFor="np-title">Title (the client sees this)</label>
        <input
          id="np-title"
          name="title"
          maxLength={160}
          placeholder={type === "shoot" ? "2 Bed apartment, Bloom Towers" : "October listings"}
        />
      </div>
      {type === "shoot" ? (
        <>
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="np-area">Community / area</label>
              <input id="np-area" name="area" />
            </div>
            <div className="ad-field">
              <label htmlFor="np-building">Building / tower</label>
              <input id="np-building" name="building" />
            </div>
          </div>
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="np-unit">Unit (optional)</label>
              <input id="np-unit" name="unit" />
            </div>
            <div className="ad-field">
              <span>Services</span>
              <div className="ad-btns" role="group" aria-label="Services">
                {Object.entries(SHOOT_SERVICE_LABEL).map(([k, l]) => (
                  <label key={k} className="ad-check">
                    <input
                      type="checkbox"
                      checked={services.includes(k)}
                      onChange={(e) =>
                        setServices(
                          e.target.checked ? [...services, k] : services.filter((x) => x !== k),
                        )
                      }
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="ad-grid2">
            <div className="ad-field">
              <label htmlFor="np-date">Date (optional; confirm it to email the client)</label>
              <input id="np-date" name="date" type="date" />
            </div>
            <div className="ad-field">
              <label htmlFor="np-slot">Slot</label>
              <select id="np-slot" name="slot" defaultValue="Morning">
                {["Morning", "Afternoon", "Evening", "Twilight"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : (
        <div className="ad-grid2">
          <div className="ad-field">
            <label htmlFor="np-kind">{type === "avatar" ? "Length" : "What is it?"}</label>
            <select id="np-kind" name="kind" key={type}>
              {kinds.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {type === "edit" ? (
            <div className="ad-field">
              <label htmlFor="np-qty">Quantity (optional)</label>
              <input id="np-qty" name="quantity" type="number" min={1} />
            </div>
          ) : (
            <div className="ad-field">
              <label htmlFor="np-script">Script</label>
              <select id="np-script" name="script_by">
                <option value="milkywayy">We write it</option>
                <option value="client">Client sends it</option>
              </select>
            </div>
          )}
        </div>
      )}
      <div className="ad-grid2">
        {type !== "shoot" && (
          <div className="ad-field">
            <label htmlFor="np-due">Wanted by (optional)</label>
            <input id="np-due" name="due" type="date" />
          </div>
        )}
        <div className="ad-field">
          <label htmlFor="np-price">Agreed price (optional, owners and admins see it)</label>
          <input id="np-price" name="price" type="number" min={0} step="1" inputMode="decimal" />
        </div>
      </div>
      <div className="ad-field">
        <label htmlFor="np-notes">Notes (the client sees these)</label>
        <textarea id="np-notes" name="notes" rows={3} maxLength={4000} />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn" disabled={pending}>
          Create project
        </button>
        <Note r={r} pending={pending} busy="Creating…" />
      </div>
    </form>
  );
}

/** Attach a website booking to this client by its ref. */
export function AttachBooking({ account }: { account: string }) {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await attachBooking(ref, account);
          setR(res);
          if (res.ok) {
            setRef("");
            router.refresh();
          }
        });
      }}
    >
      <div className="ad-field">
        <label htmlFor="attach-ref">Attach a website booking (ref)</label>
        <div className="ad-btns">
          <input
            id="attach-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="MW-1314"
            style={{ width: 160 }}
          />
          <button type="submit" className="ad-btn small" disabled={pending || !ref.trim()}>
            Attach
          </button>
        </div>
      </div>
      <Note r={r} pending={pending} busy="Attaching…" />
    </form>
  );
}

/** On an unclaimed booking's project: give it to a client. */
export function AttachToClient({
  bookingRef,
  clients,
}: {
  bookingRef: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  return (
    <section className="ad-card ad-form" aria-label="Attach to a client">
      <h2 className="ad-h2">Not in the portal yet</h2>
      <span className="ad-small ad-muted">
        Booking {bookingRef} isn’t linked to a client account. Attach it so it shows in their portal
        (it also attaches by itself when they sign in with the booking’s email).
      </span>
      <div className="ad-btns">
        <select
          aria-label="Client"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ad-btn small"
          disabled={pending || !account}
          onClick={() =>
            start(async () => {
              const res = await attachBooking(bookingRef, account);
              setR(res);
              if (res.ok) router.refresh();
            })
          }
        >
          Attach
        </button>
      </div>
      <Note r={r} pending={pending} busy="Attaching…" />
    </section>
  );
}

/** A member's WhatsApp number (contact only). */
export function MemberPhone({
  account,
  user,
  phone,
  name,
}: {
  account: string;
  user: string;
  phone: string | null;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<ActionResult>();
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="ad-btn quiet small" onClick={() => setOpen(true)}>
        {phone ? "Edit WhatsApp" : "Add WhatsApp"}
      </button>
    );
  return (
    <form
      className="ad-form"
      aria-label={`WhatsApp number for ${name}`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () =>
          setR(await setMemberPhone(account, user, String(f.get("phone") ?? ""), "AE")),
        );
      }}
    >
      <div className="ad-field">
        <label htmlFor={`ph-${user}`}>WhatsApp number (UAE, or +country code)</label>
        <input
          id={`ph-${user}`}
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="050 123 4567"
          autoComplete="off"
        />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending}>
          Save
        </button>
        <button type="button" className="ad-btn quiet small" onClick={() => setOpen(false)}>
          Close
        </button>
        <Note r={r} pending={pending} />
      </div>
    </form>
  );
}
