"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/portal/Icon";
import { Badge } from "@/components/portal/ui";
import {
  characterFileLink,
  createCharacter,
  finishCharacterUpload,
  pickCharacter,
  requestCharacterChanges,
  resumeCharacterUpload,
  startCharacterUpload,
} from "@/lib/portal/character-actions";
import {
  CHARACTER_STATUS,
  characterTitle,
  coverOf,
  PURPOSES,
  variationName,
  type Character,
  type CharacterStatus,
  type Purpose,
} from "@/lib/portal/characters";
import type { RequestConfig } from "@/lib/portal/requests";
import { uploadFile } from "@/lib/upload-browser";
import { Field, FormBanner, Modal, useFormCheck } from "./forms";
import type { Presenter } from "./NewProjectForm";
import { StartRequests } from "./StartRequests";

const isHttps = (u: string) => /^https:\/\/\S+$/.test(u.trim());
const toneOf = (s: CharacterStatus) =>
  s === "approved"
    ? "ok"
    : s === "variations_ready"
      ? "gold"
      : s === "revision_requested"
        ? "warn"
        : undefined;
const when = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The Avatars tab's buttons (17 Oct 2026): "Create your AI avatar" (a character brief) is the
 * primary one; "New AI avatar video" needs an approved character, so without one it starts the
 * character brief first.
 */
export function CharacterLauncher({
  cfg,
  presenters,
}: {
  cfg: RequestConfig;
  presenters: Presenter[];
}) {
  const [open, setOpen] = useState<null | "create" | "first">(null);
  if (!cfg.avatars) return null;
  return (
    <div className="pt-btns">
      {presenters.length ? (
        <StartRequests
          cfg={cfg}
          only="avatar"
          label="New AI avatar video"
          primary={false}
          characters={presenters}
        />
      ) : (
        <button type="button" className="btn btn-g btn-s" onClick={() => setOpen("first")}>
          <Icon name="plus" size={16} /> New AI avatar video
        </button>
      )}
      <button type="button" className="btn btn-p btn-s" onClick={() => setOpen("create")}>
        <Icon name="plus" size={16} /> Create your AI avatar
      </button>
      {open && <CreateCharacterModal first={open === "first"} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Brief = {
  brand: string;
  purpose: Purpose | "";
  purposeOther: string;
  look: string;
  setting: string;
  voice: string;
  language: string;
  links: string;
  similar: string;
};

export function CreateCharacterModal({ first, onClose }: { first?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<Brief>({
    brand: "",
    purpose: "",
    purposeOther: "",
    look: "",
    setting: "",
    voice: "",
    language: "English",
    links: "",
    similar: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ failed: boolean } | null>(null);
  const set = (p: Partial<Brief>) => setB((x) => ({ ...x, ...p }));
  const links = b.links.split(/\s+/).filter(Boolean);
  const form = useFormCheck(() => ({
    brand: b.brand.trim().length < 2 && "Tell us the brand and what it does.",
    purpose: !b.purpose && "Choose what the avatar is for.",
    purposeOther: b.purpose === "other" && !b.purposeOther.trim() && "Say what it’s for.",
    look: b.look.trim().length < 2 && "Describe the look and personality.",
    links: links.some((l) => !isHttps(l)) && "Links must start with https://",
    files: files.some((f) => !/^image\//.test(f.type)) && "Reference files must be images.",
  }));

  async function submit() {
    if (!form.check()) return;
    setSaving(true);
    const r = await createCharacter({
      brand: b.brand,
      purpose: b.purpose as Purpose,
      purpose_other: b.purposeOther,
      look: b.look,
      setting: b.setting,
      voice: b.voice,
      language: b.language,
      links,
      similar_note: b.similar,
    });
    if (!r.ok || !r.id) {
      setSaving(false);
      return form.fail(r.error ?? "Couldn’t send it. Try again.");
    }
    const id = r.id;
    let ok = 0;
    for (const f of files)
      if (
        await uploadFile(
          f,
          `char-${id}`,
          {
            start: () => startCharacterUpload(id, f.name, f.size),
            resume: (key, uploadId) => resumeCharacterUpload(id, key, uploadId, f.size),
            finish: (x) =>
              finishCharacterUpload(id, { ...x, name: f.name, size: f.size, type: f.type }),
          },
          () => undefined,
        )
      )
        ok++;
    setDone({ failed: ok < files.length });
    setSaving(false);
    router.refresh();
  }

  if (done)
    return (
      <Modal title="Create your AI avatar" onClose={onClose} testId="character-modal">
        <div className="pt-form" role="status">
          <span className="pt-eb">Brief received</span>
          <b style={{ fontSize: 20 }}>We’re on it</b>
          <p style={{ margin: 0 }}>
            We’ll design three variations for you to choose from. You’ll get an email when they’re
            ready.
          </p>
          {done.failed && (
            <p className="pt-error" role="alert">
              Some reference images didn’t upload. Send them on WhatsApp or paste a link.
            </p>
          )}
          <div className="pt-btns">
            <button type="button" className="btn btn-p btn-s" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      title="Create your AI avatar"
      onClose={onClose}
      testId="character-modal"
      footer={
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Sending…" : "Send brief"}
        </button>
      }
    >
      <div className="pt-form">
        {first && (
          <p className="pt-meta" style={{ margin: 0 }}>
            Every avatar video has your own AI presenter. Create it first: once you approve it, you
            can order videos with it.
          </p>
        )}
        <FormBanner text={form.banner} />
        <Field name="brand" label="Your brand and what it does" required error={form.errors.brand}>
          <textarea
            rows={2}
            value={b.brand}
            onChange={(e) => set({ brand: e.target.value })}
            placeholder="e.g. Pinnacle Real Estate, luxury villas in Dubai Hills"
          />
        </Field>
        <Field name="purpose" label="What it’s for" required group error={form.errors.purpose}>
          <div className="pt-seg" role="group" aria-label="What it’s for">
            {PURPOSES.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={b.purpose === k}
                onClick={() => set({ purpose: k })}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        {b.purpose === "other" && (
          <Field
            name="purposeOther"
            label="Say what it’s for"
            required
            error={form.errors.purposeOther}
          >
            <input value={b.purposeOther} onChange={(e) => set({ purposeOther: e.target.value })} />
          </Field>
        )}
        <Field name="look" label="Look and personality" required error={form.errors.look}>
          <textarea
            rows={3}
            value={b.look}
            onChange={(e) => set({ look: e.target.value })}
            placeholder="Age, style, clothing, energy: e.g. early 30s, sharp suit, warm and confident"
          />
        </Field>
        <Field name="setting" label="Setting">
          <input
            value={b.setting}
            onChange={(e) => set({ setting: e.target.value })}
            placeholder="e.g. studio, Dubai outdoor, a modern office"
          />
        </Field>
        <div className="pt-grid2">
          <Field name="voice" label="Voice">
            <input
              value={b.voice}
              onChange={(e) => set({ voice: e.target.value })}
              placeholder="e.g. male, calm, British accent"
            />
          </Field>
          <Field name="language" label="Language">
            <input value={b.language} onChange={(e) => set({ language: e.target.value })} />
          </Field>
        </div>
        <Field
          name="links"
          label="Reference links"
          error={form.errors.links}
          hint="Optional. One per line: Instagram, a video, a photo."
        >
          <textarea rows={2} value={b.links} onChange={(e) => set({ links: e.target.value })} />
        </Field>
        <Field
          name="files"
          label="Reference images"
          error={form.errors.files}
          hint={files.length ? `${files.length} chosen` : "Optional."}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
          />
        </Field>
        <Field
          name="similar"
          label="Similar to, not the same as"
          hint="If you reference a real person, say what to borrow: we never copy someone’s face."
        >
          <textarea rows={2} value={b.similar} onChange={(e) => set({ similar: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/** "Your characters": a card per character (approved image, name, status). */
export function CharactersRow({ characters }: { characters: Character[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = characters.find((c) => c.id === openId) ?? null;
  return (
    <section className="pt-char-sec" aria-label="Your characters">
      <b className="pt-h2">Your characters</b>
      {characters.length ? (
        <div className="pt-char-row" data-testid="characters">
          {characters.map((c) => {
            const img = coverOf(c);
            return (
              <button
                key={c.id}
                type="button"
                className="pt-card pt-card-link pt-char-card"
                onClick={() => setOpenId(c.id)}
              >
                {img?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.src} alt="" />
                ) : (
                  <span className="pt-char-ph" aria-hidden="true">
                    <Icon name="ai" size={28} />
                  </span>
                )}
                <b className="pt-title">{characterTitle(c)}</b>
                <Badge tone={toneOf(c.status)}>{CHARACTER_STATUS[c.status]}</Badge>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="pt-meta" style={{ margin: 0 }}>
          No characters yet. Create your AI avatar: we design three variations, you choose.
        </p>
      )}
      {open && <CharacterModal c={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function CharacterModal({ c, onClose }: { c: Character; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<{ file: string | null; note: string } | null>(null);
  const round = c.files.filter((f) => f.kind === "variation" && f.round === c.round);
  const approved = c.files.find((f) => f.id === c.approved_file_id);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong. Try again.");
      setChanges(null);
      router.refresh();
    });
  const download = (id: string) =>
    start(async () => {
      const r = await characterFileLink(id);
      if (!r.ok || !r.url) return setError(r.error ?? "Couldn’t get the file.");
      window.location.assign(r.url);
    });

  return (
    <Modal title={characterTitle(c)} onClose={onClose} testId="character-view">
      <div className="pt-form">
        <div className="pt-row">
          <span className="pt-eb">{c.round ? `Round ${c.round}` : "Brief"}</span>
          <Badge tone={toneOf(c.status)}>{CHARACTER_STATUS[c.status]}</Badge>
        </div>
        {error && (
          <p className="pt-form-banner" role="alert">
            {error}
          </p>
        )}

        {c.status === "approved" && approved ? (
          <div className="pt-char-approved">
            {approved.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={approved.src} alt={characterTitle(c)} />
            )}
            <b style={{ fontSize: 20 }}>{characterTitle(c)}</b>
            <button
              type="button"
              className="btn btn-g btn-s"
              disabled={pending}
              onClick={() => download(approved.id)}
            >
              <Icon name="download" size={16} /> Download image
            </button>
          </div>
        ) : c.status === "brief_received" || c.status === "revision_requested" ? (
          <p style={{ margin: 0 }}>
            {c.status === "brief_received"
              ? "We’re designing three variations. You’ll get an email when they’re ready."
              : `We’re working on round ${c.round + 1} from your notes. You’ll get an email.`}
          </p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              {c.status === "picked"
                ? "You picked one. We’re finalising your character."
                : "Pick the one you like, or ask for changes."}
            </p>
            <div className="pt-char-grid" data-testid="variations">
              {round.map((f, i) => (
                <figure key={f.id} className={f.id === c.picked_file_id ? "is-picked" : ""}>
                  {f.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.src} alt={`Variation ${i + 1}`} />
                  ) : (
                    <span className="pt-char-ph" aria-hidden="true" />
                  )}
                  <figcaption>
                    <span>Variation {i + 1}</span>
                    {c.status === "variations_ready" && (
                      <button
                        type="button"
                        className="btn btn-p btn-s pt-btn-sm"
                        disabled={pending}
                        onClick={() => run(() => pickCharacter(c.id, f.id, i + 1))}
                      >
                        Pick this one
                      </button>
                    )}
                    {f.id === c.picked_file_id && <Badge tone="gold">Your pick</Badge>}
                  </figcaption>
                </figure>
              ))}
            </div>
            {changes ? (
              <div className="pt-form">
                <Field name="about" label="Which one?" group>
                  <div className="pt-seg" role="group" aria-label="Which one?">
                    <button
                      type="button"
                      aria-pressed={changes.file === null}
                      onClick={() => setChanges({ ...changes, file: null })}
                    >
                      All
                    </button>
                    {round.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={changes.file === f.id}
                        onClick={() => setChanges({ ...changes, file: f.id })}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field name="note" label="What should change?" required>
                  <textarea
                    rows={3}
                    value={changes.note}
                    onChange={(e) => setChanges({ ...changes, note: e.target.value })}
                  />
                </Field>
                <div className="pt-btns">
                  <button
                    type="button"
                    className="btn btn-g btn-s"
                    onClick={() => setChanges(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-p btn-s"
                    disabled={pending || changes.note.trim().length < 3}
                    onClick={() =>
                      run(() =>
                        requestCharacterChanges(
                          c.id,
                          changes.file,
                          changes.file ? round.findIndex((f) => f.id === changes.file) + 1 : null,
                          changes.note,
                        ),
                      )
                    }
                  >
                    Send changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-btns">
                <button
                  type="button"
                  className="btn btn-g btn-s"
                  onClick={() => setChanges({ file: null, note: "" })}
                >
                  Request changes
                </button>
              </div>
            )}
          </>
        )}

        <details>
          <summary className="pt-meta">Your brief and the rounds so far</summary>
          <ul className="pt-char-log">
            {c.events.map((e) => (
              <li key={e.id}>
                <span className="pt-meta">{when(e.created_at)}</span>{" "}
                {e.kind === "brief"
                  ? "Brief sent"
                  : e.kind === "variations"
                    ? `Round ${e.round}: three variations ready`
                    : e.kind === "picked"
                      ? `Picked ${variationName(c, e.file_id) ?? "a variation"}`
                      : e.kind === "changes"
                        ? `Changes asked${e.file_id ? ` (${variationName(c, e.file_id)})` : ""}: “${e.note}”`
                        : e.kind === "approved"
                          ? `Approved as ${e.note}`
                          : `Renamed ${e.note}`}
              </li>
            ))}
          </ul>
          <p className="pt-small" style={{ whiteSpace: "pre-line" }}>
            {[
              `Brand: ${c.brief.brand}`,
              `Look: ${c.brief.look}`,
              c.brief.setting ? `Setting: ${c.brief.setting}` : "",
              c.brief.voice || c.brief.language
                ? `Voice: ${[c.brief.voice, c.brief.language].filter(Boolean).join(" · ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n")}
          </p>
        </details>
      </div>
    </Modal>
  );
}
