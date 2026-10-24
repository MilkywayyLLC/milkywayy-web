"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { can } from "./access";
import { portalAdminAs } from "./admin";
import { requireAccount } from "./auth";
import { AREA_OF } from "./access";
import { originFrom } from "./invite";
import { notifyMilkywayy } from "./notify";
import { runRefunds, sendNewInvoices, type RefundRow } from "./payment-server";
import { quoteChange, type ChangeKind, type ChangeQuote, type PaidInvoice } from "./payments";

/**
 * Cancel or reschedule from the project page (owner, 24 Oct 2026). The client sees the fee and refund
 * first (quoteMyChange); confirming works it out again on the server from the database and applies it
 * (applyMyChange). Stripe refunds go out at once; bank/Wio refunds become "Refund due" for Milkywayy.
 */
export type ProjectPayment = {
  terms: "month_end" | "split" | "prepay" | null;
  on_package: boolean;
  value: number;
  half_days: number;
  start: string | null;
  status: string;
  type: "shoot" | "edit" | "avatar";
  locked: boolean;
  package_left: number | null;
  settings: {
    cancel_free_hours: number;
    late_fee_pct: number;
    late_fee_min: number;
    work_keep_pct: number;
  };
  invoices: {
    id: string;
    number: string | null;
    stage: string | null;
    amount: number;
    status: string;
    paid_via: PaidInvoice["paid_via"];
    refunded: number;
  }[];
};

type Result = { ok: boolean; error?: string; notice?: string; quote?: ChangeQuote };

/** The project as this person sees it (RLS), and its payment state (gated, server side). */
async function load(projectId: string) {
  const { db, user, current } = await requireAccount("/portal");
  const { data: p } = await db
    .from("projects")
    .select("id, ref, title, type, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!p) return { error: "You don’t have access to that project." } as const;
  if (!can(current, AREA_OF[p.type as keyof typeof AREA_OF]))
    return { error: "Your access doesn’t include this. Ask the account owner." } as const;
  const rpc = portalAdminAs(`client:${user.email ?? user.id}`);
  const pay = await rpc<ProjectPayment>("portal_admin_project_payment", { p_project: projectId });
  return { db, user, current, p, rpc, pay } as const;
}

const paidOf = (pay: ProjectPayment): PaidInvoice[] =>
  pay.invoices
    .filter((i) => i.stage && i.status === "paid")
    .map((i) => ({ id: i.id, amount: i.amount, refunded: i.refunded, paid_via: i.paid_via }));

function quoteFor(pay: ProjectPayment, kind: ChangeKind) {
  return quoteChange({
    kind,
    type: pay.type,
    status: pay.status,
    start: pay.start,
    value: Number(pay.value),
    paid: paidOf(pay),
    onPackage: pay.on_package && pay.package_left != null,
    halfDaysLeft: pay.package_left,
    settings: pay.settings,
  });
}

export async function quoteMyChange(projectId: string, kind: ChangeKind): Promise<Result> {
  const l = await load(projectId);
  if ("error" in l) return { ok: false, error: l.error };
  const q = quoteFor(l.pay, kind);
  // Edits and avatar videos already under way: Milkywayy decides what's refunded.
  if (l.pay.type !== "shoot" && q.allowed && (q.kept ?? 0) > 0)
    return {
      ok: true,
      quote: {
        ...q,
        allowed: false,
        blocked: "Work has started, so a partial refund applies. Message us and we’ll sort it out.",
      },
    };
  return { ok: true, quote: q };
}

export async function applyMyChange(
  projectId: string,
  kind: ChangeKind,
  re?: { date: string; startTime?: string; slot?: "morning" | "afternoon" | "full_day" },
): Promise<Result> {
  const l = await load(projectId);
  if ("error" in l) return { ok: false, error: l.error };
  const q = quoteFor(l.pay, kind);
  if (!q.allowed) return { ok: false, error: q.blocked };
  if (l.pay.type !== "shoot" && (q.kept ?? 0) > 0)
    return { ok: false, error: "Work has started. Message us and we’ll sort it out." };
  if (kind === "reschedule") {
    if (!re || !/^\d{4}-\d{2}-\d{2}$/.test(re.date))
      return { ok: false, error: "Choose the new date." };
    if (re.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(re.startTime))
      return { ok: false, error: "Choose a start time." };
  }
  const { data: profile } = await l.db
    .from("profiles")
    .select("full_name")
    .eq("user_id", l.user.id)
    .maybeSingle();
  let out: { refunds: RefundRow[]; charged: number; ref: string; title: string };
  try {
    out = await l.rpc("portal_admin_apply_change", {
      p_project: projectId,
      p: {
        kind,
        reason: "client",
        fee: q.fee,
        half_days: q.halfDays,
        refunds: q.refunds.map((r) => ({ invoice_id: r.invoice_id, amount: r.amount })),
        by: "client",
        by_name: profile?.full_name || l.user.email,
        ...(re ? { date: re.date, start_time: re.startTime ?? null, slot: re.slot ?? null } : {}),
      },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[payments] apply change:", m);
    return {
      ok: false,
      error: /can't be changed/.test(m)
        ? "This can’t be changed any more. Send us a message instead."
        : "Couldn’t save that. Try again.",
    };
  }
  const origin = originFrom(await headers());
  const refunds = await runRefunds(l.rpc, out.refunds);
  await sendNewInvoices(l.rpc, projectId, origin, `client:${l.user.email ?? l.user.id}`).catch(
    () => 0,
  );
  const bankDue = out.refunds.filter((r) => !r.stripe).reduce((n, r) => n + Number(r.amount), 0);
  await notifyMilkywayy(
    projectId,
    kind === "cancel" ? "booking_cancelled" : "booking_changed",
    `${kind === "cancel" ? "Cancelled" : "Rescheduled"}: ${l.current.account.name} · ${out.ref}`,
    [
      `${l.current.account.name} ${kind === "cancel" ? "cancelled" : "rescheduled"} ${out.ref} ${out.title}${re ? ` to ${re.date}${re.startTime ? ` ${re.startTime}` : ""}` : ""}.`,
      q.summary,
      ...(bankDue > 0
        ? [`Refund due by bank/Wio: AED ${bankDue}. It's in Billing → Refunds.`]
        : []),
      ...(refunds.failed
        ? [`${refunds.failed} Stripe refund(s) failed: check Billing → Refunds.`]
        : []),
      ...(kind === "reschedule" && l.pay.status === "confirmed"
        ? ["It's back to Requested: confirm the new date in the admin."]
        : []),
    ],
    `${origin}/admin/projects/${projectId}`,
  ).catch((e) => console.error("[payments] change alert:", e));
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    notice:
      kind === "cancel"
        ? q.refund > 0
          ? `Cancelled. ${q.refunds.some((r) => r.stripe) ? "The refund is on its way to your card." : "We’ll send your refund and let you know."}`
          : "Cancelled."
        : "Rescheduled. We’ll confirm the new time.",
  };
}
