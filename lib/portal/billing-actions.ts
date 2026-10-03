"use server";

import { downloadUrl, r2Ready } from "@/lib/r2";
import { requireAccount } from "./auth";

/** A short-lived link to an invoice PDF, for an Owner/Admin who can read the invoice (RLS). */
export async function invoiceLink(
  id: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { db } = await requireAccount("/portal/billing");
  const { data } = await db.from("invoices").select("number, pdf_key").eq("id", id).maybeSingle();
  if (!data?.pdf_key) return { ok: false, error: "That invoice isn’t available." };
  if (!r2Ready())
    return { ok: false, error: "Downloads aren’t set up yet. WhatsApp us for the PDF." };
  return { ok: true, url: downloadUrl(data.pdf_key, `${data.number}.pdf`) };
}
