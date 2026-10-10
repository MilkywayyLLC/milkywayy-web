"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 previews */
import { useCallback, useState, useTransition } from "react";
import { qrUploadUrl, saveListing } from "@/lib/portal/listing-actions";
import {
  FURNISHINGS,
  PRICE_LABEL,
  PURPOSES,
  type ListingInput,
  type PurposeKey,
} from "@/lib/portal/listings";
import { putBlob } from "@/lib/upload-browser";
import { DraftOffer, Field, FormBanner, useDraft, useFormCheck, useLeaveGuard } from "./forms";
import { Icon } from "./Icon";
import { ShareDone } from "./ListingParts";
import { ContactsField, PhotoOrder, type PickContact, type PickPhoto } from "./ListingPickers";

export type { PickContact, PickPhoto } from "./ListingPickers";
export type PickVideo = { id: string; label: string };
const VIDEO =
  /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/\S+$/i;

/**
 * Create / edit a share page (§6.1). The booking fills in what it knows; the client adds the
 * rest, taps one or two contact pills, and picks the photos (all of them, in delivery order, by
 * default; tapping leaves one out, tapping again puts it back at the end).
 */
export function ListingForm({
  id,
  projectId,
  from,
  initial,
  photos,
  contacts,
  videos,
  qrPreview,
  hasBrand,
}: {
  id?: string;
  projectId?: string;
  from: string;
  initial: ListingInput;
  photos: PickPhoto[];
  contacts: PickContact[];
  videos: PickVideo[];
  qrPreview: string | null;
  hasBrand: boolean;
}) {
  const [v, setV] = useState<ListingInput>(initial);
  const [chip, setChip] = useState("");
  const [qr, setQr] = useState<{ state: string; preview: string | null }>({
    state: "",
    preview: qrPreview,
  });
  const [people, setPeople] = useState(contacts);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => {
    setTouched(true);
    setV((x) => ({ ...x, [k]: val }));
  };
  // New links autosave as a draft (owner, 10 Oct 2026); edits of a live link don't.
  const restore = useCallback(
    (d: ListingInput & { project?: string }) => {
      if (d.project && d.project !== projectId) return;
      setV((x) => ({ ...x, ...d }));
      setTouched(true);
    },
    [projectId],
  );
  const draft = useDraft(
    "listing",
    { ...v, project: projectId } as unknown as Record<string, unknown>,
    {
      touched: !id && touched && !done,
      onRestore: restore as unknown as (d: Record<string, unknown>) => void,
    },
  );
  const leave = useLeaveGuard({
    dirty: !id && touched && !done,
    saveNow: draft.saveNow,
    discard: draft.discard,
  });
  const form = useFormCheck(() => ({
    title: v.title.trim().length < 3 && "Add a title (3 characters or more).",
    price: !(Number(v.price.replace(/[,\s]/g, "")) > 0) && "Enter the price as a number.",
    contacts: !v.contact_ids.length && "Choose at least one contact.",
    photos: !v.photo_ids.length && "Choose at least one photo.",
    video_url:
      v.video_url.trim() &&
      !VIDEO.test(v.video_url.trim()) &&
      "Long-form takes a YouTube or Vimeo link only.",
    tour_url:
      v.tour_url.trim() &&
      !/^https:\/\/\S+$/.test(v.tour_url.trim()) &&
      "Paste the tour link starting with https://",
  }));

  if (done) return <ShareDone kind="l" slug={done.slug} title={v.title} edited={!!id} />;

  const addChip = () => {
    const c = chip.trim().slice(0, 40);
    if (c && !v.highlights.includes(c) && v.highlights.length < 12)
      set("highlights", [...v.highlights, c]);
    setChip("");
  };

  async function uploadQr(f: File) {
    setQr({ state: "Uploading…", preview: qr.preview });
    const r = await qrUploadUrl(f.type, f.size);
    if (!r.ok || !r.url || !r.key)
      return setQr({ state: r.error ?? "Couldn’t upload.", preview: qr.preview });
    if (!(await putBlob(r.url, f)))
      return setQr({ state: "Couldn’t upload. Try again.", preview: qr.preview });
    set("permit_qr_key", r.key);
    setQr({ state: "QR added.", preview: URL.createObjectURL(f) });
  }

  return (
    <form
      className="pt-form"
      aria-label={id ? "Edit share page" : "Create share link"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.check()) return;
        start(async () => {
          const r = await saveListing(v, { id, project: projectId });
          if (!r.ok) return form.fail(r.error ?? "Couldn’t save. Try again.");
          setDone({ slug: r.slug! });
        });
      }}
    >
      {leave}
      {!id && (
        <DraftOffer
          offer={draft.offer}
          onContinue={draft.continueOffer}
          onFresh={draft.startFresh}
        />
      )}
      <FormBanner text={form.banner} />
      <div className="pt-card" style={{ background: "var(--bg)", gap: 6 }}>
        <span className="pt-eb">From the booking</span>
        <b>{from}</b>
        <span className="pt-meta">
          {[v.property_type, v.beds && (/^\d+$/.test(v.beds) ? `${v.beds} bed` : v.beds)]
            .filter(Boolean)
            .join(" · ")}
          {photos.length ? ` · ${photos.length} photos` : ""}
          {videos.length ? " · video" : ""}
        </span>
      </div>

      <Field name="title" label="Title" required error={form.errors.title}>
        <input
          type="text"
          maxLength={120}
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Sky-high 3 bed penthouse with Burj views"
        />
      </Field>
      <div className="pt-field">
        <span id="purpose-l">Purpose *</span>
        <div className="pt-seg" role="group" aria-labelledby="purpose-l">
          {PURPOSES.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={v.purpose === k}
              onClick={() => set("purpose", k as PurposeKey)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <Field
        name="price"
        label={PRICE_LABEL[v.purpose].replace(" *", "")}
        required
        error={form.errors.price}
      >
        <input
          type="text"
          inputMode="decimal"
          value={v.price}
          onChange={(e) => set("price", e.target.value)}
          placeholder={
            v.purpose === "sale"
              ? "e.g. 6,950,000"
              : v.purpose === "rent"
                ? "e.g. 185,000"
                : "e.g. 950"
          }
        />
      </Field>
      <label className="pt-field">
        Location
        <input
          type="text"
          maxLength={160}
          value={v.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </label>
      <div className="pt-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="pt-field">
          Property type
          <input
            type="text"
            maxLength={40}
            value={v.property_type}
            onChange={(e) => set("property_type", e.target.value)}
          />
        </label>
        <label className="pt-field">
          Bedrooms
          <input
            type="text"
            maxLength={20}
            value={v.beds}
            onChange={(e) => set("beds", e.target.value)}
            placeholder="e.g. 3 or Studio"
          />
        </label>
        <label className="pt-field">
          Bathrooms
          <input
            type="text"
            inputMode="decimal"
            value={v.baths}
            onChange={(e) => set("baths", e.target.value)}
          />
        </label>
        <label className="pt-field">
          Size (sq ft)
          <input
            type="text"
            inputMode="numeric"
            value={v.size_sqft}
            onChange={(e) => set("size_sqft", e.target.value)}
          />
        </label>
      </div>
      <label className="pt-field">
        Furnishing
        <select value={v.furnishing} onChange={(e) => set("furnishing", e.target.value)}>
          {FURNISHINGS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="pt-field">
        Description
        <textarea
          rows={5}
          maxLength={4000}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      <div className="pt-field">
        Highlights
        {v.highlights.length > 0 && (
          <div className="pt-chips">
            {v.highlights.map((c) => (
              <button
                key={c}
                type="button"
                className="pt-chip"
                onClick={() =>
                  set(
                    "highlights",
                    v.highlights.filter((x) => x !== c),
                  )
                }
                aria-label={`Remove ${c}`}
              >
                {c} <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            aria-label="Add a highlight"
            value={chip}
            maxLength={40}
            onChange={(e) => setChip(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChip();
              }
            }}
            placeholder="e.g. Private terrace"
          />
          <button type="button" className="btn btn-g btn-s" onClick={addChip}>
            Add
          </button>
        </div>
      </div>

      <fieldset className="pt-card pt-permit-field">
        <legend className="pt-h2" style={{ fontSize: 15 }}>
          DLD advertising permit
        </legend>
        <p className="pt-meta" style={{ margin: 0 }}>
          Required by DLD for property adverts. Check your permit.
        </p>
        <label className="pt-field">
          Permit number (Trakheesi)
          <input
            type="text"
            maxLength={40}
            value={v.permit_no}
            onChange={(e) => set("permit_no", e.target.value)}
            placeholder="e.g. 7120345678"
          />
        </label>
        <div className="pt-field">
          <label htmlFor="permit-qr">Permit QR code (image)</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {qr.preview && <img src={qr.preview} alt="Permit QR code" width={64} height={64} />}
            <input
              id="permit-qr"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadQr(f);
              }}
            />
          </div>
          {v.permit_qr_key && (
            <button
              type="button"
              className="lnk pt-small"
              style={{ justifySelf: "start" }}
              onClick={() => {
                set("permit_qr_key", "");
                setQr({ state: "QR removed.", preview: null });
              }}
            >
              Remove the QR
            </button>
          )}
          <span className="pt-meta" role="status">
            {qr.state}
          </span>
        </div>
        <span className="pt-meta">Both show on the page when filled in.</span>
      </fieldset>

      <ContactsField
        all={people}
        chosen={v.contact_ids}
        onChange={(ids) => set("contact_ids", ids)}
        onContacts={setPeople}
        error={form.errors.contacts}
      />

      <PhotoOrder
        photos={photos}
        order={v.photo_ids}
        onChange={(ids) => set("photo_ids", ids)}
        error={form.errors.photos}
      />

      <div className="pt-field">
        Video and tour
        {videos.length > 0 ? (
          <label className="pt-field" style={{ fontWeight: 400 }}>
            Reel on the page
            <select value={v.reel_id} onChange={(e) => set("reel_id", e.target.value)}>
              <option value="">No reel</option>
              {videos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="pt-meta">
            No reel ready for share pages on this shoot. Ask us in Messages if you want one.
          </span>
        )}
        <Field
          name="video_url"
          label="Long-form video (YouTube or Vimeo link, unlisted is fine)"
          error={form.errors.video_url}
        >
          <input
            type="url"
            value={v.video_url}
            onChange={(e) => set("video_url", e.target.value)}
            placeholder="https://youtu.be/…"
          />
        </Field>
        <Field name="tour_url" label="360 tour link" error={form.errors.tour_url}>
          <input
            type="url"
            value={v.tour_url}
            onChange={(e) => set("tour_url", e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </div>

      <div>
        {hasBrand && (
          <label className="pt-check">
            <input
              type="checkbox"
              checked={v.show_brand}
              onChange={(e) => set("show_brand", e.target.checked)}
            />{" "}
            Show our company name and logo
          </label>
        )}
        <label className="pt-check">
          <input
            type="checkbox"
            checked={!!v.expires_on}
            onChange={(e) =>
              set(
                "expires_on",
                e.target.checked
                  ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
                  : "",
              )
            }
          />{" "}
          Expires on a date
        </label>
        {v.expires_on && (
          <label className="pt-field">
            Expiry date
            <input
              type="date"
              value={v.expires_on}
              onChange={(e) => set("expires_on", e.target.value)}
            />
          </label>
        )}
      </div>

      <button type="submit" className="btn btn-p" disabled={pending}>
        {pending ? "Saving…" : id ? "Save changes" : "Create link"}
      </button>
    </form>
  );
}
