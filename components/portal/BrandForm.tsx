"use client";

import { useState, useTransition } from "react";
import { brandLogoUrl, saveBrand } from "@/lib/portal/listing-actions";
import { putBlob } from "@/lib/upload-browser";
import { BrandHeader, type BrandLayout } from "@/components/share/BrandHeader";
import { Dropzone } from "./Dropzone";

const LAYOUTS: [BrandLayout, string][] = [
  ["logo", "Logo only"],
  ["icon_name", "Icon + name"],
  ["name", "Name only"],
];

/**
 * Company name and logo on share pages (§6.2: optional agent branding). Owner/Admins. Phase 1:
 * a header layout (Logo only · Icon + name · Name only) with a live preview in light and dark,
 * drawn by the same component as the public page.
 */
export function BrandForm({
  name,
  logoKey,
  logoPreview,
  fallbackName,
  layout: savedLayout,
}: {
  name: string;
  logoKey: string | null;
  logoPreview: string | null;
  fallbackName: string;
  layout: BrandLayout | null;
}) {
  const [layout, setLayout] = useState<BrandLayout | null>(savedLayout);
  const [n, setN] = useState(name);
  const [key, setKey] = useState(logoKey);
  const [preview, setPreview] = useState(logoPreview);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  async function upload(f: File) {
    setMsg("Uploading…");
    const r = await brandLogoUrl(f.type, f.size);
    if (!r.ok || !r.url || !r.key) return setMsg(r.error ?? "Couldn’t upload.");
    if (!(await putBlob(r.url, f))) return setMsg("Couldn’t upload. Try again.");
    setKey(r.key);
    setPreview(URL.createObjectURL(f));
    setMsg("Logo ready. Save to use it.");
  }

  return (
    <form
      className="pt-form"
      aria-label="Share page branding"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBrand(n, key, layout);
          setMsg(r.ok ? (r.notice ?? "Saved.") : (r.error ?? "Couldn’t save."));
        });
      }}
    >
      <label className="pt-field">
        Company name on share pages
        <input
          type="text"
          maxLength={80}
          value={n}
          onChange={(e) => setN(e.target.value)}
          placeholder={fallbackName}
        />
      </label>
      <div className="pt-field">
        <span className="pt-field-label">Logo</span>
        <Dropzone
          items={
            preview || key
              ? [{ id: "logo", name: "Logo", src: preview ?? undefined, saved: true }]
              : []
          }
          onAdd={(f) => f[0] && void upload(f[0])}
          onRemove={() => {
            setKey(null);
            setPreview(null);
            setMsg("Logo removed. Save to confirm.");
          }}
          accept="image/png,image/jpeg,image/webp"
          types="PNG, JPG or WebP"
          maxMb={1}
          multiple={false}
          noun="your logo"
          testId="brand-logo"
        />
      </div>
      <fieldset className="pt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pt-field-label">Header layout</legend>
        <div className="pt-choice" role="radiogroup" aria-label="Header layout">
          {LAYOUTS.map(([v, label]) => (
            <label key={v}>
              <input
                type="radio"
                name="brand-layout"
                value={v}
                checked={(layout ?? (preview ? "icon_name" : "name")) === v}
                disabled={v !== "name" && !preview}
                onChange={() => setLayout(v)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="pt-brandprev" aria-label="Header preview" data-testid="brand-preview">
        {(["light", "dark"] as const).map((tone) => (
          <div key={tone} className="pt-brandprev-pane" data-tone={tone}>
            <span className="pt-eb">{tone === "light" ? "Light" : "Dark"}</span>
            <BrandHeader
              name={n.trim() || (fallbackName.startsWith("e.g.") ? null : fallbackName)}
              logo={preview}
              layout={layout ?? (preview ? "icon_name" : "name")}
            />
          </div>
        ))}
      </div>
      <span className="pt-meta" role="status">
        {msg}
      </span>
      <button type="submit" className="btn btn-p btn-s" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}
