"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { PhoneField } from "@/components/forms/PhoneField";
import {
  cancelInvite,
  changeRole,
  inviteMember,
  removeMember,
  setVisibility,
  type Result,
} from "@/lib/portal/account-actions";
import { inviteLinks, inviteText } from "@/lib/portal/invite";
import { Icon } from "./Icon";
import { Badge, Sheet, useToast } from "./ui";

export type MemberRow = {
  userId: string;
  role: string;
  name: string | null;
  contact: string | null;
  me: boolean;
};
export type InviteRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone_e164: string | null;
  role: string;
  created_at: string;
};

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function TeamManager({
  account,
  myRole,
  members,
  invites,
  origin,
}: {
  account: { name: string; type: string; visibility: "own" | "all" };
  /** This site's address, for the sign-in link in invite messages. */
  origin: string;
  myRole: string;
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const [sheet, setSheet] = useState<null | "invite" | { remove: MemberRow }>(null);
  const [pending, start] = useTransition();
  const [toast, say] = useToast();
  const router = useRouter();
  const [visibility, setVis] = useState(account.visibility);
  const run = (p: Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await p;
      say(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
      if (r.ok) after?.();
    });
  const shareFor = (i: InviteRow) => {
    const text = inviteText(account.name, i.name, !!i.phone_e164, origin);
    return inviteLinks(text, `You’re invited to ${account.name} on Milkywayy`, {
      phone: i.phone_e164,
      email: i.email,
    });
  };

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

      {account.type === "individual" && members.length === 1 && (
        <div className="pt-card">
          <b>Working with other agents?</b>
          <span className="pt-meta">
            Invite them here. Each person signs in with their own WhatsApp number or email.
          </span>
        </div>
      )}

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
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {m.role === "owner" || (m.me && myRole !== "owner") ? (
                <Badge tone={m.role === "owner" ? "solid" : undefined}>{ROLE[m.role]}</Badge>
              ) : (
                <select
                  value={m.role}
                  disabled={pending}
                  aria-label={`Role for ${m.name ?? m.contact ?? "member"}`}
                  onChange={(e) => run(changeRole(m.userId, e.target.value))}
                  style={{ width: "auto", minHeight: 38, padding: "6px 10px", fontSize: 14 }}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
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
              const share = shareFor(i);
              return (
                <div key={i.id} className="pt-row" style={{ flexWrap: "wrap" }}>
                  <div>
                    <b>{i.name ?? i.email ?? i.phone_e164}</b>
                    <div className="pt-meta">
                      {i.email ?? i.phone_e164} · {ROLE[i.role]}
                    </div>
                  </div>
                  <div className="pt-btns">
                    {share.whatsapp && (
                      <a
                        className="btn btn-g btn-s pt-btn-sm"
                        href={share.whatsapp}
                        target="_blank"
                        rel="noopener"
                      >
                        Send on WhatsApp
                      </a>
                    )}
                    {share.email && (
                      <a className="btn btn-g btn-s pt-btn-sm" href={share.email}>
                        Send by email
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

      <section className="pt-card" aria-labelledby="vis">
        <h2 id="vis" className="pt-h2">
          What members see
        </h2>
        <div className="pt-choice" role="radiogroup" aria-labelledby="vis">
          {(
            [
              ["own", "Only their own projects", "Projects they booked or are assigned to."],
              ["all", "All company projects", "Everyone sees every shoot and batch."],
            ] as const
          ).map(([v, l, sub]) => (
            <label key={v}>
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => {
                  setVis(v);
                  run(setVisibility(v));
                }}
              />
              {l}
              <small>{sub}</small>
            </label>
          ))}
        </div>
        <span className="pt-meta">Members never see prices or invoices.</span>
      </section>

      {sheet === "invite" && <InviteSheet onClose={() => setSheet(null)} say={say} />}
      {sheet && typeof sheet === "object" && (
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

/** Mounted fresh each time, so it always opens on the form. */
function InviteSheet({ onClose, say }: { onClose: () => void; say: (m: string) => void }) {
  const [via, setVia] = useState<"whatsapp" | "email">("whatsapp");
  const [state, invite, inviting] = useActionState(inviteMember, undefined);
  return (
    <Sheet
      title={state?.ok && state.invite ? "Send the invite" : "Invite someone"}
      onClose={onClose}
    >
      {state?.ok && state.invite ? (
        <div className="pt-form" role="status">
          <p className="pt-note">{state.notice}</p>
          <span className="pt-meta">Send them this message so they know where to sign in:</span>
          <div className="pt-script pt-small">{state.invite.text}</div>
          <div className="pt-btns">
            {state.invite.whatsapp && (
              <a
                className="btn btn-p btn-s"
                href={state.invite.whatsapp}
                target="_blank"
                rel="noopener"
              >
                Send on WhatsApp
              </a>
            )}
            {state.invite.email && (
              <a className="btn btn-p btn-s" href={state.invite.email}>
                Send by email
              </a>
            )}
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
        </div>
      ) : (
        <form action={invite} className="pt-form" noValidate>
          <label className="pt-field">
            Name
            <input type="text" name="name" required autoComplete="off" />
          </label>
          <div className="pt-seg" role="group" aria-label="Invite by">
            <button
              type="button"
              aria-pressed={via === "whatsapp"}
              onClick={() => setVia("whatsapp")}
            >
              WhatsApp
            </button>
            <button type="button" aria-pressed={via === "email"} onClick={() => setVia("email")}>
              Email
            </button>
          </div>
          <input type="hidden" name="via" value={via} />
          {via === "whatsapp" ? (
            <PhoneField label="Their WhatsApp number" />
          ) : (
            <label className="pt-field">
              Their email
              <input type="email" name="email" required autoCapitalize="none" />
            </label>
          )}
          <label className="pt-field">
            Role
            <select name="role" defaultValue="member">
              <option value="member">Member: sees projects, can’t see prices</option>
              <option value="admin">Admin: everything except removing the owner</option>
            </select>
          </label>
          {state?.error && (
            <p className="pt-error" role="alert">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-p" disabled={inviting}>
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
