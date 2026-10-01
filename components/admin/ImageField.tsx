"use client";

/* eslint-disable @next/next/no-img-element -- admin previews of uploaded images, not site media */
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Media } from "@/content/types";
import type { Crop } from "@/lib/admin/fields";
import { embedUrl } from "@/lib/video";

const MAX_BYTES = 15 * 1024 * 1024;
const PRE_EDGE = 2560;

/** Shrinks a photo in the browser so it fits the upload limit; the server makes the WebP. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PRE_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (blob) return blob;
  } catch {}
  return file; // the server can still read it (e.g. a format the browser can't draw)
}

function upload(blob: Blob, onProgress: (p: number) => void) {
  return new Promise<{ src: string; width: number; height: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status === 200
        ? resolve(xhr.response)
        : reject(new Error(xhr.response?.error ?? `Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    const form = new FormData();
    form.append("file", blob, "upload.jpg");
    xhr.send(form);
  });
}

const parseFocus = (f?: string) => {
  const m = f?.match(/^([\d.]+)% ([\d.]+)%$/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
};

export function ImageField({
  label,
  value,
  onChange,
  error,
  crops = [],
  video,
  bright,
  required,
}: {
  label: string;
  value: Media | null | undefined;
  onChange: (m: Media) => void;
  error?: string;
  crops?: Crop[];
  video?: boolean;
  bright?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "shrink" | number>(null);
  const [problem, setProblem] = useState<string>();
  const m = (value ?? { alt: "" }) as Media & Record<string, unknown>;
  const focus = parseFocus(m.focus);
  const set = (patch: Partial<Media>) => onChange({ ...m, ...patch });

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(undefined);
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name))
      return setProblem("Choose an image file.");
    if (file.size > MAX_BYTES) return setProblem("That image is over 15 MB. Choose a smaller one.");
    try {
      setBusy("shrink");
      const blob = await shrink(file);
      setBusy(0);
      const r = await upload(blob, (p) => setBusy(p));
      const next: Media & Record<string, unknown> = {
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

  function aim(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    set({ focus: `${x}% ${y}%` });
  }
  function nudge(e: KeyboardEvent<HTMLDivElement>) {
    const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const x = Math.min(100, Math.max(0, focus.x + d[0]));
    const y = Math.min(100, Math.max(0, focus.y + d[1]));
    set({ focus: `${x}% ${y}%` });
  }

  const videoOk = !m.video || !!embedUrl(String(m.video));
  return (
    <fieldset className="ad-field" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="ad-label">
        {label}
        {required ? "" : " (optional)"}
      </legend>
      <div className="ad-image">
        {m.src ? (
          <>
            <div
              className="ad-focal"
              role="slider"
              tabIndex={0}
              aria-label="Focal point: tap the part of the image that must always stay in frame"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={focus.x}
              aria-valuetext={`${focus.x}% across, ${focus.y}% down`}
              onPointerDown={aim}
              onKeyDown={nudge}
            >
              <img src={m.src} alt="" draggable={false} />
              <span className="ad-focal-dot" style={{ left: `${focus.x}%`, top: `${focus.y}%` }} />
            </div>
            <p className="ad-small ad-muted">
              Tap the face or the key detail. Every crop keeps that point in frame.
            </p>
            {crops.length > 0 && (
              <div className="ad-crops" aria-label="How the site will crop it">
                {crops.map((c) => (
                  <div className="ad-crop" key={c.label}>
                    <img
                      src={m.src}
                      alt=""
                      style={{ aspectRatio: c.ratio, objectPosition: `${focus.x}% ${focus.y}%` }}
                    />
                    <span className="ad-eb">{c.label}</span>
                  </div>
                ))}
              </div>
            )}
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
            <input
              id={`${id}-video`}
              type="url"
              inputMode="url"
              value={String(m.video ?? "")}
              onChange={(e) => set({ video: e.target.value })}
              placeholder="Bunny, Mux, YouTube or Vimeo link"
              aria-invalid={!videoOk}
            />
            <span className={videoOk ? "ad-help" : "ad-err"}>
              {videoOk
                ? "This image is the poster; the video loads when someone presses play."
                : "Link not recognised. Use a Bunny, Mux, YouTube or Vimeo link."}
            </span>
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
