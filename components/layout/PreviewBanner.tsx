import { draftMode } from "next/headers";
import Link from "next/link";

/** Shown on every public page while an admin is previewing drafts (Draft Mode). No JS. */
export async function PreviewBanner() {
  let on = false;
  try {
    on = (await draftMode()).isEnabled;
  } catch {}
  if (!on) return null;
  return (
    <div className="preview-bar" role="status">
      <span>
        <i className="rec-dot" aria-hidden="true" /> Preview · drafts and unpublished items showing
      </span>
      <span className="preview-bar-actions">
        <Link href="/admin" prefetch={false}>
          Admin
        </Link>
        {/* A GET form, not a link, so it's never prefetched (which would end the preview). */}
        <form action="/admin/preview/exit" method="get">
          <button type="submit">Exit preview</button>
        </form>
      </span>
    </div>
  );
}
