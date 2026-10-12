"use client";

/* eslint-disable @next/next/no-img-element -- local previews and signed R2 previews */
import { useId, useRef } from "react";
import { contactPhotoUrl, setContactPhoto } from "@/lib/portal/listing-actions";
import { makeSquare, putBlob } from "@/lib/upload-browser";

/** What the field holds until the contact is saved: a new square photo, or "remove it". */
export type PhotoPick = { file: Blob | null; preview: string | null; removed: boolean };
export const photoPick = (preview: string | null | undefined): PhotoPick => ({
  file: null,
  preview: preview ?? null,
  removed: false,
});

/**
 * After the contact saves (so new contacts have an id): upload the picked photo to R2 and link
 * it, or clear it. Returns an error message, or null when all went well (or nothing changed).
 */
export async function savePickedPhoto(contactId: string, pick: PhotoPick): Promise<string | null> {
  if (pick.file) {
    const r = await contactPhotoUrl(contactId);
    if (!r.ok || !r.url || !r.key) return r.error ?? "Couldn’t upload the photo.";
    if (!(await putBlob(r.url, pick.file))) return "Couldn’t upload the photo. Try again.";
    const saved = await setContactPhoto(contactId, r.key);
    return saved.ok ? null : (saved.error ?? "Couldn’t save the photo.");
  }
  if (pick.removed) {
    const r = await setContactPhoto(contactId, null);
    return r.ok ? null : (r.error ?? "Couldn’t remove the photo.");
  }
  return null;
}

/**
 * Profile photo (site-refine, Oct 2026): a round preview with Upload photo / Change / Remove.
 * The photo is square-cropped in the browser and stored on R2 when the contact is saved.
 */
export function ContactPhotoField({
  value,
  onChange,
  initials,
  onError,
}: {
  value: PhotoPick;
  onChange: (v: PhotoPick) => void;
  initials: string;
  onError?: (msg: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="pt-field">
      <span>Profile photo (optional)</span>
      <div className="pt-photo-field">
        {value.preview ? (
          <img src={value.preview} alt="" className="pt-avatar-img pt-avatar-lg" />
        ) : (
          <span className="pt-pill-face pt-avatar-lg" aria-hidden="true">
            {initials || "?"}
          </span>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const sq = await makeSquare(f, 320);
            if (!sq) return onError?.("Use a JPG, PNG or WebP photo.");
            onChange({ file: sq, preview: URL.createObjectURL(sq), removed: false });
          }}
        />
        <button type="button" className="btn btn-g btn-s" onClick={() => input.current?.click()}>
          {value.preview ? "Change" : "Upload photo"}
        </button>
        {value.preview && (
          <button
            type="button"
            className="lnk pt-small"
            onClick={() => onChange({ file: null, preview: null, removed: true })}
          >
            Remove
          </button>
        )}
      </div>
      <span className="pt-meta">Square, shown round on your listing pages.</span>
    </div>
  );
}
