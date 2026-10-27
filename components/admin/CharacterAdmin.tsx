"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  charAddLink,
  charApprove,
  charFileLink,
  charPublish,
  charRemoveFile,
  charRename,
  charUploadFinish,
  charUploadResume,
  charUploadStart,
  type CharAdminResult,
} from "@/lib/portal/admin-character-actions";
import {
  CHARACTER_STATUS,
  characterTitle,
  PURPOSES,
  variationName,
  type Character,
  type CharacterFile,
} from "@/lib/portal/characters";
import { uploadFile } from "@/lib/upload-browser";

const when = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

/** Every character in a list (one client's, or the global queue with the client's name). */
export function CharacterAdminList({
  characters,
  showClient,
}: {
  characters: Character[];
  showClient?: boolean;
}) {
  if (!characters.length) return <p className="ad-empty">No AI characters yet.</p>;
  return (
    <div className="ad-form" data-testid="admin-characters">
      {characters.map((c) => (
        <CharacterAdminCard key={c.id} c={c} showClient={showClient} />
      ))}
    </div>
  );
}

function CharacterAdminCard({ c, showClient }: { c: Character; showClient?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<CharAdminResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const variations = c.files.filter((f) => f.kind === "variation");
  const next = variations.filter((f) => f.round === c.round + 1);
  const pack = c.files.filter((f) => f.kind === "pack");
  const refs = c.files.filter((f) => f.kind === "reference");
  const canUpload = c.status === "brief_received" || c.status === "revision_requested";
  const [name, setName] = useState(c.name ?? "");
  const [choice, setChoice] = useState(c.approved_file_id ?? c.picked_file_id ?? "");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState({ label: "", url: "" });

  const act = (fn: () => Promise<CharAdminResult>) =>
    start(async () => {
      const out = await fn();
      setR(out);
      if (out.ok) router.refresh();
    });
  const download = (f: CharacterFile) =>
    start(async () => {
      if (f.url && !f.r2_key) return void window.open(f.url, "_blank", "noopener");
      const out = await charFileLink(f.r2_key!, f.label);
      if (out.url) window.location.assign(out.url);
      else setR(out);
    });
  async function upload(kind: "variation" | "pack", list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, kind === "variation" ? 3 - next.length : 20);
    for (const f of files) {
      setBusy(`Uploading ${f.name}…`);
      await uploadFile(
        f,
        `adchar-${c.id}-${kind}`,
        {
          start: () => charUploadStart(c.id, kind, f.name, f.size),
          resume: (key, uploadId) => charUploadResume(key, uploadId, f.size),
          finish: (x) =>
            charUploadFinish(c.id, kind, { ...x, name: f.name, size: f.size, type: f.type }),
        },
        (p) =>
          p.state &&
          p.state !== "Uploading" &&
          p.state !== "Done" &&
          setR({ ok: false, error: p.state }),
      );
    }
    setBusy(null);
    router.refresh();
  }

  const b = c.brief;
  return (
    <section
      className="ad-card ad-form"
      id={c.id}
      aria-label={characterTitle(c)}
      data-testid="admin-character"
    >
      <div className="ad-row-main ad-between ad-wrap">
        <h2 className="ad-h2">
          {characterTitle(c)}
          {showClient && (
            <>
              {" · "}
              <Link href={`/admin/accounts/${c.account_id}/characters`} prefetch={false}>
                {c.account_name}
              </Link>
            </>
          )}
        </h2>
        <span className={`ad-pill ${c.status === "approved" ? "live" : "draft"}`}>
          {CHARACTER_STATUS[c.status]}
          {c.round ? ` · round ${c.round}` : ""}
        </span>
      </div>

      <dl className="ad-dl">
        <dt>Brand</dt>
        <dd>{b.brand}</dd>
        <dt>Purpose</dt>
        <dd>
          {PURPOSES.find((p) => p[0] === b.purpose)?.[1]}
          {b.purpose_other ? `: ${b.purpose_other}` : ""}
        </dd>
        <dt>Look and personality</dt>
        <dd>{b.look}</dd>
        <dt>Setting</dt>
        <dd>{b.setting || "—"}</dd>
        <dt>Voice / language</dt>
        <dd>{[b.voice, b.language].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>Similar to, not the same as</dt>
        <dd>{b.similar_note || "—"}</dd>
        <dt>References</dt>
        <dd>
          {!(b.links ?? []).length && !refs.length && "—"}
          {(b.links ?? []).map((l) => (
            <div key={l}>
              <a href={l} target="_blank" rel="noopener noreferrer">
                {l}
              </a>
            </div>
          ))}
          {refs.map((f) => (
            <div key={f.id}>
              <button type="button" className="ad-btn quiet small" onClick={() => download(f)}>
                {f.label}
              </button>
            </div>
          ))}
        </dd>
      </dl>

      <h3 className="ad-small">Variations</h3>
      {Array.from(
        { length: c.round + (next.length ? 1 : 0) },
        (_, i) => c.round + (next.length ? 1 : 0) - i,
      ).map((round) => (
        <div key={round} className="ad-form">
          <span className="ad-small ad-muted">
            Round {round}
            {round > c.round ? " · not sent yet" : ""}
          </span>
          <div className="ad-char-grid">
            {variations
              .filter((f) => f.round === round)
              .map((f, i) => (
                <figure key={f.id} className={f.id === c.picked_file_id ? "is-picked" : ""}>
                  {f.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.src} alt={`Round ${round}, variation ${i + 1}`} />
                  )}
                  <figcaption>
                    {i + 1}
                    {f.id === c.picked_file_id ? " · client’s pick" : ""}
                    {f.id === c.approved_file_id ? " · approved" : ""}
                    <button
                      type="button"
                      className="ad-btn quiet small"
                      onClick={() => download(f)}
                    >
                      Download
                    </button>
                    {round > c.round && (
                      <button
                        type="button"
                        className="ad-btn quiet small"
                        disabled={pending}
                        onClick={() => act(() => charRemoveFile(f.id))}
                      >
                        Remove
                      </button>
                    )}
                  </figcaption>
                </figure>
              ))}
          </div>
        </div>
      ))}
      {canUpload && (
        <div className="ad-btns ad-center">
          <label className="ad-btn small ghost">
            Upload variations ({next.length}/3)
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={!!busy || next.length >= 3}
              onChange={(e) => void upload("variation", e.target.files)}
            />
          </label>
          <button
            type="button"
            className="ad-btn small"
            disabled={pending || next.length !== 3}
            onClick={() => act(() => charPublish(c.id))}
          >
            Send round {c.round + 1} to the client
          </button>
        </div>
      )}

      {c.status !== "approved" ? (
        c.round > 0 && (
          <div className="ad-form">
            <h3 className="ad-small">Approve</h3>
            <div className="ad-grid2">
              <div className="ad-field">
                <label htmlFor={`n-${c.id}`}>Character name</label>
                <input
                  id={`n-${c.id}`}
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="ad-field">
                <label htmlFor={`p-${c.id}`}>Price (empty: the client’s rate)</label>
                <input
                  id={`p-${c.id}`}
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="ad-field">
              <label htmlFor={`f-${c.id}`}>Image</label>
              <select id={`f-${c.id}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Choose…</option>
                {variations
                  .filter((f) => f.round <= c.round)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {variationName(c, f.id)}
                      {f.id === c.picked_file_id ? " (client’s pick)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div className="ad-btns">
              <button
                type="button"
                className="ad-btn small"
                disabled={pending || !name.trim() || !choice}
                onClick={() =>
                  act(() => charApprove(c.id, name, choice, price.trim() ? Number(price) : null))
                }
              >
                Mark approved
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="ad-btns" style={{ alignItems: "end" }}>
          <div className="ad-field">
            <label htmlFor={`n-${c.id}`}>Character name</label>
            <input
              id={`n-${c.id}`}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ad-btn small ghost"
            disabled={pending || !name.trim() || name === c.name}
            onClick={() => act(() => charRename(c.id, name))}
          >
            Rename
          </button>
        </div>
      )}

      <h3 className="ad-small">Pack files (Milkywayy only)</h3>
      {pack.map((f) => (
        <div key={f.id} className="ad-btns ad-center">
          <span className="ad-small">{f.label}</span>
          <button type="button" className="ad-btn quiet small" onClick={() => download(f)}>
            {f.r2_key ? "Download" : "Open"}
          </button>
          <button
            type="button"
            className="ad-btn quiet small"
            disabled={pending}
            onClick={() => act(() => charRemoveFile(f.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="ad-btns" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label className="ad-btn small ghost">
          Upload face pack, voice sample, notes
          <input
            type="file"
            multiple
            hidden
            disabled={!!busy}
            onChange={(e) => void upload("pack", e.target.files)}
          />
        </label>
        <div className="ad-field">
          <label htmlFor={`ll-${c.id}`}>Or a link</label>
          <input
            id={`ll-${c.id}`}
            placeholder="https://"
            value={link.url}
            onChange={(e) => setLink({ ...link, url: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="ad-btn small ghost"
          disabled={pending || !link.url.trim()}
          onClick={() => act(() => charAddLink(c.id, link.label, link.url))}
        >
          Add link
        </button>
      </div>

      <details>
        <summary className="ad-small">Log ({c.events.length})</summary>
        <ul className="ad-small">
          {c.events.map((e) => (
            <li key={e.id}>
              {when(e.created_at)} · {e.actor_name ?? ""} ·{" "}
              {e.kind === "changes" || e.kind === "revision"
                ? `revision requested${e.kind === "revision" ? " (after approval)" : ""}${e.file_id ? ` (${variationName(c, e.file_id)})` : ""}: “${e.note}”`
                : e.kind === "edited"
                  ? "brief edited by the client"
                  : e.kind === "picked"
                    ? `picked ${variationName(c, e.file_id)}`
                    : e.kind === "variations"
                      ? `round ${e.round} sent`
                      : e.kind === "approved"
                        ? `approved as ${e.note}`
                        : e.kind === "renamed"
                          ? `renamed ${e.note}`
                          : "brief received"}
            </li>
          ))}
        </ul>
      </details>
      {(busy || r) && (
        <span className={r && !r.ok ? "ad-status error" : "ad-status"} role="status">
          {busy ?? (r?.ok ? r.notice : r?.error)}
        </span>
      )}
    </section>
  );
}
