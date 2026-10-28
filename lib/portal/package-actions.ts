"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAccount } from "./auth";
import { dateLabel, money } from "./billing";
import { originFrom } from "./invite";
import { alertMilkywayyBilling, notifyBilling, type Recipient } from "./notify";
import { NEED_LABEL, type PackageNeed, type PackageOption } from "./package-builder";

/**
 * Billing → "Build a monthly package" (owner, 28 Oct 2026): the client asks, Milkywayy builds and
 * publishes an offer, the client accepts. The database checks access and does the money.
 */
type Result = { ok: boolean; error?: string; status?: string };

const fail = (m: string): Result => {
  console.error("[portal] package:", m);
  if (/already have a monthly plan/.test(m))
    return { ok: false, error: "You already have a monthly plan." };
  if (/package is ready/.test(m))
    return { ok: false, error: "Your package is ready — see it below." };
  if (/choose what you need/.test(m)) return { ok: false, error: "Choose what you need." };
  if (/monthly volume/.test(m))
    return { ok: false, error: "Tell us roughly how much you need a month." };
  if (/how you.d like to pay/.test(m)) return { ok: false, error: "Choose how you’d like to pay." };
  if (/offer has expired/.test(m))
    return { ok: false, error: "This offer has expired. WhatsApp us and we’ll refresh it." };
  if (/bookings this month/.test(m))
    return {
      ok: false,
      error:
        "You have bookings this month, so the package needs to start next month. We’ll update it.",
    };
  if (/isn.t open|isn.t on this offer/.test(m))
    return { ok: false, error: "That option isn’t available on this offer." };
  if (/owners and admins|not your offer/.test(m))
    return { ok: false, error: "Only owners and admins can do this." };
  return { ok: false, error: "Couldn’t send it. Try again." };
};

export type PackageRequestInput = {
  needs: PackageNeed[];
  short: number;
  long: number;
  longMinutes: number | null;
  property: number;
  paymentPref: "upfront" | "usage";
  sixMonths: boolean;
  scripting: boolean;
  notes?: string;
};

export async function requestPackage(i: PackageRequestInput): Promise<Result> {
  const { db, current } = await requireAccount("/portal/billing");
  const a = current.account;
  const { error } = await db.rpc("request_package", {
    p_account: a.id,
    p: {
      needs: i.needs,
      short: i.short,
      long: i.long,
      long_minutes: i.longMinutes,
      property: i.property,
      payment_pref: i.paymentPref,
      six_months: i.sixMonths,
      scripting: i.scripting,
      notes: i.notes ?? null,
    },
  });
  if (error) return fail(error.message);
  const origin = originFrom(await headers());
  await alertMilkywayyBilling(
    a.id,
    "package_request",
    `Package request: ${a.name}`,
    [
      `${a.name} asked for a monthly package.`,
      `Needs: ${i.needs.map((n) => NEED_LABEL[n]).join(", ")}`,
      `Per month: ${i.short} short-form, ${i.long} long-form${
        i.long && i.longMinutes ? ` (~${i.longMinutes} min)` : ""
      }, ${i.property} property shoots`,
      `Pays: ${i.paymentPref === "upfront" ? "upfront" : "for what they use"}${
        i.sixMonths ? " · interested in 6 months" : ""
      }`,
      ...(i.scripting ? ["Wants help with scripting or strategy."] : []),
      ...(i.notes?.trim() ? [`Notes: “${i.notes.trim().slice(0, 500)}”`] : []),
    ],
    `${origin}/admin/billing/package-requests`,
  );
  revalidatePath("/portal/billing");
  return { ok: true };
}

export async function acceptPackageOffer(id: string, option: PackageOption): Promise<Result> {
  const { db, current } = await requireAccount("/portal/billing");
  const a = current.account;
  const { data, error } = await db.rpc("accept_package_offer", { p_request: id, p_option: option });
  if (error) return fail(error.message);
  const out = data as {
    status: string;
    number?: string;
    recipients?: Recipient[];
    invoice_id?: string;
  };
  const origin = originFrom(await headers());
  if (out.status === "accepted" && out.invoice_id) {
    // The first invoice is published: email it like any other.
    const { data: inv } = await db
      .from("invoices")
      .select("number, amount, currency, due_on")
      .eq("id", out.invoice_id)
      .maybeSingle();
    if (inv && out.recipients?.length)
      await notifyBilling(
        a.id,
        "invoice_issued",
        {
          number: inv.number ?? "",
          amount: money(inv.currency, Number(inv.amount)),
          due: dateLabel(inv.due_on),
        },
        out.recipients,
        `${origin}/portal/billing`,
        "client",
      );
  }
  await alertMilkywayyBilling(
    a.id,
    "package_accepted",
    out.status === "six_requested"
      ? `6-month package to confirm: ${a.name}`
      : `Package accepted: ${a.name}`,
    out.status === "six_requested"
      ? [
          `${a.name} chose the 6-month plan.`,
          "Confirm it in the admin to set the plan and send the first instalment (bank transfer).",
        ]
      : [
          `${a.name} accepted their monthly package (${
            option === "usage" ? "pay for what you use from month 2" : "upfront monthly"
          }).`,
          `The plan is set and the first invoice${out.number ? ` (${out.number})` : ""} is published.`,
        ],
    `${origin}/admin/billing/package-requests`,
  );
  revalidatePath("/portal", "layout");
  return { ok: true, status: out.status };
}
