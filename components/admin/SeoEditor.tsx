"use client";

import { cx } from "@/lib/cx";
import { useState, useTransition } from "react";
import { saveSeo } from "@/lib/admin/actions";
import type { SeoPage } from "@/lib/seo/pages";
import { ImageField } from "./ImageField";

type Row = { title?: string | null; description?: string | null; og_image?: string | null };

/** One page's search title, description and share image. Empty = the built-in default. */
function PageSeo({ page, row }: { page: SeoPage; row: Row }) {
  const [title, setTitle] = useState(row.title ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [og, setOg] = useState(row.og_image ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  const len = (description || page.description).length;
  return (
    <details className="ad-card" data-testid={`seo-${page.key}`}>
      <summary style={{ cursor: "pointer" }}>
        <b>{page.name}</b> <span className="ad-small ad-muted">{page.path}</span>
        {(row.title || row.description || row.og_image) && (
          <span className="ad-pill draft" style={{ marginLeft: 8 }}>
            Custom
          </span>
        )}
      </summary>
      <div className="ad-form" style={{ marginTop: 14 }}>
        <div className="ad-field">
          <label htmlFor={`t-${page.key}`}>
            Title in Google ({(title || page.title).length}/70)
          </label>
          <input
            id={`t-${page.key}`}
            type="text"
            value={title}
            placeholder={page.title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors.title || undefined}
          />
          {errors.title && <span className="ad-err">{errors.title}</span>}
        </div>
        <div className="ad-field">
          <label htmlFor={`d-${page.key}`}>Description ({len} characters; aim for 140–160)</label>
          <textarea
            id={`d-${page.key}`}
            rows={3}
            value={description}
            placeholder={page.description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={!!errors.description || undefined}
          />
          {errors.description && <span className="ad-err">{errors.description}</span>}
          <span className="ad-help">Leave empty to use the text shown in grey.</span>
        </div>
        <ImageField
          label="Share image (leave empty for the built-in one)"
          value={og ? { src: og, alt: page.title } : { alt: page.title }}
          onChange={(m) => setOg(m.src ?? "")}
          error={errors.og_image}
          kind="og"
          usedOn={[`Link previews of ${page.title} (WhatsApp, LinkedIn, X)`]}
        />
        <p className="ad-small">
          <a href={og || `/og/${page.key}`} target="_blank" rel="noopener">
            See the share image
          </a>
        </p>
        <div className="ad-btns" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="ad-btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveSeo(page.key, { title, description, og_image: og });
                setErrors(r.ok ? {} : (r.errors ?? {}));
                setMsg(
                  r.ok
                    ? { ok: true, text: "Saved. Live in a few seconds." }
                    : { ok: false, text: r.error ?? "Check the highlighted fields." },
                );
              })
            }
          >
            Save
          </button>
          {og && (
            <button type="button" className="ad-btn quiet" onClick={() => setOg("")}>
              Use the built-in image
            </button>
          )}
          <span className={cx("ad-status", msg && (msg.ok ? "ok" : "error"))} role="status">
            {pending ? "Saving…" : msg?.text}
          </span>
        </div>
      </div>
    </details>
  );
}

export function SeoEditor({ pages, rows }: { pages: SeoPage[]; rows: Record<string, Row> }) {
  return (
    <>
      {pages.map((p) => (
        <PageSeo key={p.key} page={p} row={rows[p.key] ?? {}} />
      ))}
    </>
  );
}
