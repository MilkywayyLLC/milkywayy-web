"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  attachmentLink,
  createInquiry,
  replyInquiry,
  setInquiryStatus,
  startAttachment,
  type Attachment,
} from "@/lib/portal/inquiry-actions";

async function upload(file: File): Promise<Attachment | string> {
  const s = await startAttachment(file.name, file.size);
  if (!s.ok || !s.url || !s.key) return s.error ?? "Couldn’t attach it.";
  const res = await fetch(s.url, { method: "PUT", body: file }).catch(() => null);
  if (!res?.ok) return "The attachment didn’t upload. Try again.";
  return {
    key: s.key,
    name: file.name,
    bytes: file.size,
    type: file.type || "application/octet-stream",
  };
}

function AttachInput({ onFile }: { onFile: (f: File | null) => void }) {
  return (
    <label className="pt-field">
      Attachment (optional, up to 25 MB)
      <input type="file" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/** A new inquiry: subject, an optional related shoot, the message and an optional file. */
export function NewInquiryForm({
  projects,
  canAttach,
}: {
  projects: { id: string; label: string }[];
  canAttach: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="pt-card pt-form"
      aria-label="New inquiry"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          let att: Attachment | null = null;
          if (file) {
            const up = await upload(file);
            if (typeof up === "string") return setErr(up);
            att = up;
          }
          const r = await createInquiry({
            subject: String(f.get("subject") ?? ""),
            body: String(f.get("body") ?? ""),
            project: String(f.get("project") ?? "") || null,
            attachment: att,
          });
          if (!r.ok) return setErr(r.error ?? "Couldn’t send it.");
          router.push(`/portal/inquiries/${r.id}?sent=1`);
        });
      }}
    >
      <label className="pt-field">
        Subject
        <input
          name="subject"
          maxLength={140}
          required
          placeholder="e.g. Raw footage from Tuesday"
        />
      </label>
      <label className="pt-field">
        Related shoot (optional)
        <select name="project" defaultValue="">
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="pt-field">
        Message
        <textarea name="body" rows={6} maxLength={4000} required />
      </label>
      {canAttach && <AttachInput onFile={setFile} />}
      {err && (
        <p className="pt-error" role="alert">
          {err}
        </p>
      )}
      <div className="pt-btns">
        <button type="submit" className="btn btn-p btn-s" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

export function ReplyForm({ id, canAttach }: { id: string; canAttach: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="pt-form"
      aria-label="Reply"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        start(async () => {
          let att: Attachment | null = null;
          if (file) {
            const up = await upload(file);
            if (typeof up === "string") return setErr(up);
            att = up;
          }
          const r = await replyInquiry(id, body, att);
          if (!r.ok) return setErr(r.error ?? "Couldn’t send it.");
          setBody("");
          setFile(null);
          form.reset();
          setErr("");
          router.refresh();
        });
      }}
    >
      <label className="pt-field">
        Reply
        <textarea
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {canAttach && <AttachInput onFile={setFile} />}
      {err && (
        <p className="pt-error" role="alert">
          {err}
        </p>
      )}
      <div className="pt-btns">
        <button type="submit" className="btn btn-p btn-s" disabled={pending || !body.trim()}>
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

export function StatusToggle({ id, status }: { id: string; status: "open" | "resolved" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-g btn-s"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setInquiryStatus(id, status === "open" ? "resolved" : "open");
          router.refresh();
        })
      }
    >
      {status === "open" ? "Mark resolved" : "Reopen"}
    </button>
  );
}

export function AttachmentButton({ messageId, name }: { messageId: string; name: string }) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="pt-link-btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await attachmentLink(messageId);
            if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
            else setErr(r.error ?? "Couldn’t open it.");
          })
        }
      >
        📎 {name}
      </button>
      {err && <span className="pt-error">{err}</span>}
    </>
  );
}
