"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/portal/Icon";
import { invoiceLink } from "@/lib/portal/billing-actions";

/** Download an invoice PDF (a short-lived signed link). */
export function InvoiceDownload({ id, number }: { id: string; number: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        type="button"
        className="btn btn-g btn-s pt-btn-sm"
        aria-label={`Download invoice ${number}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await invoiceLink(id);
            if (r.ok && r.url) window.location.assign(r.url);
            else setErr(r.error);
          })
        }
      >
        {pending ? "…" : <Icon name="download" size={16} title={`Download ${number}`} />}
      </button>
      {err && (
        <span className="pt-error" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
