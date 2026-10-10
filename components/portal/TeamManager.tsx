"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { PhoneField } from "@/components/forms/PhoneField";
import { PERMS, presetOf, PRESETS, type Access, type PresetKey } from "@/lib/portal/access";
import {
  cancelInvite,
  inviteMember,
  removeMember,
  resendInvite,
  setInviteEmail,
  setMemberAccess,
  type Result,
} from "@/lib/portal/account-actions";
import { inviteLinks, inviteText } from "@/lib/portal/invite";
import { Field, FormBanner, useFormCheck } from "./forms";
import { Icon } from "./Icon";
import { Badge, Sheet, useToast } from "./ui";

export type MemberRow = {
  userId: string;
  role: "owner" | "admin" | "member";
  access: Access | null;
  name: string | null;
  contact: string | null;
  me: boolean;
};
export type InviteRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone_e164: string | null;
  role: "admin" | "member";
  access: Access | null;
  created_at: string;
  expires_at: string;
  /** Worked out on the server. */
  expired: boolean;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  });

/** Preset buttons, and the toggles when Custom (names: preset, perm_<key>). */
function AccessPicker({
  initial,
  idPrefix,
}: {
  initial: { preset: PresetKey; access: Access };
  idPrefix: string;
}) {
  const [preset, setPreset] = useState<PresetKey>(initial.preset);
  const [custom, setCustom] = useState<Access>(initial.access);
  return (
    <div className="pt-form" style={{ gap: 8 }}>
      <input type="hidden" name="preset" value={preset} />
      <div className="pt-choice" role="radiogroup" aria-label="Access">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <label key={k}>
            <input
              type="radio"
              name={`${idPrefix}-preset`}
              checked={preset === k}
              onChange={() => {
                setPreset(k);
                if (k !== "custom") setCustom(PRESETS[k].access);
              }}
            />
            {PRESETS[k].label}
            <small>{PRESETS[k].hint}</small>
          </label>
        ))}
      </div>
      {preset === "custom" && (
        <div className="pt-form" style={{ gap: 4 }} role="group" aria-label="Custom access">
          {PERMS.map(([p, label]) => (
            <label key={p} className="pt-check">
              <input
                type="checkbox"
                name={`perm_${p}`}
                checked={!!custom[p]}
                onChange={(e) => setCustom({ ...custom, [p]: e.target.checked })}
              />{" "}
              {label}
              {p === "all_projects" && (
                <span className="pt-meta"> (off: only their own projects)</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const accessLabel = (m: { role: string; access: Access | null }) =>
  m.role === "owner"
    ? "Owner · everything"
    : PRESETS[presetOf({ role: m.role as "admin", access: m.access })].label;

/**
 * Team (owner, 10 Oct 2026): invite by email with the access they'll have; pending invites with
 * Resend / Cancel (14 days to accept); each member's access (Admin, Finance, Production, Custom).
 * The owner always has everything. The database enforces the same rules.
 */
export function TeamManager({
  account,
  members,
  invites,
  origin,
}: {
  account: { name: string; type: string };
  origin: string;
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const [sheet, setSheet] = useState<
    null | "invite" | { remove: MemberRow } | { access: MemberRow } | { email: InviteRow }
  >(null);
  const [pending, start] = useTransition();
  const [toast, say] = useToast();
  const router = useRouter();
  const run = (p: Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await p;
      say(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">{account.name}</span>
          <h1 className="pt-h1">Team</h1>
        </div>
        <button type="button" className="btn btn-p btn-s" onClick={() => setSheet("invite")}>
          <Icon name="plus" size={16} /> Invite
        </button>
      </div>
      <p className="pt-meta" style={{ margin: 0 }}>
        Each person signs in with their own email. Choose what each one can see and do.
      </p>

      <div className="pt-list" data-testid="members">
        {members.map((m) => (
          <div key={m.userId} className="pt-row" style={{ flexWrap: "wrap" }}>
            <div>
              <b>
                {m.name ?? m.contact ?? "Team member"}
                {m.me ? " (you)" : ""}
              </b>
              <div className="pt-meta">{m.contact ?? "No contact on file"}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone={m.role === "owner" ? "solid" : undefined}>{accessLabel(m)}</Badge>
              {m.role !== "owner" && !m.me && (
                <button
                  type="button"
                  className="btn btn-g btn-s pt-btn-sm"
                  aria-label={`Access for ${m.name ?? m.contact ?? "member"}`}
                  onClick={() => setSheet({ access: m })}
                >
                  Access
                </button>
              )}
              {m.role !== "owner" && (
                <button
                  type="button"
                  className="btn btn-g btn-s pt-btn-sm"
                  onClick={() => setSheet({ remove: m })}
                >
                  {m.me ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <section style={{ display: "grid", gap: 10 }} aria-labelledby="pending">
          <h2 id="pending" className="pt-h2">
            Invited, not joined yet
          </h2>
          <div className="pt-list" data-testid="invites">
            {invites.map((i) => {
              const expired = i.expired;
              const wa = i.phone_e164
                ? inviteLinks(
                    inviteText(account.name, i.name, false, origin),
                    `You’re invited to ${account.name} on Milkywayy`,
                    { phone: i.phone_e164 },
                  ).whatsapp
                : undefined;
              return (
                <div key={i.id} className="pt-row" style={{ flexWrap: "wrap" }}>
                  <div>
                    <b>{i.name ?? i.email ?? i.phone_e164}</b>
                    <div className="pt-meta">
                      {[
                        i.email ?? i.phone_e164,
                        accessLabel(i),
                        expired ? "Expired" : `expires ${day(i.expires_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {!i.email && (
                      <div className="pt-meta pt-warn-text">Add an email to send this invite.</div>
                    )}
                  </div>
                  <div className="pt-btns">
                    {i.email ? (
                      <button
                        type="button"
                        className="btn btn-g btn-s pt-btn-sm"
                        disabled={pending}
                        onClick={() => run(resendInvite(i.id))}
                      >
                        Resend
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-g btn-s pt-btn-sm"
                        onClick={() => setSheet({ email: i })}
                      >
                        Add email
                      </button>
                    )}
                    {wa && (
                      <a
                        className="btn btn-g btn-s pt-btn-sm"
                        href={wa}
                        target="_blank"
                        rel="noopener"
                      >
                        Send on WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-g btn-s pt-btn-sm"
                      disabled={pending}
                      onClick={() => run(cancelInvite(i.id))}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sheet === "invite" && <InviteSheet onClose={() => setSheet(null)} say={say} />}
      {sheet && typeof sheet === "object" && "access" in sheet && (
        <Sheet
          title={`Access: ${sheet.access.name ?? sheet.access.contact ?? "member"}`}
          onClose={() => setSheet(null)}
        >
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const who = sheet.access;
              run(setMemberAccess(who.userId, f), () => setSheet(null));
            }}
          >
            <AccessPicker
              idPrefix={`m-${sheet.access.userId}`}
              initial={{
                preset: presetOf(sheet.access),
                access: sheet.access.access ?? {},
              }}
            />
            <button type="submit" className="btn btn-p btn-s" disabled={pending}>
              Save access
            </button>
          </form>
        </Sheet>
      )}
      {sheet && typeof sheet === "object" && "email" in sheet && (
        <InviteEmailSheet
          invite={sheet.email}
          onClose={() => setSheet(null)}
          onSave={(email) => run(setInviteEmail(sheet.email.id, email), () => setSheet(null))}
          pending={pending}
        />
      )}
      {sheet && typeof sheet === "object" && "remove" in sheet && (
        <Sheet
          title={sheet.remove.me ? "Leave this account?" : "Remove from the account?"}
          onClose={() => setSheet(null)}
        >
          <p style={{ margin: 0 }}>
            {sheet.remove.me
              ? `You’ll lose access to ${account.name}. Someone will need to invite you again.`
              : `${sheet.remove.name ?? sheet.remove.contact ?? "They"} will lose access to ${account.name} straight away.`}
          </p>
          <div className="pt-btns">
            <button
              type="button"
              className="btn btn-p btn-s"
              disabled={pending}
              onClick={() => {
                const who = sheet.remove;
                setSheet(null);
                run(removeMember(who.userId), who.me ? () => router.push("/portal") : undefined);
              }}
            >
              {sheet.remove.me ? "Leave" : "Remove"}
            </button>
            <button type="button" className="btn btn-g btn-s" onClick={() => setSheet(null)}>
              Keep
            </button>
          </div>
        </Sheet>
      )}
      {toast}
    </>
  );
}

function InviteEmailSheet({
  invite,
  onClose,
  onSave,
  pending,
}: {
  invite: InviteRow;
  onClose: () => void;
  onSave: (email: string) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const form = useFormCheck(() => ({
    email: !/^\S+@\S+\.\S{2,}$/.test(email.trim()) && "Add a full email address.",
  }));
  return (
    <Sheet title={`Add an email for ${invite.name ?? invite.phone_e164}`} onClose={onClose}>
      <form
        className="pt-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (form.check()) onSave(email);
        }}
      >
        <FormBanner text={form.banner} />
        <Field name="email" label="Their email" required error={form.errors.email}>
          <input
            type="email"
            value={email}
            autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn btn-p btn-s" disabled={pending}>
          Save and send the invite
        </button>
      </form>
    </Sheet>
  );
}

/** Mounted fresh each time, so it always opens on the form. */
function InviteSheet({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const [state, invite, inviting] = useActionState(inviteMember, undefined);
  const [v, setV] = useState({ name: "", email: "" });
  const form = useFormCheck(() => ({
    name: v.name.trim().length < 2 && "Add their full name.",
    email:
      !/^\S+@\S+\.\S{2,}$/.test(v.email.trim()) && "Add their email: it’s where the invite goes.",
  }));
  return (
    <Sheet title={state?.ok ? "Invite sent" : "Invite someone"} onClose={onClose}>
      {state?.ok ? (
        <div className="pt-form" role="status">
          <p className="pt-note">{state.notice}</p>
          {state.invite?.whatsapp && (
            <>
              <span className="pt-meta">You can also send the same invite on WhatsApp:</span>
              <div className="pt-btns">
                <a
                  className="btn btn-g btn-s"
                  href={state.invite.whatsapp}
                  target="_blank"
                  rel="noopener"
                >
                  Send on WhatsApp
                </a>
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={() =>
                    navigator.clipboard?.writeText(state.invite!.text).then(() => say("Copied."))
                  }
                >
                  Copy message
                </button>
              </div>
            </>
          )}
          <button type="button" className="btn btn-p btn-s" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          action={invite}
          className="pt-form"
          noValidate
          onSubmit={(e) => {
            if (!form.check()) e.preventDefault();
          }}
        >
          <FormBanner text={state?.error ?? form.banner} />
          <Field name="name" label="Full name" required error={form.errors.name}>
            <input
              type="text"
              name="name"
              autoComplete="off"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field
            name="email"
            label="Email"
            required
            error={form.errors.email}
            hint="The invite goes here."
          >
            <input
              type="email"
              name="email"
              autoCapitalize="none"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </Field>
          <PhoneField label="Phone (optional, to also send it on WhatsApp)" />
          <div className="pt-field">
            <span className="pt-field-label">
              Access <span className="pt-req">*</span>
            </span>
            <AccessPicker
              idPrefix="invite"
              initial={{ preset: "production", access: PRESETS.production.access }}
            />
          </div>
          <button type="submit" className="btn btn-p" disabled={inviting}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
