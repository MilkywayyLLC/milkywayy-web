"use client";

/* eslint-disable @next/next/no-img-element -- admin previews of uploaded images, not site media */
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import type { Media, PortfolioItem } from "@/content/types";
import type { AdminCtx } from "@/lib/admin/fields";
import { checkInstagramReel, importInstagramCover } from "@/lib/admin/media-actions";
import { imageProblem, uploadImage } from "@/lib/admin/upload-image";
import type { ReelMatch } from "@/lib/instagram";
import { instagramShortcode, isInstagramUrl, OUR_INSTAGRAM } from "@/lib/instagram-link";
import { isFileVideo, kindOf, MEDIA } from "@/lib/media-config";
import { TOUR_HINT, tourEmbed } from "@/lib/tours";
import { usedOn, type UsageItem } from "@/lib/used-on";
import { mb } from "@/lib/video-compress";
import { ImageField } from "./ImageField";
import { FocalCrop, imageWarnings, MediaFacts, VideoUpload, Warnings } from "./MediaParts";

type Photo = NonNullable<Media["photos"]>[number];
const MAX_PHOTOS = 60;

/** The item as "Used on" sees it: the editor's current values, placed like the saved one. */
function usage(row: Record<string, unknown>, ctx: AdminCtx): string[] {
  const saved = ctx.portfolio.find((p) => p.id === row.id);
  const me: UsageItem = {
    id: String(row.id ?? "new"),
    format: (row.format as PortfolioItem["format"]) ?? "reel",
    category: (row.category as PortfolioItem["category"]) ?? "property",
    placements: (Array.isArray(row.placements) ? row.placements : []) as UsageItem["placements"],
    placementOrder: saved?.placementOrder ?? {},
    sortOrder: saved?.sortOrder ?? Number(row.sort_order ?? 1e6),
    sample: !!row.sample,
    published: true,
  };
  return usedOn(me, ctx.portfolio);
}

/**
 * The portfolio item's media, by format (owner, 7 Oct 2026). Only the fields the chosen format
 * uses are shown, with hints written for it:
 *   Photo     a set of photos: multi-upload, drag to reorder, star the cover, alt text each
 *   Reel      our Instagram reel link (default) or an uploaded video, plus the cover image
 *   Long-form a YouTube/Vimeo link plus the cover image
 *   360 tour  a Matterport, Panoee or Kuula link plus the cover image
 * Any item can also link to its Instagram post.
 */
export function PortfolioMedia({
  value,
  onChange,
  row,
  ctx,
  error,
}: {
  value: Media | null | undefined;
  onChange: (m: Media) => void;
  row: Record<string, unknown>;
  ctx: AdminCtx;
  error?: string;
}) {
  const m = (value ?? { alt: "" }) as Media;
  const set = (patch: Partial<Media>) => onChange({ ...m, ...patch });
  const kind = kindOf({
    category: (row.category as PortfolioItem["category"]) ?? "property",
    format: (row.format as PortfolioItem["format"]) ?? "reel",
  });
  const used = usage(row, ctx);

  return (
    <div className="ad-pm" data-format={row.format as string} data-testid="portfolio-media">
      {kind === "photo" ? (
        <PhotoSet m={m} onChange={onChange} usedOn={used} />
      ) : kind === "reel" || kind === "ai-avatar" ? (
        <Reel m={m} set={set} onChange={onChange} usedOn={used} kind={kind} />
      ) : kind === "long-form" ? (
        <ImageField
          label="Cover image"
          value={m}
          onChange={onChange}
          kind="long-form"
          usedOn={used}
          video
          required
        />
      ) : (
        <Tour m={m} set={set} onChange={onChange} usedOn={used} />
      )}
      {!(m.source === "instagram" && (kind === "reel" || kind === "ai-avatar")) && (
        <InstagramPostLink value={m.instagramUrl} onChange={(v) => set({ instagramUrl: v })} />
      )}
      {error && (
        <span className="ad-err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ---------- photo sets ---------- */

function PhotoSet({
  m,
  onChange,
  usedOn,
}: {
  m: Media;
  onChange: (m: Media) => void;
  usedOn: string[];
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string>();
  const [problems, setProblems] = useState<string[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  // Old single-photo items start as a set of one.
  const photos: Photo[] =
    m.photos ?? (m.src ? [{ src: m.src, width: m.width, height: m.height, focus: m.focus }] : []);
  const coverAt = Math.max(
    0,
    photos.findIndex((p) => p.src === m.src),
  );
  const cover = photos[coverAt];

  const commit = (list: Photo[], starSrc = m.src) => {
    const c = list.find((p) => p.src === starSrc) ?? list[0];
    const next: Media = { ...m, photos: list };
    if (c)
      Object.assign(next, {
        src: c.src,
        width: c.width,
        height: c.height,
        focus: c.focus ?? "50% 50%",
      });
    else delete next.src;
    delete next.placeholder;
    onChange(next);
  };

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_PHOTOS - photos.length);
    const bad: string[] = files.length > list.length ? [`Up to ${MAX_PHOTOS} photos per set.`] : [];
    let next = [...photos];
    for (const [n, f] of list.entries()) {
      const p = imageProblem(f);
      if (p) {
        bad.push(p);
        continue;
      }
      setProgress(`Uploading ${n + 1} of ${list.length}…`);
      try {
        const r = await uploadImage(f, () => undefined);
        next = [...next, { src: r.src, width: r.width, height: r.height }];
        commit(next);
      } catch (e) {
        bad.push(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setProgress(undefined);
    setProblems(bad);
    if (input.current) input.current.value = "";
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const list = [...photos];
    const [p] = list.splice(from, 1);
    list.splice(to, 0, p);
    commit(list);
  };
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (drag !== null) move(drag, to);
    setDrag(null);
  };

  return (
    <fieldset className="ad-field" data-testid="photo-set">
      <legend className="ad-label">Photos</legend>
      <p className="ad-small ad-muted">
        Add every photo of the property. On the site it’s one card with the count; a tap opens all
        of them. Drag to reorder, and star the cover (the first one unless you choose).
      </p>
      <MediaFacts kind="photo" usedOn={usedOn} />
      <div className="ad-btns">
        <button
          type="button"
          className="ad-btn ghost small"
          disabled={!!progress}
          onClick={() => input.current?.click()}
        >
          {progress ?? (photos.length ? "Add more photos" : "Add photos")}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          data-testid="photos-file"
          onChange={(e) => add(e.target.files)}
        />
        <span className="ad-small ad-muted">
          Choose several at once. Up to 15 MB each, saved as WebP automatically.
        </span>
      </div>
      <Warnings items={problems} />
      {photos.length > 0 && (
        <ol className="ad-photos" aria-label="Photos in order">
          {photos.map((p, i) => (
            <li
              key={p.src}
              draggable
              data-testid="photo-item"
              data-src={p.src}
              className={drag === i ? "dragging" : undefined}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={() => setDrag(null)}
            >
              <img src={p.src} alt="" draggable={false} />
              <div className="ad-photo-tools">
                <button
                  type="button"
                  className={i === coverAt ? "ad-star on" : "ad-star"}
                  aria-pressed={i === coverAt}
                  aria-label={
                    i === coverAt ? `Photo ${i + 1} is the cover` : `Make photo ${i + 1} the cover`
                  }
                  onClick={() => commit(photos, p.src)}
                >
                  ★
                </button>
                <button
                  type="button"
                  className="ad-icon-btn"
                  aria-label={`Move photo ${i + 1} earlier`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ad-icon-btn"
                  aria-label={`Move photo ${i + 1} later`}
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  →
                </button>
                <button
                  type="button"
                  className="ad-icon-btn"
                  aria-label={`Delete photo ${i + 1}`}
                  onClick={() =>
                    commit(
                      photos.filter((_, j) => j !== i),
                      i === coverAt ? undefined : m.src,
                    )
                  }
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                aria-label={`Photo ${i + 1} alt text (optional)`}
                placeholder="Alt text (optional)"
                maxLength={160}
                value={p.alt ?? ""}
                onChange={(e) =>
                  commit(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))
                }
              />
            </li>
          ))}
        </ol>
      )}
      {cover && (
        <div className="ad-field">
          <span className="ad-label">Cover image</span>
          <FocalCrop
            src={cover.src}
            focus={m.focus}
            kind="photo"
            onFocus={(focus) =>
              onChange({
                ...m,
                focus,
                photos: photos.map((x, j) => (j === coverAt ? { ...x, focus } : x)),
              })
            }
          />
          <Warnings items={imageWarnings("photo", cover)} />
          <label htmlFor={`${id}-alt`}>Describe the cover (alt text)</label>
          <input
            id={`${id}-alt`}
            type="text"
            maxLength={160}
            value={m.alt ?? ""}
            onChange={(e) => onChange({ ...m, alt: e.target.value })}
            placeholder="e.g. Living room of a 3-bedroom villa in Arabian Ranches"
          />
          <span className="ad-help">Photos without their own alt text use this one.</span>
        </div>
      )}
      <p className="ad-small ad-muted" aria-live="polite">
        {photos.length
          ? `${photos.length} photo${photos.length === 1 ? "" : "s"} in this set.`
          : ""}
      </p>
    </fieldset>
  );
}

/* ---------- reels ---------- */

function Reel({
  m,
  set,
  onChange,
  usedOn,
  kind,
}: {
  m: Media;
  set: (p: Partial<Media>) => void;
  onChange: (m: Media) => void;
  usedOn: string[];
  kind: "reel" | "ai-avatar";
}) {
  const id = useId();
  const source = m.source ?? (isFileVideo(m.video) ? "upload" : "instagram");
  return (
    <>
      <fieldset className="ad-field" data-testid="reel-source">
        <legend className="ad-label">Where the reel comes from</legend>
        <div className="ad-checks">
          <label className="ad-check">
            <input
              type="radio"
              name={`${id}-src`}
              checked={source === "instagram"}
              onChange={() => set({ source: "instagram" })}
            />
            <span>Instagram reel link</span>
          </label>
          <label className="ad-check">
            <input
              type="radio"
              name={`${id}-src`}
              checked={source === "upload"}
              onChange={() => set({ source: "upload" })}
            />
            <span>Upload video</span>
          </label>
        </div>
        {source === "instagram" ? (
          <InstagramReel m={m} set={set} onChange={onChange} />
        ) : (
          <>
            <p className="ad-small ad-muted">
              For reels that aren’t on our Instagram. Vertical, exported at{" "}
              {MEDIA[kind].video!.width}×{MEDIA[kind].video!.height}.
            </p>
            {isFileVideo(m.video) && (
              <div className="ad-btns">
                <span className="ad-small" data-testid="video-stored">
                  Uploaded video{m.file?.bytes ? ` (${mb(m.file.bytes)})` : ""}
                  {m.file?.optimised === false ? ", not optimised" : ""}.
                </span>
                <button
                  type="button"
                  className="ad-btn quiet small"
                  onClick={() => set({ video: undefined, file: undefined })}
                >
                  Remove video
                </button>
              </div>
            )}
            {/* Stays on screen after the upload, so its sizes and warnings stay readable. */}
            <VideoUpload
              kind={kind}
              folder="reels"
              label={isFileVideo(m.video) ? "Replace video" : "Upload video"}
              onDone={(ref, meta) => set({ video: ref, file: meta, source: "upload" })}
            />
          </>
        )}
      </fieldset>
      <ImageField
        label="Cover image"
        value={m}
        onChange={onChange}
        kind={kind}
        usedOn={usedOn}
        bright={kind === "ai-avatar"}
        required
        hint={`${MEDIA[kind].coverHint} Required: it shows before the reel plays.`}
      />
    </>
  );
}

const IG_HINT = `Paste the link of a reel on our Instagram, @${OUR_INSTAGRAM}. It plays in our own player. A reel from another account can’t play here: it’s saved as “View on Instagram ↗” only.`;

function InstagramReel({
  m,
  set,
  onChange,
}: {
  m: Media;
  set: (p: Partial<Media>) => void;
  onChange: (m: Media) => void;
}) {
  const id = useId();
  const url = m.instagram?.url ?? "";
  const [answer, setAnswer] = useState<{ url: string; r: ReelMatch }>();
  const [cover, setCover] = useState<string>();
  const latest = useRef(m);
  useEffect(() => {
    latest.current = m;
  });
  const shortcode = url ? instagramShortcode(url) : null;
  const check: ReelMatch | { state: "checking" } | null = !url
    ? null
    : !shortcode
      ? { state: "invalid" }
      : answer?.url === url
        ? answer.r
        : { state: "checking" };

  // Check the link with Instagram when it changes (and once on open, so a broken reel is flagged).
  useEffect(() => {
    if (!url || !instagramShortcode(url)) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkInstagramReel(url);
      if (!live) return;
      setAnswer({ url, r });
      const cur = latest.current;
      const sc = instagramShortcode(url)!;
      const id = r.state === "ours" ? r.id : r.state === "other" ? undefined : cur.instagram?.id;
      if (cur.instagram?.id !== id || cur.instagram?.shortcode !== sc)
        onChange({
          ...cur,
          source: "instagram",
          instagram: { url, shortcode: sc, ...(id ? { id } : {}) },
        });
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the link changes
  }, [url]);

  async function copyCover(reelId: string) {
    setCover("Copying the cover…");
    const r = await importInstagramCover(reelId);
    if (!r.ok) return setCover(r.error);
    setCover("Cover copied from the reel.");
    const cur = latest.current;
    const next: Media = {
      ...cur,
      src: r.src,
      width: r.width,
      height: r.height,
      focus: cur.focus ?? "50% 50%",
    };
    delete next.placeholder;
    onChange(next);
  }

  return (
    <div className="ad-field">
      <label htmlFor={`${id}-ig`}>Instagram reel link</label>
      <input
        id={`${id}-ig`}
        type="url"
        inputMode="url"
        placeholder="https://www.instagram.com/reel/…"
        value={url}
        onChange={(e) => {
          const v = e.target.value.trim();
          const sc = instagramShortcode(v);
          set({ source: "instagram", instagram: v ? { url: v, shortcode: sc ?? "" } : undefined });
        }}
        aria-describedby={`${id}-ig-help ${id}-ig-st`}
      />
      <span className="ad-help" id={`${id}-ig-help`}>
        {IG_HINT}
      </span>
      <p className="ad-small" id={`${id}-ig-st`} role="status" data-testid="ig-status">
        {!check
          ? ""
          : check.state === "checking"
            ? "Checking with Instagram…"
            : check.state === "invalid"
              ? "That isn’t an Instagram reel link. It looks like instagram.com/reel/…"
              : check.state === "ours"
                ? `Found on @${OUR_INSTAGRAM}. It plays in our own player on the site.`
                : check.state === "other"
                  ? `This reel isn’t on @${OUR_INSTAGRAM}, so it can’t play on the site. It’s saved as “View on Instagram ↗” only, with the cover image below.`
                  : `Instagram problem: ${check.message} Until it’s fixed the site shows the cover with “View on Instagram ↗”.`}
      </p>
      {check?.state === "ours" && check.thumbnail && (
        <div className="ad-btns">
          <button type="button" className="ad-btn ghost small" onClick={() => copyCover(check.id)}>
            Use the reel’s cover
          </button>
          {cover && <span className="ad-small">{cover}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- 360 tours ---------- */

function Tour({
  m,
  set,
  onChange,
  usedOn,
}: {
  m: Media;
  set: (p: Partial<Media>) => void;
  onChange: (m: Media) => void;
  usedOn: string[];
}) {
  const id = useId();
  const [moved, setMoved] = useState(false);
  const v = m.tour ?? "";
  const ok = !v || !!tourEmbed(v);
  return (
    <>
      <div className="ad-field">
        <label htmlFor={`${id}-tour`}>360 tour link</label>
        <input
          id={`${id}-tour`}
          type="url"
          inputMode="url"
          placeholder={TOUR_HINT}
          value={v}
          aria-invalid={!ok}
          onChange={(e) => {
            const next = e.target.value.trim();
            if (isInstagramUrl(next)) {
              setMoved(true);
              return set({ tour: undefined, instagramUrl: next });
            }
            setMoved(false);
            set({ tour: next || undefined });
          }}
        />
        <span className={ok ? "ad-help" : "ad-err"} role={ok ? undefined : "alert"}>
          {!ok
            ? "Link not recognised. Use a Matterport, Panoee or Kuula link."
            : moved
              ? "That’s an Instagram link, so it went to “Instagram post link” below."
              : `${TOUR_HINT}. It opens in a window on the site, with “Open full screen ↗”.`}
        </span>
      </div>
      <ImageField
        label="Cover image"
        value={m}
        onChange={onChange}
        kind="360"
        usedOn={usedOn}
        required
      />
    </>
  );
}

/* ---------- Instagram post link ---------- */

function InstagramPostLink({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const id = useId();
  const ok = !value || isInstagramUrl(value);
  return (
    <div className="ad-field">
      <label htmlFor={`${id}-igp`}>Instagram post link (optional)</label>
      <input
        id={`${id}-igp`}
        type="url"
        inputMode="url"
        placeholder="https://www.instagram.com/p/…"
        value={value ?? ""}
        aria-invalid={!ok}
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
      />
      <span className={ok ? "ad-help" : "ad-err"}>
        {ok
          ? "Shown under the item as a small “View on Instagram ↗” link."
          : "That isn’t an Instagram link."}
      </span>
    </div>
  );
}
