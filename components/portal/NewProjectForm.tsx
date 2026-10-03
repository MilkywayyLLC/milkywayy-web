"use client";

import Link from "next/link";
import { useState } from "react";
import { FilePicker, UploadRows, useClientUploads } from "@/components/portal/ClientUpload";
import { createProject } from "@/lib/portal/project-actions";
import { AVATAR_LENGTHS, EDIT_KINDS, TYPE_PATH } from "@/lib/portal/projects";

/**
 * New batch (§5.3) or new avatar video (§5.4). Raw files: paste links or upload (straight to R2,
 * resumable). The project is created first, then the uploads go into it, so nothing is lost if an
 * upload stops: the client can add the rest from the project page.
 */
export function NewProjectForm({ type, maxGb }: { type: "edit" | "avatar"; maxGb: number }) {
  const avatar = type === "avatar";
  const kinds = avatar ? AVATAR_LENGTHS : EDIT_KINDS;
  const [kind, setKind] = useState<string>(kinds[0][0]);
  const [scriptBy, setScriptBy] = useState<"milkywayy" | "client">("milkywayy");
  const [mode, setMode] = useState<"links" | "upload">("links");
  const [links, setLinks] = useState([
    { label: avatar ? "Logo and assets" : "Raw files", url: "" },
  ]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<{ ref: string; id: string; failed: boolean }>();
  const { rows, busy, upload } = useClientUploads();
  const base = TYPE_PATH[type];

  if (made)
    return (
      <div className="pt-card" style={{ maxWidth: 560 }}>
        <span className="pt-eb">
          {made.ref} · {avatar ? "Brief received" : "Submitted"}
        </span>
        <h1 className="pt-h1" style={{ fontSize: 26 }}>
          {avatar ? "Brief received" : "Batch received"}
        </h1>
        <p style={{ margin: 0 }}>
          {avatar
            ? "We’ll write up the script and post it here for your approval. You’ll get an email."
            : "We’ll check the files and move it to “Files received”, usually within a few hours. You’ll get an email."}
        </p>
        {made.failed && (
          <p className="pt-error" role="alert">
            Some files didn’t upload. Open the project and add them again: uploads pick up where
            they stopped.
          </p>
        )}
        <UploadRows rows={rows} />
        <div className="pt-btns">
          <Link href={`${base}/${made.ref}`} className="btn btn-p btn-s">
            Open the {avatar ? "project" : "batch"}
          </Link>
          <Link href={base} className="btn btn-g btn-s">
            {avatar ? "All avatar videos" : "All batches"}
          </Link>
        </div>
      </div>
    );

  return (
    <form
      className="pt-form pt-card"
      style={{ maxWidth: 680 }}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(undefined);
        if (!avatar && mode === "links" && !links.some((l) => l.url.trim()))
          return setError("Paste a link to the raw files, or switch to Upload.");
        if (!avatar && mode === "upload" && !files.length)
          return setError("Choose the raw files to upload, or paste a link.");
        setSaving(true);
        const r = await createProject({
          type,
          title: String(f.get("title") ?? ""),
          kind,
          quantity: Number(f.get("quantity")) || null,
          notes: String(f.get("notes") ?? ""),
          references: [String(f.get("reference") ?? "")],
          due: String(f.get("due") ?? "") || null,
          scriptBy,
          links: mode === "links" ? links : [],
        });
        if (!r.ok) {
          setSaving(false);
          return setError(r.error);
        }
        let failed = false;
        if (mode === "upload" && files.length) failed = (await upload(r.id!, files)) < files.length;
        setMade({ ref: r.ref!, id: r.id!, failed });
      }}
    >
      <label className="pt-field">
        Title *
        <input
          name="title"
          type="text"
          required
          maxLength={160}
          placeholder={
            avatar ? "e.g. JVC launch: 60s presenter video" : "e.g. Willow Creek: October listings"
          }
        />
      </label>
      <div className="pt-field">
        {avatar ? "Length" : "What is it?"}
        <div className="pt-chips" role="group" aria-label={avatar ? "Length" : "What is it?"}>
          {kinds.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="pt-pill"
              style={{ padding: "4px 14px" }}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {avatar && (
        <div className="pt-field">
          Script
          <div className="pt-seg" role="group" aria-label="Who writes the script">
            <button
              type="button"
              aria-pressed={scriptBy === "milkywayy"}
              onClick={() => setScriptBy("milkywayy")}
            >
              Milkywayy writes it
            </button>
            <button
              type="button"
              aria-pressed={scriptBy === "client"}
              onClick={() => setScriptBy("client")}
            >
              I’ll send it
            </button>
          </div>
        </div>
      )}
      <div className="pt-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {!avatar && (
          <label className="pt-field">
            Quantity (optional)
            <input
              name="quantity"
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              placeholder={kind === "hdr_photos" ? "e.g. 120" : "e.g. 6"}
            />
          </label>
        )}
        <label className="pt-field">
          Deadline wish (optional)
          <input name="due" type="date" min={new Date().toISOString().slice(0, 10)} />
        </label>
      </div>
      <label className="pt-field">
        {avatar ? "Brief" : "Notes"}
        <textarea
          name="notes"
          maxLength={4000}
          placeholder={
            avatar
              ? scriptBy === "client"
                ? "Paste your script here, plus who it’s for and the tone"
                : "What the video is about, who it’s for, key points, the call to action"
              : "Style, music, captions, anything we should know"
          }
        />
      </label>
      <label className="pt-field">
        Reference link (optional)
        <input
          name="reference"
          type="url"
          placeholder={
            avatar ? "A video in the style you want" : "A video or photos in the style you want"
          }
        />
      </label>

      <div className="pt-field">
        {avatar ? "Files (optional: logo, footage, brand assets)" : "Raw files *"}
        <div className="pt-seg" role="group" aria-label="How to send files">
          <button type="button" aria-pressed={mode === "links"} onClick={() => setMode("links")}>
            Paste links
          </button>
          <button type="button" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>
            Upload
          </button>
        </div>
      </div>
      {mode === "links" ? (
        <>
          {links.map((l, i) => (
            <div
              key={i}
              className="pt-grid2"
              style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 8 }}
            >
              <input
                type="text"
                aria-label={`Label ${i + 1}`}
                value={l.label}
                maxLength={160}
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <input
                type="url"
                aria-label={`Link ${i + 1}`}
                value={l.url}
                placeholder="Drive, Dropbox, OneDrive, WeTransfer or Frame.io"
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
              />
            </div>
          ))}
          {links.length < 10 && (
            <button
              type="button"
              className="lnk pt-small"
              style={{ justifySelf: "start" }}
              onClick={() => setLinks([...links, { label: "More files", url: "" }])}
            >
              + Add another link
            </button>
          )}
          <span className="pt-meta">
            Make sure the link is set to “anyone with the link can view”.
          </span>
        </>
      ) : (
        <FilePicker files={files} onChange={setFiles} maxGb={maxGb} disabled={saving} />
      )}
      <UploadRows rows={rows} />
      {error && (
        <p className="pt-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-p" disabled={saving || busy}>
        {busy ? "Uploading…" : saving ? "Sending…" : avatar ? "Send brief" : "Submit batch"}
      </button>
    </form>
  );
}
