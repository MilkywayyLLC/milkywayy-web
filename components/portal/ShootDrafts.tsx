"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { discardDraft as discardForm } from "@/lib/portal/draft-actions";
import { discardDraft as discardUnpaid } from "@/lib/portal/pay-actions";
import { ChoiceDialog, draftDate } from "./forms";

export type PaymentDraft = { id: string; title: string; ref: string; payHref: string };

/**
 * Shoots → Drafts (owner, 28 Oct 2026): the unfinished booking form and the bookings awaiting
 * payment in one list. Resume / Finish payment / Discard.
 */
export function ShootDrafts({
  form,
  unpaid,
}: {
  form: { updated_at: string } | null;
  unpaid: PaymentDraft[];
}) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [ask, setAsk] = useState<PaymentDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const showForm = form && !gone.includes("form");
  const list = unpaid.filter((d) => !gone.includes(d.id));
  if (!showForm && !list.length) return null;
  return (
    <section className="pt-drafts" aria-label="Drafts" data-testid="drafts">
      <span className="pt-eb">Drafts</span>
      <ul style={{ display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
        {showForm && (
          <li>
            <span>
              <b>Shoot booking</b>{" "}
              <span className="pt-meta">· not finished · saved {draftDate(form.updated_at)}</span>
            </span>
            <span className="pt-btns">
              <a href="/portal/book?draft=1" className="btn btn-g btn-s">
                Resume
              </a>
              <button
                type="button"
                className="btn btn-g btn-s"
                onClick={async () => {
                  setGone((g) => [...g, "form"]);
                  await discardForm("booking");
                  router.refresh();
                }}
              >
                Discard
              </button>
            </span>
          </li>
        )}
        {list.map((d) => (
          <li key={d.id}>
            <span>
              <b>{d.title}</b> <span className="pt-meta">· {d.ref} · payment pending</span>
            </span>
            <span className="pt-btns">
              <Link href={d.payHref} className="btn btn-p btn-s">
                Finish payment
              </Link>
              <button type="button" className="btn btn-g btn-s" onClick={() => setAsk(d)}>
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
      {err && <span className="pt-err">{err}</span>}
      {ask && (
        <ChoiceDialog
          title="Discard this booking?"
          body="The draft and its unpaid invoice are removed. Nothing has been charged."
          onDismiss={() => setAsk(null)}
          choices={[
            { label: "Keep it", onClick: () => setAsk(null) },
            {
              label: "Discard",
              danger: true,
              onClick: async () => {
                const d = ask;
                setAsk(null);
                const r = await discardUnpaid(d.id);
                if (!r.ok) return setErr(r.error ?? "Couldn’t discard it.");
                setGone((g) => [...g, d.id]);
                router.refresh();
              },
            },
          ]}
        />
      )}
    </section>
  );
}
