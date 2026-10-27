"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { downloadUrl, presign, r2Ready } from "@/lib/r2";
import { stripeReady } from "@/lib/stripe";
import { portalAdminAs } from "./admin";
import { requireAccount } from "./auth";
import { money } from "./billing";
import { originFrom } from "./invite";
import { alertMilkywayyBilling } from "./notify";
import { emailBookingRequest, payPath } from "./payment-server";

type Result = { ok: boolean; url?: string; key?: string; error?: string; notice?: string };

/** A short-lived link to an invoice PDF, for an Owner/Admin who can read the invoice (RLS). */
export async function invoiceLink(id: string): Promise<Result> {
  const { db } = await requireAccount("/portal/billing");
  const { data } = await db.from("invoices").select("number, pdf_key").eq("id", id).maybeSingle();
  if (!data?.pdf_key) return { ok: false, error: "That invoice isn’t available." };
  if (!r2Ready())
    return { ok: false, error: "Downloads aren’t set up yet. WhatsApp us for the PDF." };
  return { ok: true, url: downloadUrl(data.pdf_key, `${data.number}.pdf`) };
}

/**
 * "Pay now" (billing add-on; phase 1, 27 Oct 2026): Stripe is the main way to pay, on every open
 * invoice. Opens our own checkout page; the session is made there and the webhook marks it Paid.
 */
export async function payInvoice(id: string): Promise<Result> {
  const { user } = await requireAccount("/portal/billing");
  if (!stripeReady()) return { ok: false, error: "Card payments aren’t set up yet. WhatsApp us." };
  const inv = await portalAdminAs(`client:${user.email ?? user.id}`)<{ unpaid: boolean } | null>(
    "portal_admin_pay_view",
    { p_invoice: id, p_user: user.id },
  );
  if (!inv) return { ok: false, error: "That invoice isn’t yours to pay." };
  if (!inv.unpaid) return { ok: false, error: "That invoice is already paid." };
  return { ok: true, url: payPath(id) };
}

const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_PROOF = 10 * 1024 * 1024;

async function unpaidInvoice(id: string) {
  const { db } = await requireAccount("/portal/billing");
  const { data } = await db
    .from("invoices")
    .select("id, account_id, number, status, payment_state")
    .eq("id", id)
    .maybeSingle();
  return data as {
    id: string;
    account_id: string;
    number: string;
    status: string;
    payment_state: string | null;
  } | null;
}

/** "I've paid": where to upload the transfer proof (straight to R2, one request, 10 MB). */
export async function startProofUpload(id: string, name: string, size: number, type: string) {
  const inv = await unpaidInvoice(id);
  if (!inv) return { ok: false, error: "That invoice isn’t yours." } as Result;
  if (inv.status === "paid") return { ok: false, error: "That invoice is already paid." } as Result;
  if (!PROOF_TYPES.includes(type))
    return { ok: false, error: "Upload a PDF or a photo (JPG, PNG, WebP, HEIC)." } as Result;
  if (size <= 0 || size > MAX_PROOF) return { ok: false, error: "Keep it under 10 MB." } as Result;
  if (!r2Ready()) return { ok: false, error: "Uploads aren’t set up yet. WhatsApp us." } as Result;
  const safe = name.replace(/[^\w.-]+/g, "-").slice(-80) || "proof";
  const key = `payments/${inv.account_id}/${inv.id}/${randomBytes(4).toString("hex")}-${safe}`;
  return { ok: true, key, url: presign("PUT", key, 600) } as Result;
}

/** The proof is uploaded: mark the invoice "Payment submitted" and tell Milkywayy. */
export async function submitProof(
  id: string,
  file: { key: string; name: string; size: number; type: string },
  note: string,
): Promise<Result> {
  const { db, user, current } = await requireAccount("/portal/billing");
  const { data, error } = await db.rpc("submit_payment_proof", {
    p_invoice: id,
    p_key: file.key,
    p_filename: file.name.slice(0, 160),
    p_bytes: file.size,
    p_content_type: file.type,
    p_note: note.slice(0, 300) || null,
  });
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error: /already submitted/.test(m)
        ? "You’ve already sent a proof for this invoice. We’ll confirm it soon."
        : /already paid/.test(m)
          ? "That invoice is already paid."
          : "Couldn’t send it. Try again.",
    };
  }
  const d = data as { number: string; amount: number; currency: string; account: string };
  const origin = originFrom(await headers());
  await alertMilkywayyBilling(
    current.account.id,
    "payment_submitted",
    `Payment submitted: ${d.account} · ${d.number}`,
    [
      `${d.account} says they've paid invoice ${d.number} (${money(d.currency, d.amount)}) by bank transfer.`,
      ...(note ? [`Their note: ${note}`] : []),
      "Check the proof, then confirm it or reject it with a reason.",
    ],
    `${origin}/admin/billing?status=submitted`,
  );
  // A booking held for payment went through when the receipt was recorded: tell Milkywayy once.
  const { data: inv } = await db.from("invoices").select("project_id").eq("id", id).maybeSingle();
  if (inv?.project_id)
    await emailBookingRequest(
      portalAdminAs(`client:${user.email ?? user.id}`),
      inv.project_id,
      origin,
      [
        `Paid by bank transfer: ${d.number}, ${money(d.currency, d.amount)}. Receipt uploaded, payment to verify.`,
      ],
    );
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Thanks. We’ll confirm it and email you." };
}
