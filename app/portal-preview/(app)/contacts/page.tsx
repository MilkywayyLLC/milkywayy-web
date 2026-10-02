"use client";

import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { useContacts } from "@/components/portal-mock/ShareSheet";
import { Badge, Sheet, useToast } from "@/components/portal/ui";

export default function Contacts() {
  const contacts = useContacts();
  const [add, setAdd] = useState(false);
  const [toast, say] = useToast();

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Shown on your listing pages</span>
          <h1 className="pt-h1">Contacts</h1>
        </div>
        <button type="button" className="btn btn-p btn-s" onClick={() => setAdd(true)}>
          <Icon name="plus" size={16} /> Add contact
        </button>
      </div>
      <p className="pt-muted" style={{ margin: 0 }}>
        When you create a share link you just tap a pill. The default one is picked for you.
      </p>
      <div className="pt-pills">
        {contacts.map((c) => (
          <span key={c.id} className="pt-pill" aria-pressed={c.default ? "true" : "false"}>
            <span className="pt-pill-face">{c.initials}</span>
            <span>
              {c.name}
              <small>{[c.role, c.brn].filter(Boolean).join(" · ")}</small>
            </span>
          </span>
        ))}
      </div>
      <div className="pt-list">
        {contacts.map((c) => (
          <div key={c.id} className="pt-row">
            <div>
              <b>{c.name}</b> {c.default && <Badge>Default</Badge>}
              <div className="pt-meta">
                {[c.role, c.whatsapp, c.brn].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-g btn-s pt-btn-sm"
              onClick={() => setAdd(true)}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {add && (
        <Sheet title="Contact" onClose={() => setAdd(false)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setAdd(false);
              say("Contact saved (mockup)");
            }}
          >
            <label className="pt-field">
              Name *
              <input type="text" required />
            </label>
            <label className="pt-field">
              Role
              <input type="text" placeholder="e.g. Sales agent" />
            </label>
            <label className="pt-field">
              WhatsApp *
              <input type="tel" placeholder="+971 5x xxx xxxx" required />
            </label>
            <label className="pt-field">
              Email
              <input type="email" />
            </label>
            <label className="pt-field">
              RERA / BRN number (optional)
              <input type="text" />
            </label>
            <button type="button" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
              Add a photo (optional)
            </button>
            <label className="pt-check">
              <input type="checkbox" /> Make this the default contact
            </label>
            <button type="submit" className="btn btn-p">
              Save contact
            </button>
          </form>
        </Sheet>
      )}
      {toast}
    </>
  );
}
