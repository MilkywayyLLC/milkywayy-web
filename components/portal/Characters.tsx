"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/portal/Icon";
import { Badge } from "@/components/portal/ui";
import {
  characterFileLink,
  createCharacter,
  editCharacter,
  finishCharacterUpload,
  pickCharacter,
  removeCharacterReference,
  requestCharacterRevision,
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
import { Dropzone, usePicked, type DropItem, type Picked } from "./Dropzone";
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

const IMG_TYPES = "image/png,image/jpeg,image/webp,image/heic";
const MAX_MB = 25;
type Prog = Record<string, { progress?: number; error?: string }>;

/** Uploads chosen images to a character (references, or a revision's images), with progress. */
async function uploadImages(
  id: string,
  list: Picked[],
  setProg: (f: (p: Prog) => Prog) => void,
  revision = false,
) {
  let ok = 0;
  for (const p of list) {
    const f = p.file;
    const done = await uploadFile(
      f,
      `char-${id}`,
      {
        start: () => startCharacterUpload(id, f.name, f.size),
        resume: (key, uploadId) => resumeCharacterUpload(id, key, uploadId, f.size),
        finish: (x) =>
          finishCharacterUpload(id, { ...x, name: f.name, size: f.size, type: f.type }, revision),
      },
      (r) =>
        setProg((g) => ({
          ...g,
          [p.id]: {
            progress:
              r.done != null ? Math.min(0.99, r.done / Math.max(1, f.size)) : g[p.id]?.progress,
            error:
              r.state && !/^(Uploading|Resuming|Waiting|Done)/.test(r.state) ? r.state : undefined,
          },
        })),
    );
    setProg((g) => ({
      ...g,
      [p.id]: done ? { progress: 1 } : { error: g[p.id]?.error ?? "Didn’t upload" },
    }));
    if (done) ok++;
  }
  return ok;
}
const pickedItems = (list: Picked[], prog: Prog): DropItem[] =>
  list.map((p) => ({
    id: p.id,
    name: p.file.name,
    size: p.file.size,
    src: p.src,
    progress: prog[p.id]?.progress,
    error: prog[p.id]?.error,
  }));

const briefOf = (c?: Character): Brief => ({
  brand: c?.brief.brand ?? "",
  purpose: c?.brief.purpose ?? "",
  purposeOther: c?.brief.purpose_other ?? "",
  look: c?.brief.look ?? "",
  setting: c?.brief.setting ?? "",
  voice: c?.brief.voice ?? "",
  language: c?.brief.language ?? "English",
  links: (c?.brief.links ?? []).join("\n"),
  similar: c?.brief.similar_note ?? "",
});

/** "Create your AI avatar", or "Edit request" on a brief we haven't started (prefilled). */
export function CreateCharacterModal({
  first,
  edit,
  onClose,
}: {
  first?: boolean;
  edit?: Character;
  onClose: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Brief>(briefOf(edit));
  const picked = usePicked();
  const [prog, setProg] = useState<Prog>({});
  const [saved, setSaved] = useState((edit?.files ?? []).filter((f) => f.kind === "reference"));
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
  }));
  const title = edit ? "Edit request" : "Create your AI avatar";

  async function submit() {
    if (!form.check()) return;
    setSaving(true);
    const brief = {
      brand: b.brand,
      purpose: b.purpose as Purpose,
      purpose_other: b.purposeOther,
      look: b.look,
      setting: b.setting,
      voice: b.voice,
      language: b.language,
      links,
      similar_note: b.similar,
    };
    const r = edit ? await editCharacter(edit.id, brief) : await createCharacter(brief);
    if (!r.ok || !r.id) {
      setSaving(false);
      return form.fail(r.error ?? "Couldn’t send it. Try again.");
    }
    const ok = await uploadImages(r.id, picked.list, setProg);
    setDone({ failed: ok < picked.list.length });
    setSaving(false);
    router.refresh();
  }
  async function removeSaved(id: string) {
    const r = await removeCharacterReference(id);
    if (!r.ok) return form.fail(r.error ?? "Couldn’t remove it.");
    setSaved((l) => l.filter((f) => f.id !== id));
  }

  if (done)
    return (
      <Modal title={title} onClose={onClose} testId="character-modal">
        <div className="pt-form" role="status">
          <span className="pt-eb">{edit ? "Brief edited" : "Brief received"}</span>
          <b className="pt-h2">{edit ? "Saved" : "We’re on it"}</b>
          <p style={{ margin: 0 }}>
            {edit
              ? "We’ll work from the updated brief. You’ll get an email when the variations are ready."
              : "We’ll design three variations for you to choose from. You’ll get an email when they’re ready."}
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
      title={title}
      onClose={onClose}
      testId="character-modal"
      footer={
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving
            ? picked.list.length
              ? "Uploading…"
              : "Sending…"
            : edit
              ? "Save changes"
              : "Send brief"}
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
        <Field name="files" label="Reference images" group hint="Optional.">
          <Dropzone
            items={[
              ...saved.map((f) => ({
                id: f.id,
                name: f.label,
                src: f.src ?? undefined,
                saved: true,
              })),
              ...pickedItems(picked.list, prog),
            ]}
            onAdd={(f) => picked.add(f)}
            onRemove={(id) =>
              saved.some((f) => f.id === id) ? void removeSaved(id) : picked.remove(id)
            }
            accept={IMG_TYPES}
            types="JPG, PNG, WebP or HEIC"
            maxMb={MAX_MB}
            max={12}
            disabled={saving}
            testId="ref-dropzone"
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

/** Edit while we haven't started; a revision once variations are out (or it's approved). */
const canEdit = (c: Character) => c.status === "brief_received" && c.round === 0;
const canRevise = (c: Character) =>
  c.status === "variations_ready" || c.status === "picked" || c.status === "approved";

/** "Your characters": a card per character (approved image, name, status, Edit or Revise). */
export function CharactersRow({ characters }: { characters: Character[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [act, setAct] = useState<{ id: string; kind: "edit" | "revise" } | null>(null);
  const open = characters.find((c) => c.id === openId) ?? null;
  const acting = characters.find((c) => c.id === act?.id) ?? null;
  const [creating, setCreating] = useState(false);
  // V2 (owner, 25 Oct 2026): a Create card first, then the characters; two placeholder
  // variations hold the row's shape until there are characters to show.
  const fill = Math.max(0, 2 - characters.length);
  return (
    <section className="pt-char-sec" aria-label="Your characters">
      <b className="pt-h2">Your characters</b>
      <div className="pt-char-row" data-testid="characters">
        <button
          type="button"
          className="pt-card pt-char-card pt-char-new"
          onClick={() => setCreating(true)}
          data-testid="character-create"
        >
          <span className="pt-char-ph" aria-hidden="true">
            <Icon name="plus" size={28} />
          </span>
          <b className="pt-title">Create a character</b>
          <span className="pt-meta">We design three variations, you choose.</span>
        </button>
        {characters.map((c) => {
          const img = coverOf(c);
          return (
            <div key={c.id} className="pt-card pt-card-link pt-char-card pt-stretch">
              {img?.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.src} alt="" />
              ) : (
                <span className="pt-char-ph" aria-hidden="true">
                  <Icon name="ai" size={28} />
                </span>
              )}
              <button
                type="button"
                className="pt-title pt-stretch-link"
                onClick={() => setOpenId(c.id)}
              >
                {characterTitle(c)}
              </button>
              <Badge tone={toneOf(c.status)}>{CHARACTER_STATUS[c.status]}</Badge>
              {(canEdit(c) || canRevise(c)) && (
                <button
                  type="button"
                  className="lnk pt-small pt-stretch-act"
                  onClick={() => setAct({ id: c.id, kind: canEdit(c) ? "edit" : "revise" })}
                >
                  {canEdit(c) ? "Edit request" : "Request a revision"}
                </button>
              )}
            </div>
          );
        })}
        {Array.from({ length: fill }, (_, n) => (
          <div key={n} className="pt-card pt-char-card pt-char-ghost" aria-hidden="true">
            <span className="pt-char-ph">
              <Icon name="person" size={28} />
            </span>
            <b className="pt-title">Variation {n + 1}</b>
            <span className="pt-meta">Appears here once designed</span>
          </div>
        ))}
      </div>
      {creating && (
        <CreateCharacterModal first={!characters.length} onClose={() => setCreating(false)} />
      )}
      {open && (
        <CharacterModal
          c={open}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null);
            setAct({ id: open.id, kind: "edit" });
          }}
        />
      )}
      {acting && act?.kind === "edit" && (
        <CreateCharacterModal edit={acting} onClose={() => setAct(null)} />
      )}
      {acting && act?.kind === "revise" && (
        <Modal title="Request a revision" onClose={() => setAct(null)} testId="character-revision">
          <RevisionForm c={acting} onDone={() => setAct(null)} onCancel={() => setAct(null)} />
        </Modal>
      )}
    </section>
  );
}

/** A note, which variation (when there's a round out), optional images: a new round. */
function RevisionForm({
  c,
  onDone,
  onCancel,
}: {
  c: Character;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const round = c.files.filter((f) => f.kind === "variation" && f.round === c.round);
  const [file, setFile] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const picked = usePicked();
  const [prog, setProg] = useState<Prog>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    const r = await requestCharacterRevision(
      c.id,
      file,
      file ? round.findIndex((f) => f.id === file) + 1 : null,
      note,
      picked.list.length,
    );
    if (!r.ok) {
      setBusy(false);
      return setError(r.error ?? "Something went wrong. Try again.");
    }
    const ok = await uploadImages(c.id, picked.list, setProg, true);
    setBusy(false);
    router.refresh();
    if (ok < picked.list.length)
      return setError("Sent, but some images didn’t upload. Send them on WhatsApp.");
    onDone();
  }
  return (
    <div className="pt-form" data-testid="revision-form">
      {error && (
        <p className="pt-form-banner" role="alert">
          {error}
        </p>
      )}
      {c.status === "approved" && (
        <p className="pt-meta" style={{ margin: 0 }}>
          Your character stays approved and usable in videos while we look at it.
        </p>
      )}
      {round.length > 0 && c.status !== "approved" && (
        <Field name="about" label="Which one?" group>
          <div className="pt-seg" role="group" aria-label="Which one?">
            <button type="button" aria-pressed={file === null} onClick={() => setFile(null)}>
              All
            </button>
            {round.map((f, i) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={file === f.id}
                onClick={() => setFile(f.id)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field name="note" label="What should change?" required>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field name="images" label="Images" group hint="Optional: show us what you mean.">
        <Dropzone
          items={pickedItems(picked.list, prog)}
          onAdd={(f) => picked.add(f)}
          onRemove={picked.remove}
          accept={IMG_TYPES}
          types="JPG, PNG, WebP or HEIC"
          maxMb={MAX_MB}
          max={6}
          disabled={busy}
        />
      </Field>
      <div className="pt-btns">
        <button type="button" className="btn btn-g btn-s" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-p btn-s"
          disabled={busy || note.trim().length < 3}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send revision request"}
        </button>
      </div>
    </div>
  );
}

const eventText = (c: Character, e: Character["events"][number]) =>
  e.kind === "brief"
    ? "Brief sent"
    : e.kind === "edited"
      ? "Brief edited"
      : e.kind === "variations"
        ? `Round ${e.round}: three variations ready`
        : e.kind === "picked"
          ? `Picked ${variationName(c, e.file_id) ?? "a variation"}`
          : e.kind === "changes" || e.kind === "revision"
            ? `Revision requested${e.file_id ? ` (${variationName(c, e.file_id)})` : ""}: “${e.note}”`
            : e.kind === "approved"
              ? `Approved as ${e.note}`
              : `Renamed ${e.note}`;

function CharacterModal({
  c,
  onClose,
  onEdit,
}: {
  c: Character;
  onClose: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const round = c.files.filter((f) => f.kind === "variation" && f.round === c.round);
  const approved = c.files.find((f) => f.id === c.approved_file_id);
  const refs = c.files.filter((f) => f.kind === "reference");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong. Try again.");
      router.refresh();
    });
  const download = (id: string) =>
    start(async () => {
      const r = await characterFileLink(id);
      if (!r.ok || !r.url) return setError(r.error ?? "Couldn’t get the file.");
      window.location.assign(r.url);
    });
  const reviseBtn = canRevise(c) && !revising && (
    <div className="pt-btns">
      <button type="button" className="btn btn-g btn-s" onClick={() => setRevising(true)}>
        Request a revision
      </button>
    </div>
  );

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
            <b className="pt-h2">{characterTitle(c)}</b>
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
          <>
            <p style={{ margin: 0 }}>
              {c.status === "brief_received"
                ? "We’re designing three variations. You’ll get an email when they’re ready."
                : `We’re working on round ${c.round + 1} from your notes. You’ll get an email.`}
            </p>
            {canEdit(c) && (
              <div className="pt-btns">
                <button type="button" className="btn btn-g btn-s" onClick={onEdit}>
                  Edit request
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              {c.status === "picked"
                ? "You picked one. We’re finalising your character."
                : "Pick the one you like, or ask for a revision."}
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
          </>
        )}
        {revising ? (
          <RevisionForm
            c={c}
            onDone={() => setRevising(false)}
            onCancel={() => setRevising(false)}
          />
        ) : (
          reviseBtn
        )}

        <details>
          <summary className="pt-meta">Your brief and the rounds so far</summary>
          <ul className="pt-char-log">
            {c.events.map((e) => (
              <li key={e.id}>
                <span className="pt-meta">{when(e.created_at)}</span> {eventText(c, e)}
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
          {refs.some((f) => f.src) && (
            <div className="pt-dz-grid" aria-label="Reference images">
              {refs
                .filter((f) => f.src)
                .map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.id} src={f.src!} alt={f.label} className="pt-ref-thumb" />
                ))}
            </div>
          )}
        </details>
      </div>
    </Modal>
  );
}
