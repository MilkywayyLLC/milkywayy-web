"use client";

import { useEffect, useState, useTransition } from "react";
import { discardDocDraft, publishDoc, saveDocDraft, type Result } from "@/lib/admin/actions";
import { docByKey } from "@/lib/admin/docs";
import { setPath, type Change } from "@/lib/admin/fields";
import { Confirm } from "./Confirm";
import { FormFields } from "./FormFields";

type Draft = { value: unknown; updated_by: string; updated_at: string } | null;
const previewHref = (path: string) => `/admin/preview?path=${encodeURIComponent(path)}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

/**
 * One document with a draft: edit → Save draft → Preview (the site with the draft) → Publish,
 * which lists every change old → new and asks to confirm before anything goes live.
 */
export function DocEditor({
  docKey,
  live,
  draft,
  isOwner,
}: {
  docKey: string;
  live: Record<string, unknown>;
  draft: Draft;
  isOwner: boolean;
}) {
  const doc = docByKey(docKey)!;
  const [values, setValues] = useState<Record<string, unknown>>(
    (draft?.value as Record<string, unknown>) ?? live,
  );
  const [saved, setSaved] = useState(values);
  const [hasDraft, setHasDraft] = useState(!!draft);
  const [draftInfo, setDraftInfo] = useState(
    draft ? `Draft saved by ${draft.updated_by}, ${when(draft.updated_at)}.` : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const [review, setReview] = useState<Change[] | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const failed = (r: Result) => {
    if (r.ok) return false;
    setErrors(r.errors ?? {});
    setStatus({ ok: false, text: r.error ?? "Check the highlighted fields." });
    const first = Object.keys(r.errors ?? {})[0];
    if (first)
      document
        .querySelector(`[data-field="${first}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  };

  function saveDraft(then?: () => void) {
    start(async () => {
      const r = await saveDocDraft(docKey, values);
      if (failed(r)) return;
      setErrors({});
      setSaved(values);
      setHasDraft(true);
      setDraftInfo(
        `Draft saved just now. ${r.changes?.length ?? 0} change${r.changes?.length === 1 ? "" : "s"} from the live version.`,
      );
      setStatus({ ok: true, text: "Draft saved. Not live yet: preview it, then publish." });
      then?.();
    });
  }

  function preview() {
    const tab = window.open("about:blank", "_blank");
    saveDraft(() => tab && (tab.location.href = previewHref(doc.preview)));
  }

  function askPublish() {
    start(async () => {
      const r = await publishDoc(docKey, values, false);
      if (failed(r)) return;
      if (!r.changes?.length)
        return setStatus({ ok: false, text: "Nothing has changed from the live version." });
      setReview(r.changes);
    });
  }

  function publish() {
    start(async () => {
      const r = await publishDoc(docKey, values, true);
      setReview(null);
      if (failed(r)) return;
      setSaved(values);
      setHasDraft(false);
      setDraftInfo("");
      setStatus({
        ok: true,
        text: `Published ${r.changes?.length} change${r.changes?.length === 1 ? "" : "s"}. Live on the site in a few seconds.`,
      });
    });
  }

  function discard() {
    start(async () => {
      const r = await discardDocDraft(docKey);
      if (failed(r)) return;
      setValues(live);
      setSaved(live);
      setHasDraft(false);
      setDraftInfo("");
      setErrors({});
      setStatus({ ok: true, text: "Draft discarded. Showing the live version." });
    });
  }

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <span className="ad-eb">
            {doc.isPrice
              ? "Pricing"
              : doc.key === "avatar_hero"
                ? "Content · AI avatars"
                : "Settings"}
          </span>
          <h1 className="ad-h1">{doc.title}</h1>
        </div>
        <span className={`ad-pill ${hasDraft ? "draft" : "live"}`}>
          {hasDraft ? "Draft" : "Live"}
        </span>
      </div>
      <p className="ad-note">
        {draftInfo || "You're editing the live version. Changes stay a draft until you publish."}
      </p>
      <form
        className="ad-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          saveDraft();
        }}
      >
        {doc.groups.map((g) => (
          <section className="ad-card ad-form" key={g.title} aria-label={g.title}>
            <h2 className="ad-h2">{g.title}</h2>
            <FormFields
              fields={g.fields}
              values={values}
              errors={errors}
              isOwner={isOwner}
              onChange={(name, v) => setValues((cur) => setPath(cur, name, v))}
            />
          </section>
        ))}
        <div className="ad-savebar">
          <p
            className={`ad-status${status ? (status.ok ? "ok" : "error") : ""}`}
            role="status"
            aria-live="polite"
          >
            {pending ? "Working…" : dirty ? "Unsaved changes." : status?.text}
          </p>
          <button type="button" className="ad-btn" disabled={pending} onClick={askPublish}>
            Publish…
          </button>
          <button type="submit" className="ad-btn ghost" disabled={pending}>
            Save draft
          </button>
          <button type="button" className="ad-btn quiet" disabled={pending} onClick={preview}>
            Preview
          </button>
          {hasDraft && (
            <button type="button" className="ad-btn quiet" disabled={pending} onClick={discard}>
              Discard draft
            </button>
          )}
        </div>
      </form>
      <Confirm
        open={!!review}
        title={doc.isPrice ? "Confirm price changes" : `Publish ${doc.title.toLowerCase()}?`}
        changes={review ?? []}
        confirmLabel={doc.isPrice ? "Yes, change the prices" : "Publish"}
        busy={pending}
        onConfirm={publish}
        onCancel={() => setReview(null)}
      >
        <p>
          These go live on the site as soon as you confirm
          {doc.isPrice ? " and new requests use the new prices" : ""}.
        </p>
      </Confirm>
    </div>
  );
}
