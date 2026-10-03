"use client";

/* eslint-disable @next/next/no-img-element -- signed, short-lived R2 preview */
import { useState, useTransition } from "react";
import { brandLogoUrl, saveBrand } from "@/lib/portal/listing-actions";
import { putBlob } from "@/lib/upload-browser";

/** Company name and logo on share pages (§6.2: optional agent branding). Owner/Admins. */
export function BrandForm({
  name,
  logoKey,
  logoPreview,
  fallbackName,
}: {
  name: string;
  logoKey: string | null;
  logoPreview: string | null;
  fallbackName: string;
}) {
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
          const r = await saveBrand(n, key);
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
        <label htmlFor="brand-logo">Logo (PNG, JPG or WebP, under 1 MB)</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {preview && (
            <img src={preview} alt="Logo" style={{ height: 36, width: "auto", maxWidth: 140 }} />
          )}
          <input
            id="brand-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
        {key && (
          <button
            type="button"
            className="lnk pt-small"
            style={{ justifySelf: "start" }}
            onClick={() => {
              setKey(null);
              setPreview(null);
              setMsg("Logo removed. Save to confirm.");
            }}
          >
            Remove logo
          </button>
        )}
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
