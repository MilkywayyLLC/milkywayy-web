"use client";

import { useId, useRef, useState } from "react";
import type { Media } from "@/content/types";
import type { VideoFolder } from "@/lib/admin/fields";
import { imageProblem, uploadImage } from "@/lib/admin/upload-image";
import { isInstagramUrl } from "@/lib/instagram-link";
import { isFileVideo, MEDIA, type MediaKind } from "@/lib/media-config";
import { embedUrl, VIDEO_HINT, VIDEO_REFUSED } from "@/lib/video";
import { FocalCrop, imageWarnings, MediaFacts, VideoUpload, Warnings } from "./MediaParts";

/**
 * One image (Media JSON) for a known format (lib/media-config): upload (WebP, 15 MB), alt text,
 * a live crop at the format's ratio with a draggable focal point, warnings when the file is
 * small or far off the ratio, and "Shown at / Recommended export / Used on". With `video` it
 * also takes the video: a YouTube/Vimeo link, or (with `upload`) a file optimised and stored in R2.
 */
export function ImageField({
  label,
  value,
  onChange,
  error,
  kind,
  usedOn,
  video,
  upload,
  bright,
  required,
  hint,
}: {
  label: string;
  value: Media | null | undefined;
  onChange: (m: Media) => void;
  error?: string;
  kind: MediaKind;
  usedOn?: string[];
  video?: boolean;
  upload?: VideoFolder;
  bright?: boolean;
  required?: boolean;
  /** Format-specific help under the label (defaults to the format's cover hint). */
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "shrink" | number>(null);
  const [problem, setProblem] = useState<string>();
  const m = (value ?? { alt: "" }) as Media;
  const set = (patch: Partial<Media>) => onChange({ ...m, ...patch });

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(undefined);
    const bad = imageProblem(file);
    if (bad) return setProblem(bad);
    try {
      const r = await uploadImage(file, setBusy);
      const next: Media = {
        ...m,
        src: r.src,
        width: r.width,
        height: r.height,
        focus: m.focus ?? "50% 50%",
      };
      delete next.placeholder;
      onChange(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  const v = String(m.video ?? "");
  const [moved, setMoved] = useState(false);
  const videoOk = !v || isFileVideo(v) || !!embedUrl(v);
  return (
    <fieldset className="ad-field" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="ad-label">
        {label}
        {required ? "" : " (optional)"}
      </legend>
      <div className="ad-image">
        <p className="ad-small ad-muted">{hint ?? MEDIA[kind].coverHint}</p>
        <MediaFacts kind={kind} usedOn={usedOn} />
        {m.src ? (
          <>
            <FocalCrop
              src={m.src}
              focus={m.focus}
              onFocus={(focus) => set({ focus })}
              kind={kind}
            />
            <Warnings items={imageWarnings(kind, m)} />
          </>
        ) : (
          <p className="ad-small ad-muted">
            {m.placeholder
              ? `Showing a placeholder (${m.placeholder}). Upload an image to replace it.`
              : "No image yet."}
          </p>
        )}

        {busy !== null && (
          <div
            className="ad-progress"
            role="progressbar"
            aria-label="Uploading"
            aria-valuenow={typeof busy === "number" ? Math.round(busy * 100) : 0}
          >
            <i style={{ width: `${typeof busy === "number" ? Math.max(4, busy * 100) : 4}%` }} />
          </div>
        )}
        <div className="ad-btns">
          <button
            type="button"
            className="ad-btn ghost small"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {busy === "shrink"
              ? "Preparing…"
              : typeof busy === "number"
                ? `Uploading ${Math.round(busy * 100)}%`
                : m.src
                  ? "Replace image"
                  : "Upload image"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,.heic,.heif"
            hidden
            data-testid={`${label}-file`}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <span className="ad-small ad-muted">Up to 15 MB. Saved as WebP automatically.</span>
        </div>

        <div className="ad-field">
          <label htmlFor={`${id}-alt`}>Describe the image (alt text)</label>
          <input
            id={`${id}-alt`}
            type="text"
            value={m.alt ?? ""}
            maxLength={160}
            onChange={(e) => set({ alt: e.target.value })}
            placeholder="e.g. Living room of a 2-bedroom apartment in Dubai Marina"
          />
        </div>
        {video && (
          <div className="ad-field">
            <label htmlFor={`${id}-video`}>Video link (optional)</label>
            {isFileVideo(v) ? (
              <div className="ad-btns">
                <span className="ad-small">
                  Uploaded video
                  {m.file?.bytes ? ` (${(m.file.bytes / 1048576).toFixed(1)} MB)` : ""}.
                </span>
                <button
                  type="button"
                  className="ad-btn quiet small"
                  onClick={() => set({ video: undefined, file: undefined })}
                >
                  Remove video
                </button>
              </div>
            ) : (
              <input
                id={`${id}-video`}
                type="url"
                inputMode="url"
                value={v}
                onChange={(e) => {
                  const next = e.target.value;
                  // An Instagram link isn't a video link: keep it as the item's Instagram link.
                  if (isInstagramUrl(next)) {
                    setMoved(true);
                    return set({ video: undefined, instagramUrl: next.trim() });
                  }
                  setMoved(false);
                  set({ video: next });
                }}
                placeholder={VIDEO_HINT}
                aria-invalid={!videoOk}
              />
            )}
            <span className={videoOk ? "ad-help" : "ad-err"}>
              {!videoOk
                ? VIDEO_REFUSED
                : moved
                  ? "That’s an Instagram link, so it was saved as the Instagram link instead."
                  : `${VIDEO_HINT}. The cover image shows first; the video loads when someone presses play.`}
            </span>
            {upload && (
              <VideoUpload
                kind={kind}
                folder={upload}
                label={isFileVideo(v) ? "Replace video" : "Or upload a video"}
                onDone={(ref, meta) => set({ video: ref, file: meta })}
              />
            )}
          </div>
        )}
        {bright && (
          <label className="ad-check">
            <input
              type="checkbox"
              checked={!!m.bright}
              onChange={(e) => set({ bright: e.target.checked })}
            />
            <span>Bright image (light background): use dark labels on it</span>
          </label>
        )}
      </div>
      {(problem || error) && (
        <span className="ad-err" id={`${id}-err`} role="alert">
          {problem ?? error}
        </span>
      )}
    </fieldset>
  );
}
