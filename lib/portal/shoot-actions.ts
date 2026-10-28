"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPropertyPricing } from "@/lib/data";
import { subtotal } from "@/lib/booking";
import { portalAdminAction } from "./admin";
import {
  asProperty,
  bookedShot,
  cleanVideos,
  contentPrices,
  isContentHours,
  isLongLength,
  normalizeServices,
  servicesFromLog,
  shotDiff,
  CONTENT_LONG_MAX_V2,
  type BookingService,
  type DeliverableDraft,
  type LogLine,
  type ShotPlan,
} from "./booking";
import { originFrom } from "./invite";
import { runRefunds, sendNewInvoices, type RefundRow } from "./payment-server";

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
  if (lines.filter((l) => l.minimum).length > 1)
    return { ok: false, error: "One day minimum per shoot." };
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
          kind: l.minimum ? "day_minimum" : (l.kind ?? (l.key === "property" ? "shoot" : l.key)),
          description: l.description.trim(),
          qty: l.qty,
          basis: l.basis,
          // A property line logged earlier has no configuration any more: it keeps its price.
          unit_price: l.basis === "price_list" ? (listed ?? l.unit_price) : l.unit_price,
          list_price: l.basis === "override" ? (listed ?? l.list_price) : undefined,
          reason: l.basis === "override" ? l.reason?.trim() : undefined,
          // Flexible bookings: the database adds the top-up (none on a package).
          minimum: l.minimum || undefined,
        };
      }),
      p_deliverables: deliverables,
    });
    // On-site changes (reels added on the day): the booking's services follow the log.
    const p = await rpc<{ project?: { meta?: { booking?: { services?: BookingService[] } } } }>(
      "portal_admin_project",
      { p_id: project },
    ).catch(() => null);
    const before = p?.project?.meta?.booking?.services;
    if (before)
      await rpc("portal_admin_set_booking_services", {
        p_id: project,
        p_services: servicesFromLog(lines, before),
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

/* ---------- Confirm what we shot (owner, 28 Oct 2026) ---------- */

type ProjectMeta = { project?: { meta?: { booking?: { services?: BookingService[] } } } };
const OUTCOME: Record<string, string> = {
  invoice: "Adjustment invoice issued and emailed; downloads stay locked until it’s paid.",
  balance: "The balance on delivery follows the actual.",
  credit: "Account credit added: it comes off their next invoice.",
  usage: "Package usage updated.",
  month_end: "On their month-end invoice at the actual.",
  none: "Confirmed.",
};

/**
 * A v2 content shoot, booked vs actual. Prices are the booking's frozen prices (from the database,
 * never the browser); the database logs the actual as line items and issues the adjustment invoice or
 * the credit. The first deliverables list follows the actual when there's none yet.
 */
export async function confirmShot(
  project: string,
  actual: ShotPlan,
  note: string,
): Promise<ShootResult> {
  const hours = Number(actual.hours);
  if (!(hours >= 0.5 && hours <= 16) || Math.round(hours * 2) !== hours * 2)
    return { ok: false, error: "Shoot length in 30-minute steps." };
  const short = Math.round(Number(actual.short));
  if (!(short >= 0 && short <= 100)) return { ok: false, error: "Short-form edits: 0 to 100." };
  if (actual.longs.length > CONTENT_LONG_MAX_V2 || !actual.longs.every(isLongLength))
    return {
      ok: false,
      error: "Long-form lengths are 5 to 30 minutes (over 30: add it as Other).",
    };
  const extra =
    actual.extra && Number(actual.extra.amount) > 0
      ? {
          description: actual.extra.description.trim().slice(0, 120),
          amount: Math.round(Number(actual.extra.amount) * 100) / 100,
        }
      : null;
  if (extra && extra.description.length < 3) return { ok: false, error: "Say what “Other” is." };
  try {
    const rpc = await portalAdminAction();
    const d = await rpc<ProjectMeta>("portal_admin_project", { p_id: project });
    const services = normalizeServices(d?.project?.meta?.booking?.services ?? []);
    const vs = services.find((x) => x.service === "videos");
    const v = vs?.videos;
    if (!v || v.by !== "hours" || v.v !== 2)
      return { ok: false, error: "This booking isn’t a content shoot on the current prices." };
    const booked = bookedShot(v);
    let prices = v.priced;
    if (!prices) {
      // Booked without prices (nobody on the account could see them): the client's rates now.
      const w = await rpc<{ rates: { key: string; amount: number | null }[] }>(
        "portal_admin_deliverables",
        { p_project: project },
      );
      prices = contentPrices(
        Object.fromEntries(w.rates.map((r) => [r.key, r.amount])),
        isContentHours(v.hours) ? v.hours : 4,
      );
    }
    const act: ShotPlan = {
      hours,
      short,
      longs: actual.longs.map(Number),
      raw: !!actual.raw,
      extra,
    };
    let diff: ReturnType<typeof shotDiff>;
    try {
      diff = shotDiff(booked, act, prices);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "A price is missing." };
    }
    const after: BookingService[] = services.map((x) =>
      x === vs
        ? {
            ...x,
            videos: cleanVideos({
              ...v,
              short: act.short,
              longs: act.longs,
              raw: act.raw,
              priced: prices,
            }),
          }
        : x,
    );
    const out = await rpc<{
      outcome: string;
      invoice: { number: string | null } | null;
      credit: number;
    }>("portal_admin_confirm_shoot", {
      p_project: project,
      p: {
        booked,
        actual: act,
        booked_total: diff.bookedTotal,
        actual_total: diff.actualTotal,
        lines: diff.lines,
        items: diff.items,
        services: after,
        note: note.trim().slice(0, 500),
      },
    });
    // The first deliverables list, from what was shot.
    const w = await rpc<{ deliverables: unknown[] }>("portal_admin_deliverables", {
      p_project: project,
    }).catch(() => null);
    if (w && !w.deliverables.length) {
      const list: DeliverableDraft[] = [
        ...Array.from({ length: act.short }, (_, i) => ({
          label: `Reel ${i + 1}`,
          kind: "reel" as const,
        })),
        ...act.longs.map((m, i) => ({
          label: `Long-form ${i + 1} (${m} min)`,
          kind: "long_form" as const,
        })),
        ...(act.raw ? [{ label: "Raw files", kind: "other" as const }] : []),
      ];
      if (list.length)
        await rpc("portal_admin_save_deliverables", { p_project: project, p_list: list }).catch(
          (e) => console.error("[admin/shoot] deliverables:", e),
        );
    }
    if (out.invoice)
      await sendNewInvoices(rpc, project, originFrom(await headers()), "admin").catch((e) =>
        console.error("[admin/shoot] invoice email:", e),
      );
    revalidatePath(`/admin/projects/${project}`);
    revalidatePath("/portal", "layout");
    return { ok: true, notice: OUTCOME[out.outcome] ?? "Confirmed." };
  } catch (e) {
    return fail(e);
  }
}

/** "Refund to card instead": the after-shoot credit goes back to the card through Stripe. */
export async function refundCredit(project: string, credit: string): Promise<ShootResult> {
  try {
    const rpc = await portalAdminAction();
    const r = await rpc<RefundRow>("portal_admin_refund_credit", { p_credit: credit });
    const out = await runRefunds(rpc, [r]);
    revalidatePath(`/admin/projects/${project}`);
    revalidatePath("/admin/billing/refunds");
    return out.failed
      ? { ok: false, error: "Stripe refused the refund. It’s under Refunds to retry." }
      : { ok: true, notice: "Refund sent to Stripe." };
  } catch (e) {
    return fail(e);
  }
}
