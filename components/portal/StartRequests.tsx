"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { discardDraft, type DraftKind } from "@/lib/portal/draft-actions";
import type { RequestConfig } from "@/lib/portal/requests";

import { draftDate } from "./forms";
import { ProjectRequestModal, type Presenter } from "./NewProjectForm";

type Kind = "booking" | "edit" | "avatar";
const ONLY_LABEL: Record<Kind, string> = {
  booking: "Book a shoot",
  edit: "Edit my files",
  avatar: "AI avatar video",
};
/** Where each launcher goes on the Book media page (owner, 18 Oct 2026). */
const BOOK = "/portal/book";
const HREF: Record<"all" | "booking" | "edit", string> = {
  all: BOOK,
  booking: `${BOOK}?only=shoot`,
  edit: `${BOOK}?kind=edit`,
};

/**
 * "Book media" (owner, 10 Oct 2026; a page since 18 Oct 2026): the button goes to /portal/book
 * ("What are you booking?"). With `only`, it offers that service (the New buttons on Shoots and
 * Editing); AI avatar videos keep their modal (the Avatars tab's New button). The website's links
 * (`?new=booking|edit|shoot|choose`, `&draft=1`) arrive at the launcher that answers them (the
 * header's) and go on to the page.
 */
export function StartRequests({
  cfg,
  only,
  label,
  autoOpen = false,
  primary = true,
  characters,
}: {
  cfg: RequestConfig;
  /** That service only: its choices on the page (or the avatar form). */
  only?: Kind;
  label?: string;
  /** This launcher answers ?new= (one per page). */
  autoOpen?: boolean;
  primary?: boolean;
  /** Avatar videos: the approved characters to choose the presenter(s) from. */
  characters?: Presenter[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<{ resume: boolean } | null>(null);
  const [run, setRun] = useState(0);
  const asked = params.get("new");
  const draft = params.get("draft") === "1";
  const avatarOnly = only === "avatar" && cfg.avatars;
  const books =
    only === "edit" ? cfg.editing : only === "booking" ? cfg.shoots : cfg.shoots || cfg.editing;
  // The website's links: on to the page (or the avatar form).
  useEffect(() => {
    if (!autoOpen || !asked) return;
    // Avatar videos are booked from the Avatars tab (as before).
    if (asked === "avatar") return;
    const to =
      asked === "shoot"
        ? `${BOOK}?kind=property`
        : asked === "edit"
          ? HREF.edit
          : asked === "booking"
            ? HREF.booking
            : BOOK;
    router.replace(draft ? `${to}${to.includes("?") ? "&" : "?"}draft=1` : to);
  }, [autoOpen, asked, draft, router]);
  const close = () => {
    setOpen(null);
    setRun((r) => r + 1);
    if (asked) router.replace(path, { scroll: false });
    router.refresh();
  };
  const text = label ?? (only ? ONLY_LABEL[only] : "Book media");
  const cls = `btn ${primary ? "btn-p" : "btn-g"} btn-s`;
  if (avatarOnly)
    return (
      <>
        <button type="button" className={cls} onClick={() => setOpen({ resume: false })}>
          <Icon name="plus" size={16} /> {text}
        </button>
        {open && (
          <ProjectRequestModal
            key={run}
            type="avatar"
            cfg={cfg}
            characters={characters}
            resume={open.resume}
            onClose={close}
          />
        )}
      </>
    );
  if (!books || only === "avatar") return null;
  return (
    <Link href={HREF[only === "booking" || only === "edit" ? only : "all"]} className={cls}>
      <Icon name="plus" size={16} /> {text}
    </Link>
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
