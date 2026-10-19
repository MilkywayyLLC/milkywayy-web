/**
 * The invoice PDF (owner, 10 Oct 2026), generated from an approved invoice: company details, the
 * invoice number, client details, line items, totals, VAT when registered, bank details and the
 * online payment link where it applies. A small, dependency-free PDF writer: A4, the standard
 * Helvetica fonts (no embedding), WinAnsi text, pages added as the lines need them.
 */
export type PdfInvoice = {
  invoice: {
    number: string | null;
    issued_on: string;
    due_on: string;
    currency: string;
    lines: { description: string; qty: number; unit_price: number; amount: number }[];
    subtotal: number | null;
    vat_rate: number;
    vat: number;
    amount: number;
    note: string | null;
    period_start: string | null;
    period_end: string | null;
    status: string;
  };
  account: { name: string; trn: string | null; billing_address: string | null };
  company: {
    name: string | null;
    address: string | null;
    trn: string | null;
    email: string | null;
    vat_registered: boolean;
  };
  bank: {
    account_name: string | null;
    bank: string | null;
    iban: string | null;
    swift: string | null;
  };
  pays_online: boolean;
};

// Advance widths (1/1000 em) for code points 32–126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// The few non-ASCII characters we use, as WinAnsi bytes with their widths [regular, bold].
const EXTRA: Record<string, [number, number, number]> = {
  "·": [0xb7, 278, 278],
  "×": [0xd7, 584, 584],
  "–": [0x96, 556, 556],
  "—": [0x97, 1000, 1000],
  "’": [0x92, 222, 278],
  "‘": [0x91, 222, 278],
  "“": [0x93, 333, 500],
  "”": [0x94, 333, 500],
  é: [0xe9, 556, 556],
  "€": [0x80, 556, 556],
};

type Font = "R" | "B";
const width = (s: string, size: number, f: Font = "R") => {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) w += (f === "B" ? BOLD : HELV)[c - 32];
    else w += EXTRA[ch]?.[f === "B" ? 2 : 1] ?? 556;
  }
  return (w * size) / 1000;
};

/** A PDF literal string in WinAnsi; anything we can't encode becomes "?". */
function lit(s: string) {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (c >= 32 && c <= 126) out += ch;
    else if (EXTRA[ch]) out += `\\${EXTRA[ch][0].toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return `(${out})`;
}

function wrap(s: string, max: number, size: number, f: Font = "R") {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(next, size, f) <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

const money = (cur: string, n: number) =>
  `${cur} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) =>
  d
    ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

const W = 595.28;
const H = 841.89;
const M = 48;

class Page {
  ops: string[] = [];
  text(x: number, y: number, s: string, size = 10, f: Font = "R", gray = 0) {
    this.ops.push(
      `BT /${f === "B" ? "F2" : "F1"} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td ${lit(s)} Tj ET`,
    );
  }
  right(xRight: number, y: number, s: string, size = 10, f: Font = "R", gray = 0) {
    this.text(xRight - width(s, size, f), y, s, size, f, gray);
  }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8, w = 0.6) {
    this.ops.push(`${gray} G ${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  rect(x: number, y: number, w: number, h: number, gray: number) {
    this.ops.push(`${gray} g ${x} ${y} ${w} ${h} re f`);
  }
}

export function invoicePdf(d: PdfInvoice, opts: { payUrl?: string } = {}): Uint8Array {
  const i = d.invoice;
  const cur = i.currency;
  const pages: Page[] = [];
  let p = new Page();
  pages.push(p);
  let y = H - M;

  // Header: who we are (left), the invoice (right).
  const company = d.company.name || "Milkywayy";
  p.text(M, y - 6, company, 18, "B");
  let ly = y - 26;
  for (const l of (d.company.address ?? "")
    .split(/\n|,\s*(?=\S)/)
    .filter(Boolean)
    .slice(0, 4)) {
    p.text(M, ly, l.trim(), 9, "R", 0.35);
    ly -= 12;
  }
  if (d.company.email) {
    p.text(M, ly, d.company.email, 9, "R", 0.35);
    ly -= 12;
  }
  if (d.company.vat_registered && d.company.trn) {
    p.text(M, ly, `TRN ${d.company.trn}`, 9, "R", 0.35);
    ly -= 12;
  }
  const title = d.company.vat_registered ? "TAX INVOICE" : "INVOICE";
  p.right(W - M, y - 6, title, 16, "B");
  p.right(W - M, y - 26, i.number ?? "Draft", 11, "B");
  p.right(W - M, y - 42, `Issued ${day(i.issued_on)}`, 9, "R", 0.35);
  p.right(W - M, y - 54, `Due ${day(i.due_on)}`, 9, "R", 0.35);
  y = Math.min(ly, y - 66) - 18;

  // Bill to.
  p.text(M, y, "BILL TO", 8, "B", 0.45);
  y -= 14;
  p.text(M, y, d.account.name, 11, "B");
  y -= 13;
  for (const l of (d.account.billing_address ?? "").split(/\n/).filter(Boolean).slice(0, 3)) {
    p.text(M, y, l.trim(), 9, "R", 0.35);
    y -= 12;
  }
  if (d.account.trn) {
    p.text(M, y, `TRN ${d.account.trn}`, 9, "R", 0.35);
    y -= 12;
  }
  if (i.period_start) {
    p.right(
      W - M,
      y + 12,
      `Period ${day(i.period_start)}${i.period_end ? ` – ${day(i.period_end)}` : ""}`,
      9,
      "R",
      0.35,
    );
  }
  y -= 16;

  // Lines.
  const cQty = W - M - 230;
  const cUnit = W - M - 110;
  const cAmt = W - M;
  const descW = cQty - M - 40;
  const header = () => {
    p.rect(M, y - 6, W - 2 * M, 20, 0.95);
    p.text(M + 6, y, "DESCRIPTION", 8, "B", 0.4);
    p.right(cQty, y, "QTY", 8, "B", 0.4);
    p.right(cUnit, y, "UNIT PRICE", 8, "B", 0.4);
    p.right(cAmt - 6, y, "AMOUNT", 8, "B", 0.4);
    y -= 24;
  };
  header();
  for (const l of i.lines) {
    const rows = wrap(l.description, descW, 10);
    const need = rows.length * 13 + 10;
    if (y - need < M + 160) {
      p = new Page();
      pages.push(p);
      y = H - M;
      header();
    }
    rows.forEach((r, n) => p.text(M + 6, y - n * 13, r, 10));
    p.right(cQty, y, String(Number(l.qty)), 10);
    p.right(cUnit, y, money(cur, Number(l.unit_price)), 10);
    p.right(cAmt - 6, y, money(cur, Number(l.amount)), 10);
    y -= rows.length * 13 + 6;
    p.line(M, y + 2, W - M, y + 2, 0.88);
    y -= 8;
  }

  // Totals.
  y -= 6;
  const tLabel = cUnit;
  const sub = Number(i.subtotal ?? i.amount);
  if (Number(i.vat) > 0) {
    p.right(tLabel, y, "Subtotal", 10, "R", 0.35);
    p.right(cAmt - 6, y, money(cur, sub), 10);
    y -= 15;
    p.right(tLabel, y, `VAT ${Number(i.vat_rate)}%`, 10, "R", 0.35);
    p.right(cAmt - 6, y, money(cur, Number(i.vat)), 10);
    y -= 15;
  }
  p.line(tLabel - 80, y + 10, W - M, y + 10, 0.2, 0.8);
  y -= 6;
  p.right(tLabel, y, "Total", 12, "B");
  p.right(cAmt - 6, y, money(cur, Number(i.amount)), 12, "B");
  y -= 34;

  // How to pay.
  if (i.status !== "paid") {
    p.text(M, y, "HOW TO PAY", 8, "B", 0.45);
    y -= 14;
    if (d.pays_online && opts.payUrl) {
      p.text(M, y, `Pay online by card: ${opts.payUrl}`, 9);
      y -= 13;
    }
    if (d.bank.iban) {
      const bank = [
        d.bank.account_name && `Account name: ${d.bank.account_name}`,
        d.bank.bank && `Bank: ${d.bank.bank}`,
        `IBAN: ${d.bank.iban}`,
        d.bank.swift && `SWIFT: ${d.bank.swift}`,
      ].filter(Boolean) as string[];
      for (const b of bank) {
        p.text(M, y, b, 9);
        y -= 12;
      }
      p.text(
        M,
        y,
        `Please use ${i.number ?? "the invoice number"} as the reference.`,
        9,
        "R",
        0.35,
      );
      y -= 12;
    }
  } else {
    p.text(M, y, "PAID", 12, "B", 0.3);
    y -= 14;
  }
  if (i.note) {
    y -= 10;
    for (const r of wrap(i.note, W - 2 * M, 9).slice(0, 6)) {
      p.text(M, y, r, 9, "R", 0.35);
      y -= 12;
    }
  }
  pages.forEach((pg, n) =>
    pg.right(
      W - M,
      M - 18,
      `${company} · ${i.number ?? ""} · page ${n + 1} of ${pages.length}`,
      7,
      "R",
      0.5,
    ),
  );

  // Assemble: catalog, pages, fonts, one content stream per page.
  const objs: string[] = [];
  const add = (o: string) => (objs.push(o), objs.length);
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const f2 = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const kids: number[] = [];
  for (const pg of pages) {
    const body = pg.ops.join("\n");
    const content = add(
      `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objs.forEach((o, n) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${n + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
