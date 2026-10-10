"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestDeliverableRevision } from "@/lib/portal/deliverable-actions";
import type { Playable } from "@/lib/playable";
import { useToast } from "./ui";

const MediaViewer = dynamic(
  () => import("@/components/media/MediaViewer").then((m) => m.MediaViewer),
  { ssr: false },
);

/** One delivered file, with short-lived signed links made on the server. */
export type DFile = {
  id: string;
  label: string;
  kind: string;
  /** A Drive/Dropbox/tour link, when it was delivered as a link. */
  link: string | null;
  /** Signed download URL (R2 files). */
  download: string | null;
  /** Signed URL to show it (web copy, or the file itself). */
  view: string | null;
  thumb: string | null;
  deliverableId: string | null;
};

const fileName = (f: DFile, i: number, ext: string) => {
  const base = f.label.replace(/[\\/:*?"<>|]+/g, "-").trim() || `file-${i + 1}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
};

/** "Download all": the files fetched one by one and zipped in the browser, with progress. */
function DownloadAll({ files, name, ext }: { files: DFile[]; name: string; ext: string }) {
  const list = files.filter((f) => f.download);
  const [n, setN] = useState<number | null>(null);
  const [err, setErr] = useState("");
  if (list.length < 2) return null;
  return (
    <span className="pt-btns" style={{ alignItems: "center" }}>
      <button
        type="button"
        className="btn btn-g btn-s"
        disabled={n != null}
        onClick={async () => {
          setErr("");
          setN(0);
          try {
            const { downloadZip } = await import("client-zip");
            async function* items() {
              for (const [i, f] of list.entries()) {
                const r = await fetch(f.download!);
                if (!r.ok) throw new Error(String(r.status));
                yield { name: fileName(f, i, ext), input: r };
                setN(i + 1);
              }
            }
            const blob = await downloadZip(items()).blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${name}.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
          } catch {
            setErr("Couldn’t make the zip. Download the files one by one, or try again.");
          }
          setN(null);
        }}
      >
        {n == null ? "Download all" : `Zipping ${n} of ${list.length}…`}
      </button>
      {n != null && (
        <progress max={list.length} value={n} aria-label="Zip progress" style={{ width: 120 }} />
      )}
      {err && (
        <span className="pt-error" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}

function PhotoRevision({ f, fallback }: { f: DFile; fallback: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  const id = f.deliverableId ?? fallback;
  if (!id) return null;
  return open ? (
    <form
      className="pt-form"
      style={{ gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return setMsg({ ok: false, text: "Say what should change." });
        start(async () => {
          const r = await requestDeliverableRevision(id, `${f.label}: ${note.trim()}`);
          setMsg({ ok: r.ok, text: (r.ok ? r.notice : r.error) ?? "" });
          if (r.ok) {
            setOpen(false);
            setNote("");
            router.refresh();
          }
        });
      }}
    >
      <label className={`pt-field${msg && !msg.ok ? "is-bad" : ""}`}>
        What should change? <span className="pt-req">*</span>
        <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        {msg && !msg.ok && <span className="pt-field-msg">{msg.text}</span>}
      </label>
      <span className="pt-btns">
        <button type="submit" className="btn btn-p btn-s" disabled={pending}>
          Send
        </button>
        <button type="button" className="btn btn-g btn-s" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    </form>
  ) : (
    <>
      <button type="button" className="pt-link-btn" onClick={() => setOpen(true)}>
        Request revision
      </button>
      {msg?.ok && <span className="pt-meta">{msg.text}</span>}
    </>
  );
}

/**
 * A shoot's deliveries (owner, 10 Oct 2026), one card per kind, only for kinds it has: Photos
 * (grid, lightbox, download each, "Download all" zipped in the browser, a revision on any photo),
 * Reels (inline player, download each, all), Long-form (download, or open the link) and the 360
 * tour (preview and copy the link).
 */
export function ShootDeliveries({
  files,
  title,
  photosDeliverable,
}: {
  files: DFile[];
  title: string;
  photosDeliverable: string | null;
}) {
  const [play, setPlay] = useState<Playable | null>(null);
  const [toast, say] = useToast();
  const photos = files.filter((f) => f.kind === "photos" && (f.view || f.download));
  const reels = files.filter((f) => f.kind === "reel");
  const longs = files.filter((f) => f.kind === "long_form");
  const tours = files.filter((f) => f.kind === "tour" && f.link);
  if (!photos.length && !reels.length && !longs.length && !tours.length) return null;

  return (
    <>
      {photos.length > 0 && (
        <section className="pt-card" aria-label="Photos" data-testid="deliv-photos">
          <div className="pt-row" style={{ flexWrap: "wrap" }}>
            <h2 className="pt-h2">Photos ({photos.length})</h2>
            <DownloadAll files={photos} name={`${title} photos`} ext="jpg" />
          </div>
          <ul className="pt-thumbs" aria-label="Photos">
            {photos.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="pt-thumb-open"
                  aria-label={`Open ${f.label}`}
                  onClick={() =>
                    setPlay({
                      type: "photos",
                      title,
                      photos: [...photos.slice(i), ...photos.slice(0, i)].map((p) => ({
                        src: p.view ?? p.download!,
                        alt: p.label,
                      })),
                    })
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived R2 URL */}
                  <img
                    src={f.thumb ?? f.view ?? ""}
                    alt={f.label}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <div className="pt-thumb-foot">
                  <span className="pt-small">{f.label}</span>
                  {f.download && (
                    <a className="pt-link-btn" href={f.download} download>
                      Download
                    </a>
                  )}
                </div>
                <PhotoRevision f={f} fallback={photosDeliverable} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {reels.length > 0 && (
        <section className="pt-card" aria-label="Vertical videos" data-testid="deliv-reels">
          <div className="pt-row" style={{ flexWrap: "wrap" }}>
            <h2 className="pt-h2">Vertical videos ({reels.length})</h2>
            <DownloadAll files={reels} name={`${title} reels`} ext="mp4" />
          </div>
          <ul className="pt-reels">
            {reels.map((f) => (
              <li key={f.id}>
                {f.view ? (
                  <video
                    src={f.view}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={f.label}
                  />
                ) : null}
                <div className="pt-thumb-foot">
                  <span className="pt-small">{f.label}</span>
                  {f.download ? (
                    <a className="pt-link-btn" href={f.download} download>
                      Download
                    </a>
                  ) : f.link ? (
                    <a
                      className="pt-link-btn"
                      href={f.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open ↗
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {longs.length > 0 && (
        <section className="pt-card" aria-label="Long-form video" data-testid="deliv-long">
          <h2 className="pt-h2">Long-form video</h2>
          {longs.map((f) => (
            <div key={f.id} className="pt-row">
              <span>{f.label}</span>
              {f.download ? (
                <a className="btn btn-g btn-s" href={f.download} download>
                  Download
                </a>
              ) : f.link ? (
                <a
                  className="btn btn-g btn-s"
                  href={f.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download ↗
                </a>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {tours.length > 0 && (
        <section className="pt-card" aria-label="360 tour" data-testid="deliv-tour">
          <h2 className="pt-h2">360 tour</h2>
          {tours.map((f) => (
            <div key={f.id} className="pt-row" style={{ flexWrap: "wrap" }}>
              <span>{f.label}</span>
              <span className="pt-btns">
                <a
                  className="btn btn-g btn-s"
                  href={f.link!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preview ↗
                </a>
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(f.link!);
                      say("Link copied");
                    } catch {
                      say("Couldn’t copy. Long-press the Preview link instead.");
                    }
                  }}
                >
                  Copy link
                </button>
              </span>
            </div>
          ))}
        </section>
      )}
      {play && <MediaViewer play={play} onClose={() => setPlay(null)} />}
      {toast}
    </>
  );
}
