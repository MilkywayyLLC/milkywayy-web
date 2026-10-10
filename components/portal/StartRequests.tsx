"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { discardDraft, type DraftKind } from "@/lib/portal/draft-actions";
import type { RequestConfig } from "@/lib/portal/requests";
import { BookingModal } from "./BookingModal";
import { draftDate, Modal } from "./forms";
import { ProjectRequestModal } from "./NewProjectForm";

type Kind = "booking" | "edit" | "avatar";
const TILES: { kind: Kind; label: string; hint: string; perm: keyof RequestConfig }[] = [
  {
    kind: "booking",
    label: "Shoot",
    hint: "Property, reels or a long-form walkthrough",
    perm: "shoots",
  },
  {
    kind: "edit",
    label: "Editing",
    hint: "Send us your photos or footage",
    perm: "editing",
  },
  {
    kind: "avatar",
    label: "AI avatar video",
    hint: "A video with an AI presenter",
    perm: "avatars",
  },
];
const ONLY_LABEL: Record<Kind, string> = {
  booking: "Book a shoot",
  edit: "Edit my files",
  avatar: "AI avatar video",
};

/**
 * "Book media" (owner, 10 Oct 2026): one button opens "What do you need?" (Shoot, Editing, AI
 * avatar video); each continues into its own flow, with Back returning to the choice. With
 * `only`, the button opens that flow directly (the New buttons on Shoots, Editing and Avatars).
 * `?new=booking|edit|avatar` opens a flow on arrival (one launcher per page answers it, the
 * header's); `&draft=1` restores the saved draft straight away.
 */
export function StartRequests({
  cfg,
  only,
  label,
  autoOpen = false,
  primary = true,
}: {
  cfg: RequestConfig;
  /** Open this flow directly instead of the "What do you need?" choice. */
  only?: Kind;
  label?: string;
  /** This launcher answers ?new= (one per page). */
  autoOpen?: boolean;
  primary?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [picked, setOpen] = useState<{ kind: Kind | "choose"; resume: boolean } | null>(null);
  const [urlDone, setUrlDone] = useState(false);
  const allowed = TILES.filter((t) => cfg[t.perm] && (!only || t.kind === only));
  const fromUrl = params.get("new") as Kind | null;
  const open =
    picked ??
    (autoOpen && !urlDone && fromUrl && allowed.some((t) => t.kind === fromUrl)
      ? { kind: fromUrl as Kind | "choose", resume: params.get("draft") === "1" }
      : null);
  // Back to the choice: only when this launcher offers the choice.
  const back = only ? undefined : () => setOpen({ kind: "choose", resume: false });

  const close = () => {
    setOpen(null);
    setUrlDone(true);
    if (params.get("new")) router.replace(path, { scroll: false });
    router.refresh();
  };
  if (!allowed.length) return null;

  return (
    <>
      <button
        type="button"
        className={`btn ${primary ? "btn-p" : "btn-g"} btn-s`}
        onClick={() => setOpen({ kind: only ?? "choose", resume: false })}
      >
        <Icon name="plus" size={16} /> {label ?? (only ? ONLY_LABEL[only] : "Book media")}
      </button>
      {open?.kind === "choose" && (
        <Modal title="Book media" onClose={close} testId="book-media">
          <div className="pt-form">
            <b style={{ fontSize: 18 }}>What do you need?</b>
            <div className="pt-tiles pt-tiles-lg" role="group" aria-label="What do you need?">
              {allowed.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  className="pt-tile"
                  onClick={() => setOpen({ kind: t.kind, resume: false })}
                >
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {open?.kind === "booking" && (
        <BookingModal cfg={cfg} resume={open.resume} onClose={close} onBack={back} />
      )}
      {(open?.kind === "edit" || open?.kind === "avatar") && (
        <ProjectRequestModal
          type={open.kind}
          cfg={cfg}
          resume={open.resume}
          onClose={close}
          onBack={back}
        />
      )}
    </>
  );
}

const DRAFT_LABEL: Record<DraftKind, string> = {
  booking: "Shoot booking",
  edit: "Editing request",
  avatar: "AI avatar video",
  listing: "Listing",
};

/** The list pages' small "Drafts" row: resume or delete. */
export function DraftsRow({
  drafts,
  hrefs,
}: {
  drafts: { kind: DraftKind; updated_at: string }[];
  /** Where "Resume" goes, per kind (plain strings: this is a client component). */
  hrefs: Partial<Record<DraftKind, string>>;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const list = drafts.filter((d) => !gone.includes(d.kind));
  if (!list.length) return null;
  return (
    <section className="pt-drafts" aria-label="Drafts" data-testid="drafts">
      <span className="pt-eb">Drafts</span>
      <ul style={{ display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
        {list.map((d) => (
          <li key={d.kind}>
            <span>
              <b>{DRAFT_LABEL[d.kind]}</b>{" "}
              <span className="pt-meta">· saved {draftDate(d.updated_at)}</span>
            </span>
            <span className="pt-btns">
              <a href={hrefs[d.kind] ?? "/portal"} className="btn btn-g btn-s">
                Resume
              </a>
              <button
                type="button"
                className="btn btn-g btn-s"
                onClick={async () => {
                  setGone((g) => [...g, d.kind]);
                  await discardDraft(d.kind);
                  router.refresh();
                }}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
