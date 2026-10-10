"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { discardDraft, type DraftKind } from "@/lib/portal/draft-actions";
import type { RequestConfig } from "@/lib/portal/requests";
import { BookingModal } from "./BookingModal";
import { draftDate } from "./forms";
import { ProjectRequestModal } from "./NewProjectForm";

type Kind = "booking" | "edit" | "avatar";
const TILES: { kind: Kind; label: string; hint: string; perm: keyof RequestConfig }[] = [
  {
    kind: "booking",
    label: "Book a shoot",
    hint: "Property, reels or a long-form walkthrough",
    perm: "shoots",
  },
  {
    kind: "edit",
    label: "Edit my files",
    hint: "Send footage or photos, we edit them",
    perm: "editing",
  },
  {
    kind: "avatar",
    label: "AI avatar video",
    hint: "A video with an AI presenter",
    perm: "avatars",
  },
];

/**
 * "Start something" (owner, 10 Oct 2026): the three tiles on Home, or one button on Shoots,
 * Editing and Avatars; each opens its modal on the current page. `?new=booking|edit|avatar` opens
 * one (the old /new pages redirect here); `&draft=1` restores the saved draft straight away.
 */
export function StartRequests({
  cfg,
  only,
  label,
  autoOpen = false,
  primary = true,
}: {
  cfg: RequestConfig;
  /** One button for this request instead of the tiles. */
  only?: Kind;
  label?: string;
  /** This launcher answers ?new= (one per page). */
  autoOpen?: boolean;
  primary?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [picked, setOpen] = useState<{ kind: Kind; resume: boolean } | null>(null);
  const [urlDone, setUrlDone] = useState(false);
  const allowed = TILES.filter((t) => cfg[t.perm] && (!only || t.kind === only));
  // ?new=… opens one on arrival (one launcher per page answers it); &draft=1 restores the draft.
  const fromUrl = params.get("new") as Kind | null;
  const open =
    picked ??
    (autoOpen && !urlDone && fromUrl && allowed.some((t) => t.kind === fromUrl)
      ? { kind: fromUrl, resume: params.get("draft") === "1" }
      : null);

  const close = () => {
    setOpen(null);
    setUrlDone(true);
    if (params.get("new")) router.replace(path, { scroll: false });
    router.refresh();
  };
  if (!allowed.length) return null;

  return (
    <>
      {only ? (
        <button
          type="button"
          className={`btn ${primary ? "btn-p" : "btn-g"} btn-s`}
          onClick={() => setOpen({ kind: only, resume: false })}
        >
          <Icon name="plus" size={16} /> {label ?? allowed[0].label}
        </button>
      ) : (
        <div className="pt-tiles">
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
      )}
      {open?.kind === "booking" && <BookingModal cfg={cfg} resume={open.resume} onClose={close} />}
      {(open?.kind === "edit" || open?.kind === "avatar") && (
        <ProjectRequestModal type={open.kind} cfg={cfg} resume={open.resume} onClose={close} />
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
  resumeHref,
}: {
  drafts: { kind: DraftKind; updated_at: string }[];
  resumeHref: (kind: DraftKind) => string;
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
              <a href={resumeHref(d.kind)} className="btn btn-g btn-s">
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
