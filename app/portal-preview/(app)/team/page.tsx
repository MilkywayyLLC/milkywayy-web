"use client";

import { useState } from "react";
import { Icon } from "@/components/portal-mock/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, Sheet, useToast } from "@/components/portal-mock/ui";
import { TEAM } from "@/lib/portal-mock/data";

export default function Team() {
  const { account } = usePersona();
  const [invite, setInvite] = useState(false);
  const [via, setVia] = useState<"whatsapp" | "email">("whatsapp");
  const [toast, say] = useToast();
  const team =
    account.id === "all"
      ? TEAM
      : account.id === "post"
        ? [
            {
              name: "Jenna Morales",
              role: "Owner",
              contact: "jenna@northlake.example",
              status: "Active",
            },
            {
              name: "Marcus Lee",
              role: "Member",
              contact: "marcus@northlake.example",
              status: "Active",
            },
          ]
        : [
            {
              name: account.me.name,
              role: "Owner",
              contact: account.me.phone ?? "",
              status: "Active",
            },
          ];

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">{account.name}</span>
          <h1 className="pt-h1">Team</h1>
        </div>
        <button type="button" className="btn btn-p btn-s" onClick={() => setInvite(true)}>
          <Icon name="plus" size={16} /> Invite
        </button>
      </div>

      {account.kind === "individual" && (
        <div className="pt-card">
          <b>Working with other agents?</b>
          <span className="pt-meta">
            Invite them and this becomes a company account. Each person signs in with their own
            WhatsApp.
          </span>
        </div>
      )}

      <div className="pt-list">
        {team.map((m) => (
          <div key={m.name} className="pt-row">
            <div>
              <b>{m.name}</b>
              <div className="pt-meta">{m.contact}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {m.status === "Invited" && <Badge>Invited</Badge>}
              {m.role === "Owner" ? (
                <Badge tone="solid">Owner</Badge>
              ) : (
                <select
                  defaultValue={m.role}
                  aria-label={`Role for ${m.name}`}
                  style={{ width: "auto", minHeight: 38, padding: "6px 10px", fontSize: 14 }}
                >
                  <option>Admin</option>
                  <option>Member</option>
                  <option>Remove</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {account.kind === "company" && (
        <section className="pt-card">
          <h2 className="pt-h2">What members see</h2>
          <div className="pt-choice">
            <label>
              <input type="radio" name="vis" defaultChecked />
              Only their own projects
              <small>Projects they booked or are assigned to.</small>
            </label>
            <label>
              <input type="radio" name="vis" />
              All company projects
              <small>Everyone sees every shoot and batch.</small>
            </label>
          </div>
          <span className="pt-meta">
            Members never see prices or invoices unless you give them billing access.
          </span>
        </section>
      )}

      {invite && (
        <Sheet title="Invite someone" onClose={() => setInvite(false)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setInvite(false);
              say("Invite sent (mockup: nothing sent)");
            }}
          >
            <label className="pt-field">
              Name
              <input type="text" required />
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
            <label className="pt-field">
              {via === "whatsapp" ? "WhatsApp number" : "Email"}
              <input
                type={via === "whatsapp" ? "tel" : "email"}
                placeholder={via === "whatsapp" ? "+971 5x xxx xxxx" : "name@company.com"}
                required
              />
            </label>
            <label className="pt-field">
              Role
              <select defaultValue="Member">
                <option>Member</option>
                <option>Admin</option>
              </select>
            </label>
            <button type="submit" className="btn btn-p">
              Send invite
            </button>
          </form>
        </Sheet>
      )}
      {toast}
    </>
  );
}
