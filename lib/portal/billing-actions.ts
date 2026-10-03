"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { downloadUrl, presign, r2Ready } from "@/lib/r2";
import { createCheckout, stripeReady } from "@/lib/stripe";
import { portalAdminAs } from "./admin";
import { requireAccount } from "./auth";
import { money } from "./billing";
import { originFrom } from "./invite";
import { alertMilkywayyBilling } from "./notify";

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
 * "Pay now" (billing add-on): a Stripe Checkout page in the invoice's currency, for accounts that
 * pay online. The webhook marks the invoice Paid; nothing here does.
 */
export async function payInvoice(id: string): Promise<Result> {
  const { db, user } = await requireAccount("/portal/billing");
  const { data, error } = await db.rpc("my_invoice_for_payment", { p_invoice: id });
  if (error) return { ok: false, error: "That invoice isn’t yours to pay." };
  const inv = data as {
    id: string;
    number: string;
    amount: number;
    currency: string;
    unpaid: boolean;
    pay_online: boolean;
  };
  if (!inv.unpaid) return { ok: false, error: "That invoice is already paid." };
  if (!inv.pay_online) return { ok: false, error: "This invoice is paid by bank transfer." };
  if (!stripeReady()) return { ok: false, error: "Card payments aren’t set up yet. WhatsApp us." };
  const origin = originFrom(await headers());
  try {
    const s = await createCheckout({
      invoiceId: inv.id,
      number: inv.number,
      amount: inv.amount,
      currency: inv.currency,
      email: user.email,
      successUrl: `${origin}/portal/billing?paid=${encodeURIComponent(inv.number)}`,
      cancelUrl: `${origin}/portal/billing`,
    });
    await portalAdminAs(`client:${user.email ?? user.id}`)("portal_admin_set_stripe_session", {
      p_invoice: inv.id,
      p_session: s.id,
    });
    return { ok: true, url: s.url };
  } catch (e) {
    console.error("[billing] checkout:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn’t open the payment page. Try again in a minute." };
  }
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
  const { db, current } = await requireAccount("/portal/billing");
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
  revalidatePath("/portal/billing");
  return { ok: true, notice: "Thanks. We’ll confirm it and email you." };
}
