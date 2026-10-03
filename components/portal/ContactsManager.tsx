"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import { useActionState, useState, useTransition } from "react";
import { PhoneField } from "@/components/forms/PhoneField";
import {
  deleteContact,
  makeDefaultContact,
  saveContact,
  type Result,
} from "@/lib/portal/account-actions";
import { contactPhotoUrl, setContactPhoto } from "@/lib/portal/listing-actions";
import { makeThumb, putBlob } from "@/lib/upload-browser";
import { initials } from "@/lib/portal/shell";
import { Icon } from "./Icon";
import { Badge, Sheet, useToast } from "./ui";

export type ContactRow = {
  id: string;
  name: string;
  role: string | null;
  whatsapp: string | null;
  email: string | null;
  brn: string | null;
  is_default: boolean;
  canEdit: boolean;
  /** Signed preview of the contact's photo (shown on share pages). */
  photo: string | null;
};

export function ContactsManager({ contacts }: { contacts: ContactRow[] }) {
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const [toast, say] = useToast();
  const run = (p: Promise<Result>) =>
    start(async () => {
      const r = await p;
      say(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
    });

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Shown on your listing pages</span>
          <h1 className="pt-h1">Contacts</h1>
        </div>
        <button type="button" className="btn btn-p btn-s" onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} /> Add contact
        </button>
      </div>
      <p className="pt-muted" style={{ margin: 0 }}>
        When you create a share link you just tap a pill. The default one is picked for you.
      </p>
      {contacts.length === 0 ? (
        <div className="pt-card">
          <b>No contacts yet</b>
          <span className="pt-meta">
            Add the people buyers should WhatsApp or call about a listing.
          </span>
        </div>
      ) : (
        <>
          <div className="pt-pills" data-testid="pills">
            {contacts.map((c) => (
              <span key={c.id} className="pt-pill" aria-pressed={c.is_default ? "true" : "false"}>
                {c.photo ? (
                  <img
                    src={c.photo}
                    alt=""
                    className="pt-pill-face"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <span className="pt-pill-face">{initials(c.name)}</span>
                )}
                <span>
                  {c.name}
                  <small>
                    {[c.role, c.brn].filter(Boolean).join(" · ") || (c.is_default ? "Default" : "")}
                  </small>
                </span>
              </span>
            ))}
          </div>
          <div className="pt-list" data-testid="contacts">
            {contacts.map((c) => (
              <div key={c.id} className="pt-row" style={{ flexWrap: "wrap" }}>
                <div>
                  <b>{c.name}</b> {c.is_default && <Badge>Default</Badge>}
                  <div className="pt-meta">
                    {[c.role, c.whatsapp, c.email, c.brn].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {c.canEdit && (
                  <div className="pt-btns">
                    {!c.is_default && (
                      <button
                        type="button"
                        className="btn btn-g btn-s pt-btn-sm"
                        disabled={pending}
                        onClick={() => run(makeDefaultContact(c.id))}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-g btn-s pt-btn-sm"
                      onClick={() => setEditing(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-g btn-s pt-btn-sm"
                      disabled={pending}
                      onClick={() => run(deleteContact(c.id))}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <ContactSheet
          contact={editing === "new" ? null : editing}
          first={!contacts.length}
          onClose={() => setEditing(null)}
          say={say}
        />
      )}
      {toast}
    </>
  );
}

function ContactSheet({
  contact,
  first,
  onClose,
  say,
}: {
  contact: ContactRow | null;
  first: boolean;
  onClose: () => void;
  say: (m: string) => void;
}) {
  const [state, save, saving] = useActionState(async (prev: Result | undefined, form: FormData) => {
    const r = await saveContact(prev, form);
    if (r.ok) {
      say(r.notice ?? "Saved.");
      onClose();
    }
    return r;
  }, undefined);
  return (
    <Sheet title={contact ? "Edit contact" : "Add contact"} onClose={onClose}>
      <form action={save} className="pt-form" noValidate>
        {contact && <input type="hidden" name="id" value={contact.id} />}
        <label className="pt-field">
          Name
          <input type="text" name="name" required defaultValue={contact?.name} />
        </label>
        <label className="pt-field">
          Role (optional)
          <input
            type="text"
            name="role"
            placeholder="e.g. Sales agent"
            defaultValue={contact?.role ?? ""}
          />
        </label>
        <PhoneField label="WhatsApp (optional)" defaultE164={contact?.whatsapp} />
        <label className="pt-field">
          Email (optional)
          <input
            type="email"
            name="email"
            autoCapitalize="none"
            defaultValue={contact?.email ?? ""}
          />
        </label>
        <label className="pt-field">
          RERA / BRN number (optional)
          <input type="text" name="brn" defaultValue={contact?.brn ?? ""} />
        </label>
        {contact ? (
          <ContactPhoto contact={contact} />
        ) : (
          <span className="pt-meta">You can add a photo after saving.</span>
        )}
        <label className="pt-check">
          <input
            type="checkbox"
            name="is_default"
            defaultChecked={contact ? contact.is_default : first}
          />{" "}
          Default contact
        </label>
        {state?.error && (
          <p className="pt-error" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="btn btn-p" disabled={saving}>
          {saving ? "Saving…" : "Save contact"}
        </button>
      </form>
    </Sheet>
  );
}

/** Optional photo for share pages: shrunk to a small WebP in the browser, then straight to R2. */
function ContactPhoto({ contact }: { contact: ContactRow }) {
  const [preview, setPreview] = useState(contact.photo);
  const [state, setState] = useState("");
  async function upload(f: File) {
    setState("Uploading…");
    const small = await makeThumb(f, 320);
    if (!small) return setState("Use a JPG, PNG or WebP photo.");
    const r = await contactPhotoUrl(contact.id);
    if (!r.ok || !r.url || !r.key) return setState(r.error ?? "Couldn’t upload.");
    if (!(await putBlob(r.url, small))) return setState("Couldn’t upload. Try again.");
    const saved = await setContactPhoto(contact.id, r.key);
    if (!saved.ok) return setState(saved.error ?? "Couldn’t save.");
    setPreview(URL.createObjectURL(small));
    setState("Photo saved.");
  }
  return (
    <div className="pt-field">
      <label htmlFor={`photo-${contact.id}`}>Photo (optional, shown on share pages)</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {preview && <img src={preview} alt="" className="pt-avatar-img" />}
        <input
          id={`photo-${contact.id}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      {preview && (
        <button
          type="button"
          className="lnk pt-small"
          style={{ justifySelf: "start" }}
          onClick={async () => {
            const r = await setContactPhoto(contact.id, null);
            if (r.ok) setPreview(null);
            setState(r.ok ? "Photo removed." : (r.error ?? "Couldn’t remove."));
          }}
        >
          Remove photo
        </button>
      )}
      <span className="pt-meta" role="status">
        {state}
      </span>
    </div>
  );
}
