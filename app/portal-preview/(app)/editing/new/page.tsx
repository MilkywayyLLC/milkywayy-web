"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/portal-mock/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Back, NotFor } from "@/components/portal-mock/ui";

const KINDS = ["HDR photos", "Short-form", "Long-form", "Avatar edit", "Other"];

export default function NewBatch() {
  const { account } = usePersona();
  const [kind, setKind] = useState("HDR photos");
  const [mode, setMode] = useState<"links" | "upload">("links");
  const [links, setLinks] = useState([{ label: "Raw files", url: "" }]);
  const [sent, setSent] = useState(false);
  if (!account.services.includes("editing")) return <NotFor what="post-production" />;

  if (sent)
    return (
      <div className="pt-card" style={{ maxWidth: 560 }}>
        <span className="pt-eb">MW-2048 · Submitted</span>
        <h1 className="pt-h1" style={{ fontSize: 26 }}>
          Batch received
        </h1>
        <p>
          We’ll check the files and move it to “Files received”, usually within a few hours. You’ll
          get a WhatsApp and an email.
        </p>
        <div className="pt-btns">
          <Link href="/portal-preview/editing/MW-2047" className="btn btn-p btn-s">
            Open the batch
          </Link>
          <Link href="/portal-preview/editing" className="btn btn-g btn-s">
            All batches
          </Link>
        </div>
      </div>
    );

  return (
    <>
      <Back href="/portal-preview/editing" label="Editing" />
      <h1 className="pt-h1">New batch</h1>
      <form
        className="pt-form pt-card"
        style={{ maxWidth: 680 }}
        onSubmit={(e) => (e.preventDefault(), setSent(true))}
      >
        <label className="pt-field">
          Title *
          <input type="text" required placeholder="e.g. Willow Creek: October listings" />
        </label>
        <div className="pt-field">
          What is it?
          <div className="pt-chips" role="group" aria-label="What is it?">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="pt-pill"
                style={{ padding: "4px 14px" }}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="pt-field">
            Quantity (optional)
            <input type="number" placeholder={kind === "HDR photos" ? "e.g. 120" : "e.g. 6"} />
          </label>
          <label className="pt-field">
            Deadline wish (optional)
            <input type="date" />
          </label>
        </div>
        <label className="pt-field">
          Notes
          <textarea placeholder="Style, music, captions, anything we should know" />
        </label>
        <label className="pt-field">
          Reference link (optional)
          <input type="url" placeholder="A video or photos in the style you want" />
        </label>

        <div className="pt-field">
          Raw files *
          <div className="pt-seg" role="group" aria-label="How to send raw files">
            <button type="button" aria-pressed={mode === "links"} onClick={() => setMode("links")}>
              Paste links
            </button>
            <button
              type="button"
              aria-pressed={mode === "upload"}
              onClick={() => setMode("upload")}
            >
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
                <input type="text" aria-label="Label" defaultValue={l.label} />
                <input
                  type="url"
                  aria-label="Link"
                  placeholder="Drive, Dropbox, OneDrive, WeTransfer or Frame.io"
                  required={i === 0}
                />
              </div>
            ))}
            <button
              type="button"
              className="lnk pt-small"
              style={{ justifySelf: "start" }}
              onClick={() => setLinks([...links, { label: "More files", url: "" }])}
            >
              + Add another link
            </button>
            <span className="pt-meta">
              Make sure the link is set to “anyone with the link can view”.
            </span>
          </>
        ) : (
          <button
            type="button"
            className="pt-card"
            style={{
              borderStyle: "dashed",
              placeItems: "center",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--bg)",
              color: "var(--fg)",
            }}
          >
            <Icon name="download" size={24} />
            <b>Choose files</b>
            <span className="pt-meta">
              Up to 5 GB per file. Bigger than that? Paste a link instead.
            </span>
          </button>
        )}
        <button type="submit" className="btn btn-p">
          Submit batch
        </button>
      </form>
    </>
  );
}
