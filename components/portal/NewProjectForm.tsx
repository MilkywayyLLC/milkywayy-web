"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FilePicker, UploadRows, useClientUploads } from "@/components/portal/ClientUpload";
import {
  AVATAR_FORMATS,
  avatarEstimate,
  avatarLength,
  type AvatarFormat,
} from "@/lib/portal/booking";
import { createProject } from "@/lib/portal/project-actions";
import { EDIT_KINDS, TYPE_PATH } from "@/lib/portal/projects";
import type { RequestConfig } from "@/lib/portal/requests";
import { PriceBlock } from "./BookingModal";
import {
  DraftOffer,
  Field,
  FormBanner,
  Modal,
  useCloseGuard,
  useDraft,
  useFormCheck,
} from "./forms";

type Link2 = { label: string; url: string };
type Snap = {
  kind: string;
  kindOther: string;
  title: string;
  quantity: string;
  notes: string;
  reference: string;
  links: Link2[];
  mode: "links" | "upload";
  format: AvatarFormat | "";
  stop: number;
  scriptBy: "milkywayy" | "client";
};
const isHttps = (u: string) => /^https:\/\/\S+$/.test(u.trim());
const QTY_FOR: Record<string, number> = { hdr_photos: 50, short_form: 5, long_form: 2 };
const EDIT_TURNAROUND: Record<string, string> = {
  hdr_photos: "hdr_edit",
  short_form: "short_edit",
  long_form: "long_edit",
};

/**
 * "Edit my files" and "AI avatar video" (owner, 10 Oct 2026), as modals. Editing: the type (Other
 * asks what type), title, quantity, notes, a reference link and the raw files (links or upload).
 * Avatar: short or long form, a length slider with snap points and a live estimate from the
 * client's rates (shown by who's looking), the script toggle, brief, reference and files; the
 * title is optional. Both autosave as drafts (files themselves aren't kept in a draft).
 */
export function ProjectRequestModal({
  type,
  cfg,
  resume,
  onClose,
  onBack,
}: {
  type: "edit" | "avatar";
  cfg: RequestConfig;
  resume?: boolean;
  onClose: () => void;
  /** Back to "What do you need?". */
  onBack?: () => void;
}) {
  const avatar = type === "avatar";
  const [s, setS] = useState<Snap>({
    kind: "",
    kindOther: "",
    title: "",
    quantity: "",
    notes: "",
    reference: "",
    links: [{ label: avatar ? "Logo and assets" : "Raw files", url: "" }],
    mode: "links",
    // Short form is the usual one: chosen when the modal opens (owner, 10 Oct 2026).
    format: avatar ? "short" : "",
    stop: 0,
    scriptBy: "milkywayy",
  });
  const [touched, setTouched] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<{ ref: string; failed: boolean }>();
  const { rows, busy, upload } = useClientUploads();
  const set = (patch: Partial<Snap>) => {
    setTouched(true);
    setS((x) => ({ ...x, ...patch }));
  };
  const restore = useCallback((d: Snap) => {
    setS((x) => ({ ...x, ...d }));
    setTouched(true);
  }, []);
  const draft = useDraft(type, s as unknown as Record<string, unknown>, {
    touched: touched && !made,
    resume,
    onRestore: restore as unknown as (d: Record<string, unknown>) => void,
  });
  const guard = useCloseGuard({
    dirty: touched && !made,
    close: onClose,
    saveNow: draft.saveNow,
    discard: draft.discard,
  });

  const fmt = s.format ? AVATAR_FORMATS[s.format] : null;
  const length = fmt ? fmt.stops[s.stop] : 0;
  const est = s.format ? avatarEstimate(s.format, length, cfg.price.rates) : null;

  const form = useFormCheck(() => ({
    kind: !avatar && !s.kind && "Choose the type of edit.",
    kindOther: !avatar && s.kind === "other" && !s.kindOther.trim() && "Say what type of edit.",
    format: avatar && !s.format && "Choose short form or long form.",
    title: !avatar && !s.title.trim() && "Give it a title.",
    quantity:
      s.quantity !== "" &&
      !(Number(s.quantity) >= 1 && Number(s.quantity) <= 10000) &&
      "A number from 1.",
    reference:
      s.reference.trim() && !isHttps(s.reference) && "Paste a full link starting with https://",
    files: !avatar
      ? s.mode === "links"
        ? !s.links.some((l) => l.url.trim()) &&
          "Paste a link to the raw files, or switch to Upload."
        : !files.length && "Choose the raw files to upload, or paste a link."
      : false,
    links:
      s.mode === "links" &&
      s.links.some((l) => l.url.trim() && !isHttps(l.url)) &&
      "Links must start with https://",
  }));

  async function submit() {
    if (!form.check()) return;
    setSaving(true);
    const r = await createProject({
      type,
      title: s.title,
      kind: avatar ? "" : s.kind,
      kindOther: s.kindOther,
      ...(avatar && s.format ? { avatar: { format: s.format, length } } : {}),
      quantity: Number(s.quantity) || null,
      notes: s.notes,
      references: [s.reference],
      scriptBy: s.scriptBy,
      links: s.mode === "links" ? s.links : [],
    });
    if (!r.ok) {
      setSaving(false);
      return form.fail(r.error ?? "Couldn’t send it. Try again.");
    }
    let failed = false;
    if (s.mode === "upload" && files.length) failed = (await upload(r.id!, files)) < files.length;
    setMade({ ref: r.ref!, failed });
    setSaving(false);
  }

  const title = avatar ? "AI avatar video" : "Edit my files";
  const ta = avatar
    ? s.format
      ? cfg.turnaround[s.format === "short" ? "avatar_short" : "avatar_long"]
      : ""
    : cfg.turnaround[EDIT_TURNAROUND[s.kind] ?? ""];

  if (made)
    return (
      <Modal title={title} onClose={onClose} testId={`${type}-modal`}>
        <div className="pt-form" role="status">
          <span className="pt-eb">
            {made.ref} · {avatar ? "Brief received" : "Submitted"}
          </span>
          <b style={{ fontSize: 20 }}>{avatar ? "Brief received" : "Files received"}</b>
          <p style={{ margin: 0 }}>
            {avatar
              ? "We’ll write the script and post it for your approval. You’ll get an email."
              : "We’ll check the files and start, usually within a few hours. You’ll get an email."}
          </p>
          {made.failed && (
            <p className="pt-error" role="alert">
              Some files didn’t upload. Open it and add them again: uploads pick up where they
              stopped.
            </p>
          )}
          <UploadRows rows={rows} />
          <div className="pt-btns">
            <Link
              href={`${TYPE_PATH[type]}/${encodeURIComponent(made.ref)}`}
              className="btn btn-p btn-s"
              onClick={onClose}
            >
              Open it
            </Link>
            <button type="button" className="btn btn-g btn-s" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      title={title}
      onClose={guard.request}
      testId={`${type}-modal`}
      footer={
        <>
          {onBack && (
            <button
              type="button"
              className="btn btn-g btn-s"
              onClick={() => {
                if (touched) void draft.saveNow();
                onBack();
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-p btn-s"
            disabled={saving || busy}
            onClick={() => void submit()}
          >
            {busy ? "Uploading…" : saving ? "Sending…" : avatar ? "Send brief" : "Send files"}
          </button>
        </>
      }
    >
      <div className="pt-form">
        <DraftOffer
          offer={draft.offer}
          onContinue={draft.continueOffer}
          onFresh={draft.startFresh}
        />
        <FormBanner text={form.banner} />

        {avatar ? (
          <>
            <Field name="format" label="Format" required group error={form.errors.format}>
              <div className="pt-seg pt-seg-stack" role="group" aria-label="Format">
                {(Object.keys(AVATAR_FORMATS) as AvatarFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={s.format === f}
                    onClick={() => set({ format: f, stop: 0 })}
                  >
                    {AVATAR_FORMATS[f].label}
                  </button>
                ))}
              </div>
            </Field>
            {fmt && s.format && (
              <Field name="length" label={`Length: ${avatarLength(s.format, length)}`} group>
                <input
                  type="range"
                  className="pt-slider"
                  min={0}
                  max={fmt.stops.length - 1}
                  step={1}
                  value={s.stop}
                  aria-label="Length"
                  aria-valuetext={avatarLength(s.format, length)}
                  onChange={(e) => set({ stop: Number(e.target.value) })}
                />
                <span className="pt-slider-ticks" aria-hidden="true">
                  {fmt.stops.map((n) => (
                    <span key={n}>{avatarLength(s.format as AvatarFormat, n)}</span>
                  ))}
                </span>
              </Field>
            )}
            {s.format && (
              <PriceBlock
                cfg={cfg}
                lines={[
                  {
                    label: `Avatar video · ${avatarLength(s.format, length)}`,
                    qty: 1,
                    amount: est,
                  },
                ]}
                total={est}
              />
            )}
            <Field name="script" label="Script" group>
              <div className="pt-seg" role="group" aria-label="Who writes the script">
                <button
                  type="button"
                  aria-pressed={s.scriptBy === "milkywayy"}
                  onClick={() => set({ scriptBy: "milkywayy" })}
                >
                  Milkywayy writes it
                </button>
                <button
                  type="button"
                  aria-pressed={s.scriptBy === "client"}
                  onClick={() => set({ scriptBy: "client" })}
                >
                  I’ll send it
                </button>
              </div>
            </Field>
            <Field
              name="title"
              label="Title"
              hint={`Leave empty for “${s.format ? `${s.format === "short" ? "Short form" : "Long form"} · ${avatarLength(s.format, length)}` : "Short form · 30s"}”`}
            >
              <input
                type="text"
                maxLength={160}
                value={s.title}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field name="kind" label="Type of edit" required group error={form.errors.kind}>
              <div className="pt-chips" role="group" aria-label="Type of edit">
                {EDIT_KINDS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className="pt-pill"
                    style={{ padding: "4px 14px" }}
                    aria-pressed={s.kind === k}
                    onClick={() =>
                      set({
                        kind: k,
                        // A starting quantity per type; theirs to change (empty for Other).
                        quantity: String(QTY_FOR[k] ?? ""),
                      })
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            {s.kind === "other" && (
              <Field
                name="kindOther"
                label="What type of edit?"
                required
                error={form.errors.kindOther}
              >
                <input
                  type="text"
                  maxLength={120}
                  value={s.kindOther}
                  placeholder="e.g. Drone footage colour grade"
                  onChange={(e) => set({ kindOther: e.target.value })}
                />
              </Field>
            )}
            <div className="pt-grid2" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <Field name="title" label="Title" required error={form.errors.title}>
                <input
                  type="text"
                  maxLength={160}
                  value={s.title}
                  placeholder="e.g. Willow Creek: October listings"
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field name="quantity" label="Quantity" error={form.errors.quantity}>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  inputMode="numeric"
                  value={s.quantity}
                  placeholder={s.kind === "hdr_photos" ? "e.g. 120" : "e.g. 6"}
                  onChange={(e) => set({ quantity: e.target.value })}
                />
              </Field>
            </div>
          </>
        )}

        <Field name="notes" label={avatar ? "Brief" : "Notes"}>
          <textarea
            maxLength={4000}
            value={s.notes}
            placeholder={
              avatar
                ? s.scriptBy === "client"
                  ? "Paste your script here, plus who it’s for and the tone"
                  : "What the video is about, who it’s for, key points, the call to action"
                : "Style, music, captions, anything we should know"
            }
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <Field name="reference" label="Reference link" error={form.errors.reference}>
          <input
            type="url"
            value={s.reference}
            placeholder={
              avatar ? "A video in the style you want" : "A video or photos in the style you want"
            }
            onChange={(e) => set({ reference: e.target.value })}
          />
        </Field>

        <Field
          name="files"
          label={avatar ? "Files (logo, footage, brand assets)" : "Raw files"}
          required={!avatar}
          group
          error={form.errors.files ?? form.errors.links}
        >
          <div className="pt-seg" role="group" aria-label="How to send files">
            <button
              type="button"
              aria-pressed={s.mode === "links"}
              onClick={() => set({ mode: "links" })}
            >
              Paste links
            </button>
            <button
              type="button"
              aria-pressed={s.mode === "upload"}
              onClick={() => set({ mode: "upload" })}
            >
              Upload
            </button>
          </div>
        </Field>
        {s.mode === "links" ? (
          <>
            {s.links.map((l, i) => (
              <div
                key={i}
                className="pt-grid2"
                style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 8 }}
              >
                <input
                  type="text"
                  aria-label={`Label ${i + 1}`}
                  value={l.label}
                  maxLength={160}
                  onChange={(e) =>
                    set({
                      links: s.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    })
                  }
                />
                <input
                  type="url"
                  aria-label={`Link ${i + 1}`}
                  value={l.url}
                  placeholder="Drive, Dropbox, OneDrive, WeTransfer or Frame.io"
                  onChange={(e) =>
                    set({
                      links: s.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    })
                  }
                />
              </div>
            ))}
            {s.links.length < 10 && (
              <button
                type="button"
                className="lnk pt-small"
                style={{ justifySelf: "start" }}
                onClick={() => set({ links: [...s.links, { label: "More files", url: "" }] })}
              >
                + Add another link
              </button>
            )}
            <span className="pt-meta">Set the link to “anyone with the link can view”.</span>
          </>
        ) : (
          <FilePicker
            files={files}
            onChange={(f) => {
              setTouched(true);
              setFiles(f);
            }}
            maxGb={cfg.maxGb}
            disabled={saving}
          />
        )}
        <UploadRows rows={rows} />
        {ta && <span className="pt-turnaround">Usual turnaround: {ta}</span>}
      </div>
      {guard.dialog}
    </Modal>
  );
}
