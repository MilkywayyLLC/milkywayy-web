"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { deleteShare, setShareStatus } from "@/lib/portal/listing-actions";
import { Icon } from "./Icon";
import { useToast } from "./ui";

/** The page's full link, on whatever host the portal is open on. */
const noop = () => () => {};
function useLink(kind: "l" | "c", slug: string) {
  const origin = useSyncExternalStore(
    noop,
    () => location.origin,
    () => "https://milkywayy.com",
  );
  return `${origin}/${kind}/${slug}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** After saving: the link, copy, share on WhatsApp, open. */
export function ShareDone({
  kind,
  slug,
  title,
  edited,
}: {
  kind: "l" | "c";
  slug: string;
  title: string;
  edited: boolean;
}) {
  const link = useLink(kind, slug);
  const [toast, say] = useToast();
  return (
    <section className="pt-card" aria-label="Link ready" data-testid="share-done">
      <h2 className="pt-h2">{edited ? "Saved" : "Link ready"}</h2>
      {kind === "l" && (
        <p className="pt-muted" style={{ margin: 0 }}>
          The details are saved to this property, so the next share is one tap.
        </p>
      )}
      <div className="pt-card" style={{ background: "var(--bg)" }}>
        <span className="pt-eb">Your link</span>
        <b className="pt-link-box">{link}</b>
      </div>
      <div className="pt-btns">
        <button
          type="button"
          className="btn btn-p btn-s"
          onClick={async () => say((await copy(link)) ? "Link copied" : link)}
        >
          <Icon name="link" size={16} /> Copy link
        </button>
        <a
          className="btn btn-g btn-s"
          href={`https://wa.me/?text=${encodeURIComponent(`${title}: ${link}`)}`}
          target="_blank"
          rel="noopener"
        >
          Share on WhatsApp
        </a>
        <a className="btn btn-g btn-s" href={`/${kind}/${slug}`} target="_blank" rel="noopener">
          Open page
        </a>
        <Link className="btn btn-g btn-s" href="/portal/listings">
          All listings
        </Link>
      </div>
      {toast}
    </section>
  );
}

/** Copy link (primary) and Open; Edit, Pause/Resume and Delete under "⋯". */
export function ShareControls({
  kind,
  id,
  slug,
  title,
  status,
  canEdit,
  disabled,
  editHref,
}: {
  kind: "l" | "c";
  id: string;
  slug: string;
  title: string;
  status: "live" | "paused";
  canEdit: boolean;
  disabled: boolean;
  editHref: string;
}) {
  const link = useLink(kind, slug);
  const [toast, say] = useToast();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // The ⋯ menu closes on Escape and on a click outside it.
  useEffect(() => {
    if (!menu) return;
    const off = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !wrap.current?.contains(e.target as Node)
      ) {
        setMenu(false);
        setSure(false);
      }
    };
    addEventListener("pointerdown", off);
    addEventListener("keydown", off);
    return () => {
      removeEventListener("pointerdown", off);
      removeEventListener("keydown", off);
    };
  }, [menu]);
  const run = (p: () => Promise<{ ok: boolean; error?: string; notice?: string }>) =>
    start(async () => {
      const r = await p();
      say(r.ok ? (r.notice ?? "Done.") : (r.error ?? "Couldn’t do that."));
    });
  return (
    <div className="pt-share-actions">
      <button
        type="button"
        className="btn btn-p btn-s"
        aria-label={`Copy link: ${title}`}
        onClick={async () => say((await copy(link)) ? "Link copied" : link)}
      >
        <Icon name="link" size={16} /> Copy link
      </button>
      <a
        href={`/${kind}/${slug}`}
        target="_blank"
        rel="noopener"
        className="btn btn-g btn-s"
        aria-label={`Open: ${title}`}
      >
        Open
      </a>
      {canEdit && (
        <div className="pt-pop-wrap" ref={wrap}>
          <button
            type="button"
            className="pt-icon-btn"
            aria-label={`More actions: ${title}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name="more" size={18} />
          </button>
          <div
            className="pt-pop pt-pop-right pt-pop-up"
            role="menu"
            data-open={menu || undefined}
            inert={!menu}
          >
            <a role="menuitem" href={editHref} aria-label={`Edit: ${title}`}>
              Edit
            </a>
            {!disabled && (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => {
                  setMenu(false);
                  run(() => setShareStatus(kind, id, status === "live" ? "paused" : "live"));
                }}
              >
                {status === "live" ? "Pause" : "Resume"}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="pt-danger"
              disabled={pending}
              onClick={() => (sure ? run(() => deleteShare(kind, id)) : setSure(true))}
            >
              {sure ? "Really delete?" : "Delete"}
            </button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}
