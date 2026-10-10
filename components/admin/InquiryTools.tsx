"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminAttachmentLink,
  replyAsMilkywayy,
  setInquiryStatusAdmin,
  type AdminInquiryResult,
} from "@/lib/portal/admin-inquiry-actions";

/** Reply in the thread; an optional private link shows to the client as "Open link ↗". */
export function InquiryReply({ id }: { id: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [r, setR] = useState<AdminInquiryResult>();
  const [pending, start] = useTransition();
  return (
    <form
      className="ad-form"
      aria-label="Reply"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await replyAsMilkywayy(id, body, link, label);
          setR(res);
          if (res.ok) {
            setBody("");
            setLink("");
            setLabel("");
            router.refresh();
          }
        });
      }}
    >
      <div className="ad-field">
        <label htmlFor="inq-body">Reply</label>
        <textarea
          id="inq-body"
          rows={5}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="ad-grid2">
        <div className="ad-field">
          <label htmlFor="inq-link">Private link (optional)</label>
          <input
            id="inq-link"
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="inq-label">What it is (optional)</label>
          <input
            id="inq-label"
            maxLength={80}
            placeholder="Raw footage, 12 Oct"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
      <div className="ad-btns" style={{ alignItems: "center" }}>
        <button type="submit" className="ad-btn small" disabled={pending || !body.trim()}>
          Send reply
        </button>
        {pending ? (
          <span className="ad-small ad-muted">Sending…</span>
        ) : (
          r && (
            <span className={r.ok ? "ad-small" : "ad-err"} role={r.ok ? "status" : "alert"}>
              {r.ok ? r.notice : r.error}
            </span>
          )
        )}
      </div>
    </form>
  );
}

export function InquiryStatus({ id, status }: { id: string; status: "open" | "resolved" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="ad-btn ghost small"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setInquiryStatusAdmin(id, status === "open" ? "resolved" : "open");
          router.refresh();
        })
      }
    >
      {status === "open" ? "Mark resolved" : "Reopen"}
    </button>
  );
}

export function AdminAttachment({ k, name }: { k: string; name: string }) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <span>
      <button
        type="button"
        className="ad-btn quiet small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await adminAttachmentLink(k, name);
            if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
            else setErr(r.error ?? "Couldn’t open it.");
          })
        }
      >
        📎 {name}
      </button>
      {err && <span className="ad-err"> {err}</span>}
    </span>
  );
}
