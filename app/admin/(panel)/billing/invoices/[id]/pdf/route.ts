import { NextResponse, type NextRequest } from "next/server";
import type { PdfInvoice } from "@/lib/invoice-pdf";
import { portalAdminAction } from "@/lib/portal/admin";
import { pdfResponse, renderInvoicePdf } from "@/lib/portal/invoice-pdf-data";

/** Any invoice's PDF for Milkywayy, drafts included (marked "Draft" until numbered). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  let rpc;
  try {
    rpc = await portalAdminAction();
  } catch {
    return new NextResponse("Sign in again", { status: 401 });
  }
  const d = await rpc<PdfInvoice | null>("portal_admin_invoice_pdf", { p_invoice: id });
  if (!d) return new NextResponse("Not found", { status: 404 });
  return pdfResponse(await renderInvoicePdf(d, req.nextUrl.origin), d.invoice.number);
}
