"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FilePicker, UploadRows, useClientUploads } from "@/components/portal/ClientUpload";
import {
  AVATAR_FORMATS,
  avatarEstimate,
  avatarLength,
  EDIT_LISTING_MAX,
  editItemLines,
  editLongPrice,
  LONG_LENGTHS,
  type AvatarFormat,
  type EditItems,
} from "@/lib/portal/booking";
import { createProject, updateAvatarBrief } from "@/lib/portal/project-actions";
import { TYPE_PATH } from "@/lib/portal/projects";
import type { RequestConfig } from "@/lib/portal/requests";
import { money } from "@/lib/portal/billing";
import { BookStep, Counter, ThankYou } from "./BookFrame";
import { BookingPanel, priceView, type PanelLine } from "./bookPrice";
import { confirmText, DueNow, PanelTerms, TermsCheck } from "./BookingTerms";
import { PriceBlock } from "./PriceBlock";
import {
  DraftOffer,
  Field,
  FormBanner,
  Modal,
  useCloseGuard,
  useDraft,
  useFormCheck,
  useLeaveGuard,
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
  /** Avatar videos: the approved character(s) presenting it. */
  presenters?: string[];
  /** Long-form edits (28 Oct 2026): each video's length, priced by length. */
  minutes?: number;
  /** Edit only (28 Oct 2026): one Edits card. */
  short?: number;
  longs?: number[];
  listings?: { name: string; count: string }[];
};
/** "Edit request" on an avatar video we haven't started (owner, 17 Oct 2026): its brief. */
export type AvatarEdit = {
  projectId: string;
  ref: string;
  title: string;
  format: AvatarFormat;
  stop: number;
  notes: string;
  reference: string;
  scriptBy: "milkywayy" | "client";
  presenters: string[];
  /** Files already on it (links and uploads), listed above the picker. */
  files: { id: string; label: string }[];
};
/** An approved character, as the video form's presenter picker shows it. */
export type Presenter = { id: string; name: string; src: string | null };
const isHttps = (u: string) => /^https:\/\/\S+$/.test(u.trim());

/**
 * "Edit my files" (on the Book media page, 18 Oct 2026) and "AI avatar video" (a modal). Editing: the type (Other
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
  characters = [],
  edit,
  onAnother,
}: {
  /** Editing, on the Book media page: the thank-you's "Book another". */
  onAnother?: () => void;
  type: "edit" | "avatar";
  /** Avatar videos: edit this brief instead of starting one (no draft). */
  edit?: AvatarEdit;
  cfg: RequestConfig;
  /** Avatar videos: the account's approved characters (one or more present the video). */
  characters?: Presenter[];
  resume?: boolean;
  /** Avatar videos (a modal): close it. */
  onClose?: () => void;
  /** Editing: back to "What are you booking?". */
  onBack?: () => void;
}) {
  const avatar = type === "avatar";
  const [s, setS] = useState<Snap>({
    kind: "",
    kindOther: "",
    title: edit?.title ?? "",
    quantity: "",
    minutes: 10,
    short: 0,
    longs: [],
    listings: [],
    notes: edit?.notes ?? "",
    reference: edit?.reference ?? "",
    links: [{ label: avatar ? "Logo and assets" : "Raw files", url: "" }],
    mode: "links",
    // Short form is the usual one: chosen when the modal opens (owner, 10 Oct 2026).
    format: edit?.format ?? (avatar ? "short" : ""),
    stop: edit?.stop ?? 0,
    scriptBy: edit?.scriptBy ?? "milkywayy",
    // One approved character: chosen already.
    presenters: edit?.presenters ?? (avatar && characters.length === 1 ? [characters[0].id] : []),
  });
  const [touched, setTouched] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<{ ref: string; failed: boolean }>();
  // Booking Terms (owner, 24 Oct 2026): required on every new request.
  const [agreed, setAgreed] = useState(false);
  const [termsErr, setTermsErr] = useState("");
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
    enabled: !edit,
  });
  // Editing is a page (owner, 18 Oct 2026): leaving with unsaved input asks first.
  const leave = useLeaveGuard({
    dirty: type === "edit" && touched && !made,
    saveNow: draft.saveNow,
    discard: draft.discard,
  });
  const guard = useCloseGuard({
    dirty: touched && !made,
    close: () => onClose?.(),
    saveNow: draft.saveNow,
    discard: draft.discard,
  });

  const fmt = s.format ? AVATAR_FORMATS[s.format] : null;
  const length = fmt ? fmt.stops[Math.min(s.stop, fmt.stops.length - 1)] : 0;
  const est = s.format ? avatarEstimate(s.format, length, cfg.price.rates) : null;
  // Edit only: the request's items at the client's rates (null while one is unpriced).
  const items: EditItems = {
    short: s.short ?? 0,
    longs: s.longs ?? [],
    listings: (s.listings ?? []).map((l) => ({ name: l.name, count: Number(l.count) || 0 })),
  };
  const itemLines = editItemLines(
    { ...items, listings: items.listings.filter((l) => l.count > 0) },
    cfg.price.rates,
  );
  const hasItems = itemLines.length > 0;
  const itemsEst =
    hasItems && itemLines.every((l) => l.amount != null)
      ? itemLines.reduce((n, l) => n + Number(l.amount), 0)
      : null;
  // What's due now (payment terms): the avatar estimate, or the edit request's total.
  const reqEst = avatar ? est : itemsEst;
  const sendLabel = edit ? null : confirmText(cfg.terms, reqEst, cfg.card, cfg.price.currency);

  const form = useFormCheck(() => ({
    kind: !avatar && !hasItems && "Add at least one edit.",
    // An older video edited with no approved character to pick keeps going without one.
    presenters:
      avatar &&
      !(edit && !characters.length) &&
      !(s.presenters ?? []).some((id) => characters.some((c) => c.id === id)) &&
      "Choose your AI avatar.",
    format: avatar && !s.format && "Choose short form or long form.",
    title: !avatar && !s.title.trim() && "Give it a title.",
    listings:
      !avatar &&
      (s.listings ?? []).some(
        (l) => l.count !== "" && !(Number(l.count) >= 1 && Number(l.count) <= 10000),
      ) &&
      "Photos per listing: a number from 1.",
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
    if (!edit && !agreed) {
      setTermsErr("Tick the box to agree to the Booking Terms.");
      return;
    }
    setSaving(true);
    if (edit) {
      const r = await updateAvatarBrief(edit.projectId, {
        title: s.title,
        ...(s.format ? { avatar: { format: s.format, length } } : {}),
        notes: s.notes,
        references: [s.reference],
        scriptBy: s.scriptBy,
        links: s.mode === "links" ? s.links : [],
        characters: (s.presenters ?? []).filter((id) => characters.some((c) => c.id === id)),
      });
      if (!r.ok) {
        setSaving(false);
        return form.fail(r.error ?? "Couldn’t save it. Try again.");
      }
      let failed = false;
      if (s.mode === "upload" && files.length)
        failed = (await upload(edit.projectId, files)) < files.length;
      setMade({ ref: edit.ref, failed });
      setSaving(false);
      return;
    }
    const r = await createProject({
      type,
      title: s.title,
      kind: "",
      ...(avatar && s.format ? { avatar: { format: s.format, length } } : {}),
      ...(avatar
        ? {}
        : { items: { ...items, listings: items.listings.filter((l) => l.count > 0) } }),
      notes: s.notes,
      references: [s.reference],
      scriptBy: s.scriptBy,
      links: s.mode === "links" ? s.links : [],
      characters: avatar
        ? (s.presenters ?? []).filter((id) => characters.some((c) => c.id === id))
        : undefined,
      termsAccepted: agreed,
    });
    if (!r.ok) {
      setSaving(false);
      return form.fail(r.error ?? "Couldn’t send it. Try again.");
    }
    let failed = false;
    if (s.mode === "upload" && files.length) failed = (await upload(r.id!, files)) < files.length;
    // 50% / 100% with card payments on: to Stripe once the files are up.
    if (r.payUrl && !failed) return window.location.assign(r.payUrl);
    setMade({ ref: r.ref!, failed });
    setSaving(false);
  }

  const title = edit ? "Edit request" : avatar ? "AI avatar video" : "Edit my files";
  const ta = avatar
    ? s.format
      ? cfg.turnaround[s.format === "short" ? "avatar_short" : "avatar_long"]
      : ""
    : "";

  const m = (n: number) => money(cfg.price.currency, n);
  const rates = cfg.price.rates;
  const rate = (k: string) => (rates?.[k] == null ? null : Number(rates[k]));
  const set2 = (patch: Partial<Snap>) => set(patch);
  const listings = s.listings ?? [];
  const longs = s.longs ?? [];

  if (made && !avatar && !edit)
    return (
      <ThankYou
        idLabel="Request ID"
        id={made.ref}
        heading="Request sent"
        text="Our team will email you shortly."
      >
        <Link
          href={`${TYPE_PATH[type]}/${encodeURIComponent(made.ref)}`}
          className="btn btn-p btn-s"
        >
          Track request
        </Link>
        {onAnother && (
          <button type="button" className="btn btn-g btn-s" onClick={onAnother}>
            Book another
          </button>
        )}
        {made.failed && (
          <p className="pt-error" role="alert">
            Some files didn’t upload. Open it and add them again: uploads pick up where they
            stopped.
          </p>
        )}
        <UploadRows rows={rows} />
      </ThankYou>
    );

  if (made)
    return (
      <Modal title={title} onClose={() => onClose?.()} testId={`${type}-modal`}>
        <div className="pt-form" role="status">
          <span className="pt-eb">
            {made.ref} · {edit ? "Brief edited" : avatar ? "Brief received" : "Submitted"}
          </span>
          <b className="pt-h2">
            {edit ? "Brief updated" : avatar ? "Brief received" : "Files received"}
          </b>
          <p style={{ margin: 0 }}>
            {edit
              ? "We’ll work from the updated brief and post the script for your approval."
              : avatar
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
              onClick={() => onClose?.()}
            >
              Open it
            </Link>
            <button type="button" className="btn btn-g btn-s" onClick={() => onClose?.()}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    );

  const buttons = (
    <>
      <button
        type="button"
        className="btn btn-p btn-s"
        disabled={saving || busy}
        onClick={() => void submit()}
      >
        {busy
          ? "Uploading…"
          : saving
            ? "Sending…"
            : edit
              ? "Save changes"
              : sendLabel?.startsWith("Pay")
                ? sendLabel
                : avatar
                  ? "Send brief"
                  : "Send request"}
      </button>
    </>
  );
  const form_ = (
    <>
      <DraftOffer offer={draft.offer} onContinue={draft.continueOffer} onFresh={draft.startFresh} />
      <FormBanner text={form.banner} />

      {avatar ? (
        <>
          <Field
            name="presenters"
            label="Your AI avatar"
            required
            group
            error={form.errors.presenters}
            hint="Choose more than one for a video with several presenters."
          >
            <div className="pt-char-pick" role="group" aria-label="Your AI avatar">
              {characters.map((c) => {
                const on = (s.presenters ?? []).includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="pt-char-opt"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        presenters: on
                          ? (s.presenters ?? []).filter((x) => x !== c.id)
                          : [...(s.presenters ?? []), c.id].slice(0, 4),
                      })
                    }
                  >
                    {c.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.src} alt="" />
                    ) : (
                      <span className="pt-char-ph" aria-hidden="true" />
                    )}
                    <b>{c.name}</b>
                  </button>
                );
              })}
            </div>
          </Field>
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
          {fmt && s.format && fmt.stops.length === 1 && (
            <p className="pt-meta" style={{ margin: 0 }}>
              Length: {avatarLength(s.format, length)}. Longer videos are long form, priced per
              minute.
            </p>
          )}
          {fmt && s.format && fmt.stops.length > 1 && (
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
          <Field name="title" label="Title" required error={form.errors.title}>
            <input
              type="text"
              maxLength={160}
              value={s.title}
              placeholder="e.g. Willow Creek: October listings"
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <div className="bkp-box-card bkp-edits" data-field="kind">
            <div className="bkp-row">
              <span className="bkp-body">Edits</span>
            </div>
            <div className="bkp-row">
              <span className="bkp-check-t">
                Short-form edits
                <span className="bkp-muted">
                  Reels, up to 60 sec{rate("reel") != null ? ` · ${m(rate("reel")!)} each` : ""}
                </span>
              </span>
              <Counter
                label="Short-form edits"
                value={s.short ?? 0}
                min={0}
                max={10000}
                onChange={(n) => set({ short: n })}
              />
            </div>
            <div className="bkp-row">
              <span className="bkp-check-t">
                Long-form edits
                <span className="bkp-muted">YouTube, priced by length · over 30 min, we quote</span>
              </span>
              <Counter
                label="Long-form edits"
                value={longs.length}
                min={0}
                max={50}
                onChange={(n) =>
                  set({
                    longs:
                      n > longs.length
                        ? [...longs, ...Array.from({ length: n - longs.length }, () => 10)]
                        : longs.slice(0, n),
                  })
                }
              />
            </div>
            {longs.map((min, i) => {
              const at = Math.max(0, LONG_LENGTHS.indexOf(min as (typeof LONG_LENGTHS)[number]));
              const price = editLongPrice(min, rates);
              return (
                <div className="bkp-lform" key={i}>
                  <span className="bkp-muted">Long-form {i + 1}</span>
                  <input
                    type="range"
                    className="bkp-slider"
                    min={0}
                    max={LONG_LENGTHS.length - 1}
                    step={1}
                    value={at}
                    aria-label={`Long-form ${i + 1} length`}
                    aria-valuetext={`${min} min`}
                    style={{ ["--pct" as string]: `${(at / (LONG_LENGTHS.length - 1)) * 100}%` }}
                    onChange={(e) =>
                      set({
                        longs: longs.map((x, j) =>
                          j === i ? LONG_LENGTHS[Number(e.target.value)] : x,
                        ),
                      })
                    }
                  />
                  <b className="bkp-lform-v">
                    {min} min{price != null ? ` · ${m(price)}` : ""}
                    {price != null && (
                      <small className="bkp-muted">
                        {" "}
                        · {m(Math.round((price / min) * 100) / 100)}/min
                      </small>
                    )}
                  </b>
                </div>
              );
            })}
            <div className="bkp-row">
              <span className="bkp-check-t">
                Listing photo edits
                <span className="bkp-muted">
                  HDR{rate("photo") != null ? ` · ${m(rate("photo")!)} / photo` : ""} · one batch
                  per listing
                </span>
              </span>
            </div>
            {listings.map((l, i) => (
              <div className="bkp-listing" key={i}>
                <input
                  type="text"
                  maxLength={120}
                  aria-label={`Listing ${i + 1} name or address`}
                  value={l.name}
                  placeholder={`Listing ${i + 1} · name or address`}
                  onChange={(e) =>
                    set({
                      listings: listings.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Counter
                  label={`Listing ${i + 1} photos`}
                  value={Math.max(0, Number(l.count) || 0)}
                  min={1}
                  max={10000}
                  onChange={(n) =>
                    set({
                      listings: listings.map((x, j) => (j === i ? { ...x, count: String(n) } : x)),
                    })
                  }
                />
                <input
                  type="number"
                  className="bkp-listing-n"
                  min={1}
                  max={10000}
                  inputMode="numeric"
                  aria-label={`Listing ${i + 1} photo count`}
                  value={l.count}
                  onChange={(e) =>
                    set({
                      listings: listings.map((x, j) =>
                        j === i ? { ...x, count: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="lnk pt-small"
                  onClick={() => set({ listings: listings.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
            {listings.length < EDIT_LISTING_MAX && (
              <button
                type="button"
                className="lnk pt-small"
                style={{ justifySelf: "start" }}
                onClick={() => set2({ listings: [...listings, { name: "", count: "25" }] })}
              >
                + Add listing
              </button>
            )}
            {form.errors.listings && (
              <span className="pt-field-msg" role="alert">
                {form.errors.listings}
              </span>
            )}
            <p className="bkp-muted" style={{ margin: 0 }}>
              Something else? Tell us in the notes and we’ll quote.
            </p>
            {form.errors.kind && (
              <span className="pt-field-msg" role="alert">
                {form.errors.kind}
              </span>
            )}
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
        {edit && edit.files.length > 0 && (
          <span className="pt-meta" data-testid="files-attached">
            Already attached: {edit.files.map((f) => f.label).join(", ")}. Add more below.
          </span>
        )}
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
      {ta && avatar && <span className="pt-turnaround">Usual turnaround: {ta}</span>}
      {!edit && (
        <>
          <DueNow terms={cfg.terms} estimate={reqEst} currency={cfg.price.currency} />
          <TermsCheck
            checked={agreed}
            onChange={(x) => {
              setAgreed(x);
              if (x) setTermsErr("");
            }}
            error={termsErr}
          />
        </>
      )}
    </>
  );

  if (avatar)
    return (
      <Modal title={title} onClose={guard.request} testId={`${type}-modal`} footer={buttons}>
        <div className="pt-form">{form_}</div>
        {guard.dialog}
      </Modal>
    );
  // Editing (owner, 18 Oct 2026): on the Book media page, type cards, "Your request" alongside.
  const panelLines: PanelLine[] = itemLines.map((l) => ({
    key: l.key,
    label:
      l.key === "reel"
        ? `Short-form edits × ${l.qty}`
        : l.key === "long_form"
          ? `Long-form edits × ${l.qty}`
          : l.label,
    sub: l.sub,
  }));
  const v = priceView(cfg, itemLines);
  const barText = v.total?.value ?? (itemLines.length ? "Request" : "Nothing yet");
  return (
    <div data-testid={`${type}-page`}>
      <BookStep
        heading="Edit only"
        eyebrow="Book media"
        icon="scissors"
        onBack={
          onBack
            ? () => {
                if (touched) void draft.saveNow();
                onBack();
              }
            : undefined
        }
        primary={{
          label: busy
            ? "Uploading…"
            : saving
              ? "Sending…"
              : sendLabel?.startsWith("Pay")
                ? sendLabel
                : "Send request",
          onClick: () => void submit(),
          disabled: saving || busy,
        }}
        panelTitle="Your request"
        barText={barText}
        panel={
          <>
            <BookingPanel
              lines={panelLines}
              v={v}
              note="Long-form is priced by length · over 30 min, we quote"
            />
            <PanelTerms terms={cfg.terms} estimate={itemsEst} currency={cfg.price.currency} />
          </>
        }
      >
        <div className="pt-form">{form_}</div>
      </BookStep>
      {leave}
    </div>
  );
}
