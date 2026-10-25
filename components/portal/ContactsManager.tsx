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
import { initials } from "@/lib/portal/shell";
import { ContactPhotoField, photoPick, savePickedPhoto } from "./ContactPhotoField";
import { ChoiceDialog } from "./forms";
import { Icon } from "./Icon";
import { Sheet, useToast } from "./ui";

export type ContactRow = {
  id: string;
  name: string;
  role: string | null;
  whatsapp: string | null;
  email: string | null;
  brn: string | null;
  is_default: boolean;
  canEdit: boolean;
  /** Linked to a teammate's login. */
  hasLogin?: boolean;
  /** Signed preview of the contact's photo (shown on share pages). */
  photo: string | null;
};

/**
 * Listing contacts on People (owner, 25 Oct 2026): one pill per person (round photo + name); tap
 * one to edit it in a sheet. The company comes first and is the default when no person is.
 * Agents get their own card when they're invited, so they're selectable on share pages.
 */
export function ContactsManager({
  contacts,
  company,
}: {
  contacts: ContactRow[];
  company: string;
}) {
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const [removing, setRemoving] = useState<ContactRow | null>(null);
  const [, start] = useTransition();
  const [toast, say] = useToast();
  const run = (p: Promise<Result>) =>
    start(async () => {
      const r = await p;
      say(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
    });
  const anyDefault = contacts.some((c) => c.is_default);

  return (
    <section className="pt-sec" aria-labelledby="lc-h" data-testid="people-contacts">
      <div className="pt-sec-head">
        <div>
          <h2 id="lc-h" className="pt-h2">
            Listing contacts
          </h2>
          <span className="pt-meta">
            Shown on your listing pages. When you share one you just tap a pill; the default is
            picked for you.
          </span>
        </div>
        <button type="button" className="btn btn-g btn-s" onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} /> Add contact
        </button>
      </div>
      <div className="pt-pills" data-testid="pills">
        {!anyDefault && (
          <span className="pt-pill" aria-pressed="true" data-testid="pill-company">
            <span className="pt-pill-face">{initials(company)}</span>
            <span>
              {company}
              <small>Company · Default</small>
            </span>
          </span>
        )}
        {contacts.map((c) => {
          const face = c.photo ? (
            <img src={c.photo} alt="" className="pt-pill-face" style={{ objectFit: "cover" }} />
          ) : (
            <span className="pt-pill-face">{initials(c.name)}</span>
          );
          const text = (
            <span>
              {c.name}
              <small>
                {[c.is_default ? "Default" : null, c.hasLogin ? "Team" : null, c.role]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          );
          return c.canEdit ? (
            <button
              key={c.id}
              type="button"
              className="pt-pill"
              aria-pressed={c.is_default ? "true" : "false"}
              aria-label={`Edit ${c.name}`}
              onClick={() => setEditing(c)}
            >
              {face}
              {text}
            </button>
          ) : (
            <span key={c.id} className="pt-pill" aria-pressed={c.is_default ? "true" : "false"}>
              {face}
              {text}
            </span>
          );
        })}
      </div>
      {editing && (
        <ContactSheet
          contact={editing === "new" ? null : editing}
          first={!contacts.length}
          onClose={() => setEditing(null)}
          onRemove={(c) => {
            setEditing(null);
            setRemoving(c);
          }}
          onDefault={(c) => {
            setEditing(null);
            run(makeDefaultContact(c.id));
          }}
          say={say}
        />
      )}
      {removing && (
        <ChoiceDialog
          title={`Remove ${removing.name}?`}
          body="They come off your contacts and any listing page that shows them."
          choices={[
            { label: "Keep", onClick: () => setRemoving(null) },
            {
              label: "Remove",
              danger: true,
              onClick: () => {
                const id = removing.id;
                setRemoving(null);
                run(deleteContact(id));
              },
            },
          ]}
          onDismiss={() => setRemoving(null)}
        />
      )}
      {toast}
    </section>
  );
}

function ContactSheet({
  contact,
  first,
  onClose,
  onRemove,
  onDefault,
  say,
}: {
  contact: ContactRow | null;
  first: boolean;
  onClose: () => void;
  onRemove: (c: ContactRow) => void;
  onDefault: (c: ContactRow) => void;
  say: (m: string) => void;
}) {
  const [photo, setPhoto] = useState(() => photoPick(contact?.photo));
  const [name, setName] = useState(contact?.name ?? "");
  const [photoErr, setPhotoErr] = useState("");
  const [state, save, saving] = useActionState(async (prev: Result | undefined, form: FormData) => {
    const r = await saveContact(prev, form);
    if (r.ok) {
      // The photo follows the save, so a new contact gets it too.
      const err = r.id ? await savePickedPhoto(r.id, photo) : null;
      say(err ?? r.notice ?? "Saved.");
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
          <input
            type="text"
            name="name"
            required
            defaultValue={contact?.name}
            onChange={(e) => setName(e.target.value)}
          />
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
        <ContactPhotoField
          value={photo}
          onChange={(v) => {
            setPhotoErr("");
            setPhoto(v);
          }}
          initials={name.trim() ? initials(name) : ""}
          onError={setPhotoErr}
        />
        {photoErr && (
          <p className="pt-error" role="alert">
            {photoErr}
          </p>
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
        {contact && (
          <div className="pt-btns">
            {!contact.is_default && (
              <button type="button" className="btn btn-g btn-s" onClick={() => onDefault(contact)}>
                Make default
              </button>
            )}
            <button type="button" className="btn btn-g btn-s" onClick={() => onRemove(contact)}>
              Remove
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
