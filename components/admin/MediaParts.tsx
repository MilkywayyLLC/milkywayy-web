"use client";

/* eslint-disable @next/next/no-img-element -- admin previews of uploaded images, not site media */
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { startSiteVideoUpload } from "@/lib/admin/media-actions";
import type { VideoFolder } from "@/lib/admin/fields";
import { exportSize, isFileVideo, MEDIA, sizeWarnings, type MediaKind } from "@/lib/media-config";
import { compressVideo, mb, VIDEO_MAX_BYTES, videoInfo } from "@/lib/video-compress";

/**
 * Admin media building blocks (owner, 7 Oct 2026), all reading lib/media-config so the admin
 * says exactly what the site does: the "Shown at / Recommended export / Used on" box, the crop
 * preview with a draggable focal point, size warnings and the video upload with in-browser
 * optimising.
 */

export function MediaFacts({ kind, usedOn }: { kind: MediaKind; usedOn?: string[] }) {
  const s = MEDIA[kind];
  return (
    <div className="ad-facts" data-testid="media-facts">
      <span>
        Shown at: <b>{s.ratioLabel}</b>
      </span>
      <span>
        Recommended export: <b>{exportSize(kind)}</b>
        {s.video && kind !== "photo" && (
          <>
            {" "}
            (video {s.video.width}×{s.video.height})
          </>
        )}
      </span>
      {usedOn && (
        <span className="ad-used" data-testid="used-on">
          Used on:{" "}
          {usedOn.length ? (
            <b>{usedOn.join(" · ")}</b>
          ) : (
            <i>
              not shown anywhere yet
              {kind === "photo" || kind === "reel" ? ". Tick where it shows below." : "."}
            </i>
          )}
        </span>
      )}
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="ad-warn" role="status">
      {items.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

export const imageWarnings = (kind: MediaKind, m: { width?: number; height?: number }) =>
  sizeWarnings(kind, m.width, m.height);

const parseFocus = (f?: string) => {
  const m = f?.match(/^([\d.]+)% ([\d.]+)%$/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
};

/**
 * The image with a focal point you drag (or tap, or move with the arrow keys), and beside it a
 * live preview cropped exactly as the site shows it. The point is saved as CSS object-position.
 */
export function FocalCrop({
  src,
  focus,
  onFocus,
  kind,
}: {
  src: string;
  focus?: string;
  onFocus: (f: string) => void;
  kind: MediaKind;
}) {
  const f = parseFocus(focus);
  const dragging = useRef(false);
  const aim = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    onFocus(`${x}% ${y}%`);
  };
  function nudge(e: KeyboardEvent<HTMLDivElement>) {
    const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    onFocus(
      `${Math.min(100, Math.max(0, f.x + d[0]))}% ${Math.min(100, Math.max(0, f.y + d[1]))}%`,
    );
  }
  return (
    <div className="ad-focal-wrap">
      <div>
        <div
          className="ad-focal"
          role="slider"
          tabIndex={0}
          aria-label="Focal point: drag to the part of the image that must always stay in frame"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={f.x}
          aria-valuetext={`${f.x}% across, ${f.y}% down`}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            aim(e);
          }}
          onPointerMove={(e) => dragging.current && aim(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onKeyDown={nudge}
        >
          <img src={src} alt="" draggable={false} />
          <span className="ad-focal-dot" style={{ left: `${f.x}%`, top: `${f.y}%` }} />
        </div>
        <p className="ad-small ad-muted">
          Drag the dot to the face or key detail. The site keeps that point in frame.
        </p>
      </div>
      <figure className="ad-crop" data-testid="crop-preview">
        <img
          src={src}
          alt=""
          style={{ aspectRatio: MEDIA[kind].ratio, objectPosition: `${f.x}% ${f.y}%` }}
        />
        <figcaption className="ad-eb">On the site · {MEDIA[kind].ratioLabel}</figcaption>
      </figure>
    </div>
  );
}

/* ---------- video upload ---------- */

type VState =
  | { s: "idle" }
  | { s: "optimising"; p: number }
  | { s: "uploading"; p: number }
  | { s: "done"; before: number; after: number; optimised: boolean }
  | { s: "error"; msg: string };

export type VideoMeta = { bytes: number; width?: number; height?: number; optimised: boolean };

function put(url: string, body: Blob, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () =>
      x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Storage said ${x.status}`));
    x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    x.send(body);
  });
}

/**
 * Pick a video → optimise it in the browser (ffmpeg.wasm, loaded only now) → upload the web
 * version straight to R2. If optimising fails the original goes up, with a warning.
 */
export function VideoUpload({
  kind,
  folder,
  onDone,
  label = "Upload video",
}: {
  kind: MediaKind;
  folder: VideoFolder;
  onDone: (ref: string, meta: VideoMeta) => void;
  label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<VState>({ s: "idle" });
  const [notes, setNotes] = useState<string[]>([]);
  const box = MEDIA[kind].video ?? { width: MEDIA[kind].width, height: MEDIA[kind].height };
  const vertical = box.height > box.width;

  async function pick(file?: File) {
    if (!file) return;
    setNotes([]);
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name))
      return setSt({ s: "error", msg: "Choose an MP4 or MOV video." });
    if (file.size > VIDEO_MAX_BYTES)
      return setSt({ s: "error", msg: "That video is over 150 MB. Export a smaller file." });
    const info = await videoInfo(file);
    const out: string[] = [];
    if (info && info.width && info.height && info.width > info.height === vertical)
      out.push(
        vertical
          ? "This video isn’t vertical. The site shows it at 9:16, so the sides will be cropped."
          : "This video isn’t landscape. The site shows it at 16:9.",
      );
    let blob: Blob = file;
    let optimised = false;
    setSt({ s: "optimising", p: 0 });
    try {
      blob = await compressVideo(file, box, (p) => setSt({ s: "optimising", p }), info?.duration);
      optimised = true; // only the web version is stored, even if the original was smaller
    } catch (e) {
      console.warn("[video] optimising failed; uploading the original:", e);
      blob = file;
      out.push("This file is large and may load slowly.");
    }
    setNotes(out);
    const start = await startSiteVideoUpload(folder, blob.size, blob.type || file.type);
    if (!start.ok) return setSt({ s: "error", msg: start.error });
    try {
      setSt({ s: "uploading", p: 0 });
      await put(start.url, blob, (p) => setSt({ s: "uploading", p }));
    } catch (e) {
      return setSt({ s: "error", msg: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      if (input.current) input.current.value = "";
    }
    setSt({ s: "done", before: file.size, after: blob.size, optimised });
    onDone(start.ref, { bytes: blob.size, width: info?.width, height: info?.height, optimised });
  }

  const busy = st.s === "optimising" || st.s === "uploading";
  return (
    <div className="ad-video-up">
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-describedby={`${id}-st`}
        >
          {label}
        </button>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v"
          hidden
          data-testid={`video-file-${folder}`}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <span className="ad-small ad-muted">
          MP4 or MOV, up to 150 MB. Optimised in your browser to {box.width}×{box.height} before it
          uploads.
        </span>
      </div>
      <p id={`${id}-st`} className="ad-small" role="status" aria-live="polite">
        {st.s === "optimising"
          ? `Optimising video… ${Math.round(st.p * 100)}%`
          : st.s === "uploading"
            ? `Uploading… ${Math.round(st.p * 100)}%`
            : st.s === "done"
              ? st.optimised
                ? `Optimised: ${mb(st.before)} → ${mb(st.after)}. Uploaded.`
                : `Uploaded (${mb(st.after)}).`
              : st.s === "error"
                ? st.msg
                : ""}
      </p>
      {busy && (
        <div className="ad-progress" role="progressbar" aria-valuenow={Math.round(st.p * 100)}>
          <i style={{ width: `${Math.max(4, st.p * 100)}%` }} />
        </div>
      )}
      <Warnings items={notes} />
    </div>
  );
}

/** What a stored video reference is, for people. */
export const describeVideo = (v: string, meta?: { bytes?: number }) =>
  isFileVideo(v) ? `Uploaded video${meta?.bytes ? ` (${mb(meta.bytes)})` : ""}` : v;
