"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteItem, saveItem } from "@/lib/admin/actions";
import { setPath, type Option } from "@/lib/admin/fields";
import { sectionByKey, type Row } from "@/lib/admin/sections";
import { Confirm } from "./Confirm";
import { FormFields } from "./FormFields";

const previewHref = (path: string) => `/admin/preview?path=${encodeURIComponent(path)}`;

/**
 * Edit (or add) one item. A draft stays off the site until published; a published item's edits
 * go live on save. Preview shows the page with drafts included.
 */
export function ItemEditor({
  sectionKey,
  id,
  initial,
  isOwner,
  portfolio,
  justCreated,
}: {
  sectionKey: string;
  id: string | null;
  initial: Row;
  isOwner: boolean;
  portfolio?: Option[];
  justCreated?: boolean;
}) {
  const section = sectionByKey(sectionKey)!;
  const router = useRouter();
  const [values, setValues] = useState<Row>(initial);
  const [saved, setSaved] = useState<Row>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | undefined>(
    justCreated ? { ok: true, text: "Saved." } : undefined,
  );
  const [pending, start] = useTransition();
  const [askDelete, setAskDelete] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const live = !!saved.published;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save(publish?: boolean, then?: (id: string) => void) {
    start(async () => {
      const r = await saveItem(sectionKey, id, values, publish);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setStatus({ ok: false, text: r.error ?? "Check the highlighted fields." });
        const first = Object.keys(r.errors ?? {})[0];
        if (first)
          document
            .querySelector<HTMLElement>(`[data-field="${first}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const next = { ...values, published: publish ?? values.published };
      setErrors({});
      setValues(next);
      setSaved(next);
      setStatus({
        ok: true,
        text:
          publish === true
            ? "Published. Live on the site in a few seconds."
            : publish === false
              ? "Unpublished. It's hidden from the site."
              : next.published
                ? "Saved. Live on the site in a few seconds."
                : "Saved as a draft. Not on the site yet.",
      });
      then?.(r.id!);
      if (!id) router.replace(`/admin/${sectionKey}/${r.id}?created=1`);
    });
  }

  function preview() {
    // Open the tab now (pop-up blockers allow it during the tap), point it at the page after saving.
    const tab = window.open("about:blank", "_blank");
    const go = (row: Row) => tab && (tab.location.href = previewHref(section.preview(row)));
    if (!dirty && id) return go(values);
    save(undefined, () => go(values));
  }

  function remove() {
    start(async () => {
      const r = await deleteItem(sectionKey, id!);
      if (!r.ok) {
        setAskDelete(false);
        setStatus({ ok: false, text: r.error ?? "Couldn't delete it." });
        return;
      }
      router.replace(`/admin/${sectionKey}?deleted=1`);
    });
  }

  const title = section.title_of(values) || `New ${section.singular}`;
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href={`/admin/${sectionKey}`} prefetch={false}>
            ← {section.title}
          </Link>
          <h1 className="ad-h1">{id ? title : `New ${section.singular}`}</h1>
        </div>
        <span className={`ad-pill ${live ? "live" : "draft"}`}>
          {live ? "Live" : id ? "Draft" : "Not saved"}
        </span>
      </div>

      <form
        className="ad-card ad-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FormFields
          fields={section.fields}
          values={values}
          errors={errors}
          isOwner={isOwner}
          portfolio={portfolio}
          onChange={(name, v) => setValues((cur) => setPath(cur, name, v))}
        />
        <div className="ad-savebar">
          <p
            className={`ad-status${status ? (status.ok ? "ok" : "error") : ""}`}
            role="status"
            aria-live="polite"
          >
            {pending ? "Saving…" : dirty ? "Unsaved changes." : status?.text}
          </p>
          {live ? (
            <>
              <button type="submit" className="ad-btn" disabled={pending}>
                Save
              </button>
              <button
                type="button"
                className="ad-btn ghost"
                disabled={pending}
                onClick={() => save(false)}
              >
                Unpublish
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ad-btn"
                disabled={pending}
                onClick={() => save(true)}
              >
                {dirty || !id ? "Save & publish" : "Publish"}
              </button>
              <button type="submit" className="ad-btn ghost" disabled={pending}>
                Save draft
              </button>
            </>
          )}
          <button type="button" className="ad-btn quiet" disabled={pending} onClick={preview}>
            Preview
          </button>
        </div>
      </form>

      {id && (
        <div className="ad-card">
          <h2 className="ad-h2">Delete</h2>
          <p className="ad-small ad-muted">
            Removes it from the site and the admin. This can’t be undone; unpublish instead to keep
            it.
          </p>
          <div>
            <button type="button" className="ad-btn danger" onClick={() => setAskDelete(true)}>
              Delete {section.singular}
            </button>
          </div>
        </div>
      )}
      <Confirm
        open={askDelete}
        title={`Delete “${title}”?`}
        confirmLabel="Delete"
        danger
        busy={pending}
        onConfirm={remove}
        onCancel={() => setAskDelete(false)}
      >
        <p>It disappears from the site straight away. This can’t be undone.</p>
      </Confirm>
    </div>
  );
}
