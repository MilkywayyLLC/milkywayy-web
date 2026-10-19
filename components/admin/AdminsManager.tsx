"use client";

import { cx } from "@/lib/cx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAdmin, removeAdmin } from "@/lib/admin/actions";
import { Confirm } from "./Confirm";

export function AdminsManager({
  admins,
  me,
}: {
  admins: { email: string; role: string }[];
  me: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "owner">("editor");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <div className="ad-list">
        {admins.map((a) => (
          <div className="ad-row" key={a.email} style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div className="ad-row-title">{a.email}</div>
              <div className="ad-row-meta">
                {a.role === "owner"
                  ? "Owner · everything, two-factor required"
                  : "Editor · content only"}
              </div>
            </div>
            {a.email !== me && (
              <button
                type="button"
                className="ad-btn danger small"
                onClick={() => setRemoving(a.email)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <form
        className="ad-card ad-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addAdmin(email, role);
            setMsg(
              r.ok
                ? { ok: true, text: `${email} added.` }
                : { ok: false, text: r.errors?.email ?? r.error ?? "Couldn't add." },
            );
            if (r.ok) {
              setEmail("");
              router.refresh();
            }
          });
        }}
      >
        <h2 className="ad-h2">Add an admin</h2>
        <div className="ad-grid2">
          <div className="ad-field">
            <label htmlFor="new-admin">Email</label>
            <input
              id="new-admin"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoCapitalize="none"
            />
          </div>
          <div className="ad-field">
            <label htmlFor="new-role">Role</label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "owner")}
            >
              <option value="editor">Editor (content only)</option>
              <option value="owner">Owner (everything)</option>
            </select>
          </div>
        </div>
        <p className="ad-small ad-muted">
          Then create their login in Supabase → Authentication → Users → Add user (there’s no public
          sign-up).
        </p>
        <p className={cx("ad-status", msg && (msg.ok ? "ok" : "error"))} role="status">
          {msg?.text}
        </p>
        <div>
          <button className="ad-btn" type="submit" disabled={pending}>
            Add admin
          </button>
        </div>
      </form>
      <Confirm
        open={!!removing}
        title={`Remove ${removing}?`}
        confirmLabel="Remove"
        danger
        busy={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          start(async () => {
            const r = await removeAdmin(removing!);
            setRemoving(null);
            setMsg(
              r.ok
                ? { ok: true, text: "Removed." }
                : { ok: false, text: r.error ?? "Couldn't remove." },
            );
            router.refresh();
          })
        }
      >
        <p>They lose access to the admin straight away.</p>
      </Confirm>
    </>
  );
}
