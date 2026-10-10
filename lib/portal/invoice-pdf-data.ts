import { getSiteSettings } from "@/lib/data";
import { invoicePdf, type PdfInvoice } from "@/lib/invoice-pdf";

/**
 * The PDF for an invoice's data (from my_invoice_pdf or portal_admin_invoice_pdf). Company
 * details come from Billing settings; until they're filled in, the site's company name and
 * address stand in.
 */
export async function renderInvoicePdf(d: PdfInvoice, origin: string) {
  const site = await getSiteSettings().catch(() => null);
  const data: PdfInvoice = {
    ...d,
    company: {
      ...d.company,
      name: d.company.name || site?.company || "Milkywayy",
      address: d.company.address || (site ? `${site.licence}, ${site.addressLine}` : null),
      email: d.company.email || site?.email || null,
    },
  };
  return invoicePdf(data, { payUrl: `${origin}/portal/billing` });
}

export const pdfResponse = (bytes: Uint8Array, number: string | null) =>
  new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${(number ?? "invoice").replace(/[^\w.-]/g, "_")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
