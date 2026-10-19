import { NextResponse, type NextRequest } from "next/server";
import type { PdfInvoice } from "@/lib/invoice-pdf";
import { pdfResponse, renderInvoicePdf } from "@/lib/portal/invoice-pdf-data";
import { portalDb } from "@/lib/portal/supabase";

/** A published invoice's PDF, for the client's Owner and Admins (the database checks both). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const db = await portalDb();
  if (!db) return new NextResponse(null, { status: 404 });
  const { data, error } = await db.rpc("my_invoice_pdf", { p_invoice: id });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  const d = data as PdfInvoice;
  return pdfResponse(await renderInvoicePdf(d, req.nextUrl.origin), d.invoice.number);
}
