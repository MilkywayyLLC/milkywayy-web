"use server";

import { revalidatePath } from "next/cache";
import { getPropertyPricing } from "@/lib/data";
import { subtotal } from "@/lib/booking";
import { portalAdminAction } from "./admin";
import { asProperty, type DeliverableDraft, type LogLine } from "./booking";

/**
 * Admin: "Log what we shot" and the deliverables list (owner, 10 Oct 2026). Logging creates the
 * line items behind the client's activity, statements and invoice drafts, at prices frozen now:
 * the client's own rate on the shoot date (the database looks it up), the property price list
 * (worked out here from the configuration, never taken from the browser), or a manual price with
 * a reason. No email.
 */
export type ShootResult = { ok: boolean; error?: string; notice?: string };

const fail = (e: unknown): ShootResult => {
  const err = e as { message?: string; code?: string };
  console.error("[admin/shoot]", err?.message);
  if (err?.code === "22023" && err.message)
    return { ok: false, error: err.message.charAt(0).toUpperCase() + err.message.slice(1) + "." };
  return { ok: false, error: "Couldn’t save. Try again." };
};

export async function logShoot(
  project: string,
  lines: LogLine[],
  deliverables: DeliverableDraft[],
): Promise<ShootResult> {
  if (!lines.length) return { ok: false, error: "Add at least one item." };
  for (const l of lines) {
    if (!l.description.trim()) return { ok: false, error: "Every item needs a description." };
    if (!(l.qty > 0)) return { ok: false, error: "Quantities must be above 0." };
    if (l.basis === "override" && (l.reason ?? "").trim().length < 3)
      return { ok: false, error: "Say why the price was changed." };
    if (l.basis === "override" && !(Number(l.unit_price) >= 0))
      return { ok: false, error: "Enter the price." };
  }
  try {
    const pricing = await getPropertyPricing();
    const rpc = await portalAdminAction();
    const out = await rpc<{ logged: number }>("portal_admin_log_shoot", {
      p_project: project,
      p_lines: lines.map((l) => {
        const listed =
          l.key === "property" && l.property
            ? subtotal(asProperty(l.property, pricing), pricing)
            : undefined;
        return {
          key: l.key,
          kind: l.kind ?? (l.key === "property" ? "shoot" : l.key),
          description: l.description.trim(),
          qty: l.qty,
          basis: l.basis,
          // A property line logged earlier has no configuration any more: it keeps its price.
          unit_price: l.basis === "price_list" ? (listed ?? l.unit_price) : l.unit_price,
          list_price: l.basis === "override" ? (listed ?? l.list_price) : undefined,
          reason: l.basis === "override" ? l.reason?.trim() : undefined,
        };
      }),
      p_deliverables: deliverables,
    });
    revalidatePath(`/admin/projects/${project}`);
    return { ok: true, notice: `Logged ${out.logged} item${out.logged === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDeliverables(
  project: string,
  list: { id?: string; label: string; kind: DeliverableDraft["kind"]; link_url?: string | null }[],
): Promise<ShootResult> {
  for (const d of list) {
    if (!d.label.trim()) return { ok: false, error: "Every deliverable needs a name." };
    if (d.link_url && !/^https:\/\/\S+$/.test(d.link_url.trim()))
      return { ok: false, error: `${d.label}: the link must start with https://` };
  }
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_save_deliverables", { p_project: project, p_list: list });
    revalidatePath(`/admin/projects/${project}`);
    return { ok: true, notice: "Deliverables saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setDeliverable(
  project: string,
  id: string,
  status: string | null,
  addRound = false,
): Promise<ShootResult> {
  try {
    const rpc = await portalAdminAction();
    await rpc("portal_admin_set_deliverable", {
      p_id: id,
      p_status: status,
      p_add_round: addRound,
    });
    revalidatePath(`/admin/projects/${project}`);
    return { ok: true, notice: addRound ? "Round added." : "Status saved." };
  } catch (e) {
    return fail(e);
  }
}
