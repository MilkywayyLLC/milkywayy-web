"use client";

import { cx } from "@/lib/cx";
import { useActionState, useState, useTransition } from "react";
import {
  adminCancelInvite,
  adminInvite,
  updateClientAccount,
  type AdminResult,
} from "@/lib/portal/admin-actions";
import { setRetention } from "@/lib/portal/admin-project-actions";

/** Billing currency (admin-only) and private notes the client never sees. */
export function ClientEditor({
  id,
  currency,
  notes: initial,
}: {
  id: string;
  currency: string;
  notes: string;
}) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<AdminResult>();
  const [pending, start] = useTransition();
  const run = (patch: { currency?: string; notes?: string }) =>
    start(async () => {
      const r = await updateClientAccount(id, patch);
      setMsg(r);
      if (r.ok && patch.notes !== undefined) setSaved(patch.notes);
    });
  return (
    <section className="ad-card ad-form" aria-label="Billing and notes">
      <h2 className="ad-h2">Billing and notes</h2>
      <div className="ad-field">
        <label htmlFor="acc-currency">Billing currency</label>
        <select
          id="acc-currency"
          defaultValue={currency}
          onChange={(e) => run({ currency: e.target.value })}
        >
          <option value="AED">AED</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="ad-field">
        <label htmlFor="acc-notes">Notes (only admins see these)</label>
        <textarea
          id="acc-notes"
          rows={5}
          maxLength={8000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="ad-btn"
          disabled={pending || notes === saved}
          onClick={() => run({ notes })}
        >
          Save notes
        </button>
        <span className={cx("ad-status", msg && (msg.ok ? "ok" : "error"))} role="status">
          {pending ? "Saving…" : (msg?.notice ?? msg?.error)}
        </span>
      </div>
    </section>
  );
}

/** Invite someone to this client's account; then send the message from your own WhatsApp/email. */
export function ClientInviteForm({ id, name }: { id: string; name: string }) {
  const [round, setRound] = useState(0);
  return <InviteRound key={round} id={id} name={name} again={() => setRound((r) => r + 1)} />;
}

function InviteRound({ id, name, again }: { id: string; name: string; again: () => void }) {
  const [state, invite, pending] = useActionState(adminInvite, undefined);
  return (
    <section className="ad-card ad-form" aria-label="Invite">
      <h2 className="ad-h2">Invite someone</h2>
      {state?.ok && state.share ? (
        <div className="ad-form" role="status">
          <p className="ad-note">Invited. Send them this so they know where to sign in:</p>
          <p className="ad-small" style={{ whiteSpace: "pre-wrap" }}>
            {state.share.text}
          </p>
          <div className="ad-btns">
            {state.share.whatsapp && (
              <a className="ad-btn" href={state.share.whatsapp} target="_blank" rel="noopener">
                Send on WhatsApp
              </a>
            )}
            {state.share.email && (
              <a className="ad-btn ghost" href={state.share.email}>
                Send by email
              </a>
            )}
            <button type="button" className="ad-btn quiet" onClick={again}>
              Invite another
            </button>
          </div>
        </div>
      ) : (
        <form action={invite} className="ad-form" noValidate>
          <input type="hidden" name="account_id" value={id} />
          <input type="hidden" name="account_name" value={name} />
          <div className="ad-field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" name="name" maxLength={120} />
          </div>
          <div className="ad-field">
            <label htmlFor="inv-phone">WhatsApp number</label>
            <input id="inv-phone" name="phone" type="tel" placeholder="050 123 4567, or +44 …" />
          </div>
          <div className="ad-field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" name="email" type="email" autoCapitalize="none" />
          </div>
          <div className="ad-field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" defaultValue="member">
              <option value="owner">Owner (if the account has none, else Admin)</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          </div>
          {state?.error && (
            <p className="ad-status error" role="alert">
              {state.error}
            </p>
          )}
          <div className="ad-btns">
            <button type="submit" className="ad-btn" disabled={pending}>
              {pending ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function CancelInvite({ accountId, inviteId }: { accountId: string; inviteId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <>
      <button
        type="button"
        className="ad-btn quiet small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await adminCancelInvite(accountId, inviteId);
            if (!r.ok) setErr(r.error);
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel invite"}
      </button>
      {err && <span className="ad-status error">{err}</span>}
    </>
  );
}

/** How long this client's delivered files are kept after a project completes (default 12 months). */
export function RetentionSelect({ accountId, months }: { accountId: string; months: number }) {
  const [value, setValue] = useState(months);
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-field">
      <label htmlFor="retention">Keep delivered files</label>
      <div className="ad-btns">
        <select
          id="retention"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ width: "auto" }}
        >
          {[12, 18, 24, 36, 60].map((m) => (
            <option key={m} value={m}>
              {m} months after completion
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ad-btn small"
          disabled={pending || value === months}
          onClick={() =>
            start(async () => {
              const r = await setRetention(accountId, value);
              setMsg({ ok: r.ok, text: r.ok ? r.notice : r.error });
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <span className="ad-small ad-muted">
        Raw uploads are always deleted 30 days after completion.
      </span>
      {msg && (
        <span className={`ad-status ${msg.ok ? "" : "error"}`} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
