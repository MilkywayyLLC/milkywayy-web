"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { bytes } from "@/lib/portal/projects";
import { Icon } from "./Icon";

/**
 * The portal's file picker (owner, 17 Oct 2026), in place of the browser's bare "Choose files":
 * a dashed box with an upload icon, "Drag … here or click to browse", the accepted types and
 * size, a drag-over state, and a grid of what's chosen (a thumbnail for images, else the name)
 * with × to remove, upload progress and errors. The parent keeps the list; this checks type and
 * size before anything is added.
 */
export type DropItem = {
  id: string;
  name: string;
  size?: number;
  /** A preview (images): an object URL or a signed link. */
  src?: string;
  /** 0–1 while uploading. */
  progress?: number;
  error?: string;
  /** Already on the server (an edit): shown with a small "Added" note. */
  saved?: boolean;
};

export function Dropzone({
  items,
  onAdd,
  onRemove,
  accept = "image/*",
  types = "JPG, PNG or WebP",
  maxMb,
  max,
  multiple = true,
  noun = "images",
  disabled,
  invalid,
  describedBy,
  testId,
}: {
  items: DropItem[];
  onAdd: (files: File[]) => void;
  onRemove?: (id: string) => void;
  /** The input's accept list ("image/*", "application/pdf,image/png"…). */
  accept?: string;
  /** What the box says is accepted. */
  types?: string;
  maxMb: number;
  /** The most files in the list. */
  max?: number;
  multiple?: boolean;
  /** "images", "files", "a file"… in "Drag images here". */
  noun?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  const [rejects, setRejects] = useState<string[]>([]);
  const depth = useRef(0);
  const id = useId();
  const full = !!max && items.length >= max;

  const fits = (f: File) =>
    accept
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .some((a) =>
        a.endsWith("/*")
          ? f.type.toLowerCase().startsWith(a.slice(0, -1))
          : a.startsWith(".")
            ? f.name.toLowerCase().endsWith(a)
            : f.type.toLowerCase() === a,
      );
  function take(list: File[]) {
    if (disabled) return;
    const bad: string[] = [];
    const good = list.filter((f) => {
      if (accept && !fits(f)) bad.push(`${f.name}: not a ${types} file`);
      else if (f.size > maxMb * 1024 * 1024) bad.push(`${f.name}: over ${maxMb} MB`);
      else return true;
      return false;
    });
    const room = max ? Math.max(0, max - (multiple ? items.length : 0)) : good.length;
    const keep = (multiple ? good : good.slice(0, 1)).slice(0, room);
    if (good.length > keep.length && multiple) bad.push(`${max} at most: some weren’t added`);
    setRejects(bad);
    if (keep.length) onAdd(keep);
  }

  return (
    <div className="pt-dz" data-testid={testId}>
      <label
        className="pt-dz-box"
        data-over={over ? "" : undefined}
        data-disabled={disabled || (full && multiple) ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          take(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          className="pt-dz-input"
          aria-label={`Choose ${noun}`}
          accept={accept}
          multiple={multiple}
          disabled={disabled || (full && multiple)}
          aria-describedby={[`${id}-types`, describedBy].filter(Boolean).join(" ")}
          onChange={(e) => {
            take(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="pt-dz-ic" aria-hidden="true">
          <Icon name="upload" size={22} />
        </span>
        <b className="pt-dz-h">
          {full && multiple ? `${max} added, the most there can be` : `Drag ${noun} here or `}
          {!(full && multiple) && <span className="pt-dz-link">click to browse</span>}
        </b>
        <span className="pt-meta" id={`${id}-types`}>
          {types} · up to {maxMb >= 1024 ? `${Math.round(maxMb / 1024)} GB` : `${maxMb} MB`}
          {multiple ? " each" : ""}
          {max && multiple ? ` · ${max} at most` : ""}
        </span>
      </label>
      {rejects.length > 0 && (
        <p className="pt-error" role="alert">
          {rejects.join(". ")}.
        </p>
      )}
      {items.length > 0 && (
        <ul className="pt-dz-grid" aria-label="Chosen files">
          {items.map((it) => (
            <li key={it.id} className="pt-dz-item" data-error={it.error ? "" : undefined}>
              {it.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.src} alt="" />
              ) : (
                <span className="pt-dz-file" aria-hidden="true">
                  <Icon name="photo" size={20} />
                </span>
              )}
              <span className="pt-dz-name" title={it.name}>
                {it.name}
                {it.size ? <small> · {bytes(it.size)}</small> : null}
              </span>
              {it.progress != null && it.progress < 1 && !it.error && (
                <span
                  className="pt-dz-bar"
                  role="progressbar"
                  aria-label={`Uploading ${it.name}`}
                  aria-valuenow={Math.round(it.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </span>
              )}
              {it.progress === 1 && !it.error && <span className="pt-dz-ok">Uploaded</span>}
              {it.saved && it.progress == null && <span className="pt-dz-ok">Added</span>}
              {it.error && <span className="pt-dz-err">{it.error}</span>}
              {onRemove && (
                <button
                  type="button"
                  className="pt-dz-x"
                  aria-label={`Remove ${it.name}`}
                  disabled={disabled}
                  onClick={() => onRemove(it.id)}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Chosen files with stable ids and image previews (object URLs freed on remove and unmount). */
export type Picked = { id: string; file: File; src?: string };
export function usePicked() {
  const [list, setList] = useState<Picked[]>([]);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const u = urls.current;
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, []);
  const add = (files: File[], replace = false) =>
    setList((l) => {
      if (replace) l.forEach((p) => p.src && URL.revokeObjectURL(p.src));
      const next = files.map((file) => {
        // Only types every browser can draw (an iPhone HEIC showed as a broken image).
        const src = /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)
          ? URL.createObjectURL(file)
          : undefined;
        if (src) urls.current.add(src);
        return {
          id: `${file.name}:${file.size}:${Math.random().toString(36).slice(2, 8)}`,
          file,
          src,
        };
      });
      return replace ? next : [...l, ...next];
    });
  const remove = (id: string) =>
    setList((l) => {
      const p = l.find((x) => x.id === id);
      if (p?.src) URL.revokeObjectURL(p.src);
      return l.filter((x) => x.id !== id);
    });
  const clear = () => setList([]);
  return { list, add, remove, clear };
}

/** One optional file (an attachment, a receipt) in the same dropzone. */
export function SingleFile({
  label,
  file,
  onFile,
  accept = "",
  types = "Any file",
  maxMb,
  noun = "a file",
  testId,
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  accept?: string;
  types?: string;
  maxMb: number;
  noun?: string;
  testId?: string;
}) {
  const src = useMemo(
    () =>
      file && /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)
        ? URL.createObjectURL(file)
        : undefined,
    [file],
  );
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );
  return (
    <div className="pt-field" role="group" aria-label={label}>
      <span className="pt-field-label">{label}</span>
      <Dropzone
        items={file ? [{ id: "f", name: file.name, size: file.size, src }] : []}
        onAdd={(f) => onFile(f[0] ?? null)}
        onRemove={() => onFile(null)}
        accept={accept}
        types={types}
        maxMb={maxMb}
        multiple={false}
        noun={noun}
        testId={testId}
      />
    </div>
  );
}
