import { NextResponse, type NextRequest } from "next/server";
import type { PdfInvoice } from "@/lib/invoice-pdf";
import { invoicePeriod } from "@/lib/portal/billing";
import { renderInvoicePdf, pdfResponse } from "@/lib/portal/invoice-pdf-data";
import { portalDb } from "@/lib/portal/supabase";

/**
 * A combined statement for several invoices (2 Nov 2026), for the client's Owner and Admins: one line per
 * invoice with its booking ref and due date, one total. Each invoice is read through my_invoice_pdf, so the
 * database checks every one is theirs.
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((i) => /^[0-9a-f-]{36}$/.test(i))
    .slice(0, 50);
  if (!ids.length) return new NextResponse("Not found", { status: 404 });
  const db = await portalDb();
  if (!db) return new NextResponse(null, { status: 404 });
  const parts: PdfInvoice[] = [];
  for (const id of ids) {
    const { data, error } = await db.rpc("my_invoice_pdf", { p_invoice: id });
    if (error || !data) return new NextResponse("Not found", { status: 404 });
    parts.push(data as PdfInvoice);
  }
  const first = parts[0];
  if (parts.some((p) => p.invoice.currency !== first.invoice.currency || p.invoice.account_id !== first.invoice.account_id))
    return new NextResponse("One company and currency at a time", { status: 400 });
  // Each invoice's booking refs: from the billed items (RLS shows the client their own).
  const { data: items } = await db
    .from("line_items")
    .select("billed_invoice_id, projects(ref)")
    .in("billed_invoice_id", ids);
  const refs = new Map<string, Set<string>>();
  for (const it of (items ?? []) as unknown as {
    billed_invoice_id: string;
    projects: { ref: string } | { ref: string }[] | null;
  }[]) {
    const r = Array.isArray(it.projects) ? it.projects[0]?.ref : it.projects?.ref;
    if (r) refs.set(it.billed_invoice_id, (refs.get(it.billed_invoice_id) ?? new Set()).add(r));
  }
  const day = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const lines = parts.map((p, n) => {
    const r = [...(refs.get(ids[n]) ?? [])];
    return {
      description: `${p.invoice.number ?? "Invoice"}${r.length ? ` · ${r.join(", ")}` : ""} · ${invoicePeriod(p.invoice)} · Due ${day(p.invoice.due_on)}`,
      qty: 1,
      unit_price: Number(p.invoice.amount),
      amount: Number(p.invoice.amount),
    };
  });
  const total = lines.reduce((t, l) => t + l.amount, 0);
  const due = parts.map((p) => p.invoice.due_on).sort();
  // The months these invoices are for: "October 2026", or "October 2026 – November 2026".
  const periods = parts
    .map((p) => p.invoice.period_start ?? p.invoice.issued_on)
    .sort()
    .map((d) => invoicePeriod({ period_start: d }));
  const month = [...new Set([periods[0], periods[periods.length - 1]])].join(" – ");
  // A statement is a new document: today's details, not what each invoice was issued with.
  const stmt: PdfInvoice = {
    ...first,
    ...first.current,
    invoice: {
      ...first.invoice,
      number: `Statement · ${month}`,
      issued_on: new Date().toISOString().slice(0, 10),
      due_on: due[due.length - 1],
      lines,
      subtotal: total,
      vat_rate: 0,
      vat: 0,
      amount: total,
      note: `Invoices on this statement: ${parts.map((p) => p.invoice.number).join(", ")}. Pay the total, or each invoice with its own number as the reference.`,
      period_start: null,
      period_end: null,
      status: "due",
    },
  };
  return pdfResponse(await renderInvoicePdf(stmt, req.nextUrl.origin, {
    title: "STATEMENT",
    reference: parts.map((p) => p.invoice.number).join(", "),
  }), `Statement ${month}`);
}
