"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAccount } from "./auth";
import { originFrom } from "./invite";
import { notifyMilkywayy } from "./notify";

/**
 * A client on one deliverable (owner, 10 Oct 2026): ask for a revision (rounds counted per
 * deliverable, 2 each; Milkywayy is emailed) or approve it.
 */
export type DeliverableResult = { ok: boolean; error?: string; notice?: string };

const why = (m: string) =>
  /no revision rounds left/.test(m)
    ? "Both revision rounds for this item are used. Send us a message and we’ll sort it out."
    : /revisions are for delivered/.test(m)
      ? "You can ask for a revision once it’s delivered."
      : /say what should change/.test(m)
        ? "Tell us what should change (a timecode or photo number helps)."
        : /not your project/.test(m)
          ? "You don’t have access to that."
          : /nothing to approve/.test(m)
            ? "That isn’t possible right now. Refresh the page."
            : "Something went wrong. Try again.";

export async function requestDeliverableRevision(
  id: string,
  note: string,
): Promise<DeliverableResult> {
  const { db, current } = await requireAccount("/portal/shoots");
  const { data, error } = await db.rpc("request_deliverable_revision", {
    p_deliverable: id,
    p_note: note,
  });
  if (error) return { ok: false, error: why(error.message) };
  const r = data as {
    round: number;
    of: number;
    label: string;
    ref: string;
    title: string;
    project: string;
  };
  await notifyMilkywayy(
    r.project,
    "deliverable_revision",
    `Revision asked: ${r.label} · ${r.ref}`,
    [
      `${current.account.name} asked for a revision of ${r.label} on ${r.ref} ${r.title}.`,
      `Round ${r.round} of ${r.of}: “${note.trim()}”`,
    ],
    `${originFrom(await headers())}/admin/projects/${r.project}`,
  ).catch((e) => console.error("[portal] revision alert:", e));
  revalidatePath(`/portal/shoots/${r.ref}`);
  return { ok: true, notice: `Sent. Round ${r.round} of ${r.of} for ${r.label}.` };
}

export async function approveDeliverable(id: string): Promise<DeliverableResult> {
  const { db } = await requireAccount("/portal/shoots");
  const { error } = await db.rpc("approve_deliverable", { p_deliverable: id });
  if (error) return { ok: false, error: why(error.message) };
  return { ok: true, notice: "Approved. Thank you." };
}
