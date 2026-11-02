import sharp from "sharp";
import { getSiteSettings } from "@/lib/data";
import { INVOICE_LOGO_PNG } from "@/lib/invoice-logo";
import { invoicePdf, type PdfImage, type PdfInvoice } from "@/lib/invoice-pdf";
import { getObject } from "@/lib/r2";

/** Raw pixels for the PDF writer; an image that won't decode just leaves its spot empty. */
async function pixels(png: Buffer): Promise<PdfImage | null> {
  try {
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const rgb = Buffer.alloc(n * 3);
    const alpha = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      data.copy(rgb, i * 3, i * 4, i * 4 + 3);
      alpha[i] = data[i * 4 + 3];
    }
    return { w: info.width, h: info.height, rgb, alpha };
  } catch (e) {
    console.error("[invoice-pdf] image", e);
    return null;
  }
}

async function signature(key: string | null | undefined) {
  if (!key) return null;
  const res = await getObject(key).catch(() => null);
  return res ? pixels(Buffer.from(await res.arrayBuffer())) : null;
}

/**
 * The PDF for an invoice's data (from my_invoice_pdf or portal_admin_invoice_pdf). Company
 * details come from Billing settings; until they're filled in, the site's company name and
 * address stand in.
 */
export async function renderInvoicePdf(
  d: PdfInvoice,
  origin: string,
  opts: { title?: string; reference?: string } = {},
) {
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
  const [logo, sign] = await Promise.all([
    pixels(Buffer.from(INVOICE_LOGO_PNG, "base64")),
    signature(data.company.signature_key),
  ]);
  return invoicePdf(data, { payUrl: `${origin}/portal/billing`, ...opts, logo, signature: sign });
}

export const pdfResponse = (bytes: Uint8Array, number: string | null) =>
  new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${(number ?? "invoice").replace(/[^\w.-]/g, "_")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
