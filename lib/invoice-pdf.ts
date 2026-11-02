import { deflateSync } from "node:zlib";

/**
 * The invoice PDF (owner, 10 Oct 2026; Milkywayy Ledger layout, 2 Nov 2026), generated from an
 * approved invoice: company details, the invoice number, client details, line items, totals, VAT
 * when registered, bank details and the online payment link where it applies. A small,
 * dependency-free PDF writer: A4, the standard Helvetica fonts (no embedding), WinAnsi text, pages
 * added as the lines need them. Images come in as raw pixels; the caller decodes them.
 */
export type PdfInvoice = {
  invoice: {
    account_id?: string;
    number: string | null;
    issued_on: string;
    due_on: string;
    currency: string;
    lines: {
      description: string;
      qty: number;
      unit_price: number;
      amount: number;
      line_item_id?: string;
    }[];
    subtotal: number | null;
    vat_rate: number;
    vat: number;
    amount: number;
    note: string | null;
    period_start: string | null;
    period_end: string | null;
    status: string;
    refunded?: number | null;
  };
  account: {
    name: string;
    trn: string | null;
    billing_address: string | null;
    attn?: string | null;
  };
  company: {
    name: string | null;
    address: string | null;
    trn: string | null;
    email: string | null;
    vat_registered: boolean;
    licence?: string | null;
    phone?: string | null;
    signature_key?: string | null;
  };
  bank: {
    account_name: string | null;
    bank: string | null;
    account_no?: string | null;
    iban: string | null;
    swift: string | null;
  };
  pays_online: boolean;
  /** Line item id -> the date of the work, for the line's sub-line. */
  line_dates?: Record<string, string>;
  /** Today's details; `account` and `company` are frozen once an invoice is issued. */
  current?: Pick<PdfInvoice, "account" | "company">;
};

/** Decoded pixels: `rgb` is w*h*3 bytes, `alpha` w*h bytes when the image has transparency. */
export type PdfImage = { w: number; h: number; rgb: Buffer; alpha?: Buffer };

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
const width = (s: string, size: number, f: Font = "R", track = 0) => {
  let w = ([...s].length * track * 1000) / size;
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

/** A whole calendar month reads "October 2026"; anything else as two dates. */
const period = (start: string, end: string | null) => {
  const s = start.slice(0, 10);
  const last = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).toISOString().slice(0, 10);
  if (s.endsWith("-01") && end?.slice(0, 10) === last)
    return new Date(`${s}T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${day(s)}${end ? ` – ${day(end)}` : ""}`;
};
const money = (cur: string, n: number) =>
  `${cur} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (d: string) => {
  const [y, m, n] = d.slice(0, 10).split("-");
  return `${n}/${m}/${y}`;
};
const dayMonth = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
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
const M = 38;

// The Ledger template's palette.
const INK = "#15181D";
const BAND = "#111418";
const BODY = "#3D444E";
const MUTED = "#6C7480";
const LINE = "#DFE3E9";
const LINE_2 = "#B9C0C9";
const PANEL = "#F4F6F8";
const FOOT = "#C3CAD4";
const WHITE = "#FFFFFF";

const BAND_H = 71;
const FOOT_H = 40;
/** Room the terms and signature take above the footer band, on the last page. */
const SIGN_TOP = 168;

const TERMS_URL_QR = [
  "11111110001100011001101111111",
  "10000010011010000000101000001",
  "10111010111000101011101011101",
  "10111010110000001101001011101",
  "10111010111101110011001011101",
  "10000010101111111000101000001",
  "11111110101010101010101111111",
  "00000000110011010000100000000",
  "10111110011010110101001111100",
  "00101101001110011001101110001",
  "01011011110110000110111100000",
  "10010001001100101011100001010",
  "10001010001000001101000001100",
  "10000100101101110111101110001",
  "10100111100101111000100011100",
  "00000000110001010001001100010",
  "01100110110000110100000001100",
  "10010000111110011001111110101",
  "10111011011110000110010110100",
  "10110000110000101001100000010",
  "10001110011100001011111110111",
  "00000000111111110110100011111",
  "11111110010101111101101011100",
  "10000010110011010110100010001",
  "10111010110110110000111110111",
  "10111010100101011011000001100",
  "10111010100010100010101111110",
  "10000010000011101001111111010",
  "11111110101111101011000100100",
]; // https://milkywayy.com/terms, error correction M

const rgb = (hex: string) =>
  [1, 3, 5].map((n) => (parseInt(hex.slice(n, n + 2), 16) / 255).toFixed(3)).join(" ");
const n2 = (n: number) => n.toFixed(2);
/** A circle as four curves (0.5523 is the usual control-point ratio). */
const circle = (cx: number, cy: number, r: number, ry = r) => {
  const k = r * 0.5523;
  const ky = ry * 0.5523;
  return [
    `${n2(cx + r)} ${n2(cy)} m`,
    `${n2(cx + r)} ${n2(cy + ky)} ${n2(cx + k)} ${n2(cy + ry)} ${n2(cx)} ${n2(cy + ry)} c`,
    `${n2(cx - k)} ${n2(cy + ry)} ${n2(cx - r)} ${n2(cy + ky)} ${n2(cx - r)} ${n2(cy)} c`,
    `${n2(cx - r)} ${n2(cy - ky)} ${n2(cx - k)} ${n2(cy - ry)} ${n2(cx)} ${n2(cy - ry)} c`,
    `${n2(cx + k)} ${n2(cy - ry)} ${n2(cx + r)} ${n2(cy - ky)} ${n2(cx + r)} ${n2(cy)} c h`,
  ].join(" ");
};
const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
  const k = r * 0.4477;
  return [
    `${n2(x + r)} ${n2(y)} m ${n2(x + w - r)} ${n2(y)} l`,
    `${n2(x + w - k)} ${n2(y)} ${n2(x + w)} ${n2(y + k)} ${n2(x + w)} ${n2(y + r)} c`,
    `${n2(x + w)} ${n2(y + h - r)} l`,
    `${n2(x + w)} ${n2(y + h - k)} ${n2(x + w - k)} ${n2(y + h)} ${n2(x + w - r)} ${n2(y + h)} c`,
    `${n2(x + r)} ${n2(y + h)} l`,
    `${n2(x + k)} ${n2(y + h)} ${n2(x)} ${n2(y + h - k)} ${n2(x)} ${n2(y + h - r)} c`,
    `${n2(x)} ${n2(y + r)} l`,
    `${n2(x)} ${n2(y + k)} ${n2(x + k)} ${n2(y)} ${n2(x + r)} ${n2(y)} c h`,
  ].join(" ");
};

class Page {
  ops: string[] = [];
  images = new Set<string>();
  text(x: number, y: number, s: string, size = 9, f: Font = "R", color = INK, track = 0) {
    this.ops.push(
      `BT /${f === "B" ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${track} Tc ${n2(x)} ${n2(y)} Td ${lit(s)} Tj ET`,
    );
  }
  right(xRight: number, y: number, s: string, size = 9, f: Font = "R", color = INK, track = 0) {
    this.text(xRight - width(s, size, f, track), y, s, size, f, color, track);
  }
  center(xMid: number, y: number, s: string, size = 9, f: Font = "R", color = INK, track = 0) {
    this.text(xMid - width(s, size, f, track) / 2, y, s, size, f, color, track);
  }
  /** "Key  value": muted key, bold value. */
  kv(x: number, y: number, k: string, v: string, size = 8.5) {
    this.text(x, y, k, size, "R", MUTED);
    this.text(x + width(k, size) + 4, y, v, size, "B");
  }
  line(x1: number, y1: number, x2: number, y2: number, color = LINE, w = 1) {
    this.ops.push(`${rgb(color)} RG ${w} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`);
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(`${rgb(color)} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  }
  stroke(path: string, color: string, w: number) {
    this.ops.push(`${rgb(color)} RG ${w} w ${path} S`);
  }
  fill(path: string, color: string) {
    this.ops.push(`${rgb(color)} rg ${path} f`);
  }
  image(name: string, x: number, y: number, w: number, h: number) {
    this.images.add(name);
    this.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(y)} cm /${name} Do Q`);
  }
}

/** The terms code as filled runs in one path, so no hairlines show between modules. */
function qr(p: Page, x: number, y: number, size: number) {
  const m = size / TERMS_URL_QR.length;
  const runs: string[] = [];
  TERMS_URL_QR.forEach((row, r) => {
    for (const run of row.matchAll(/1+/g))
      runs.push(
        `${n2(x + run.index * m)} ${n2(y + size - (r + 1) * m)} ${n2(run[0].length * m)} ${n2(m)} re`,
      );
  });
  p.fill(runs.join(" "), BAND);
}

/** The bottom band, on every page. The icons are drawn so they look the same in any viewer. */
function footBand(p: Page, email: string | null, n: number, total: number) {
  p.rect(0, 0, W, FOOT_H, BAND);
  const y = 17;
  const s = 9 / 24;
  const icon = (x: number) => ({ x, y: y - 1, w: 2 * s });
  let x = M;
  const a = icon(x);
  p.stroke(roundRect(a.x + 2.5 * s, a.y + 2.5 * s, 19 * s, 19 * s, 5.5 * s), FOOT, a.w);
  p.stroke(circle(a.x + 12 * s, a.y + 12 * s, 4.6 * s), FOOT, a.w);
  p.fill(circle(a.x + 17.8 * s, a.y + 17.8 * s, 1.4 * s), FOOT);
  p.text(x + 14, y, "milkywayy.media", 8, "R", FOOT);
  x += 14 + width("milkywayy.media", 8) + 16;
  if (email) {
    const b = icon(x);
    p.stroke(roundRect(b.x + 2.5 * s, b.y + 5 * s, 19 * s, 14 * s, 2.5 * s), FOOT, b.w);
    p.stroke(
      `${n2(b.x + 3.5 * s)} ${n2(b.y + 16.5 * s)} m ${n2(b.x + 12 * s)} ${n2(b.y + 10.8 * s)} l ${n2(b.x + 20.5 * s)} ${n2(b.y + 16.5 * s)} l`,
      FOOT,
      b.w,
    );
    p.text(x + 14, y, email, 8, "R", FOOT);
  }
  const pageNo = total > 1 ? `   ·   Page ${n} of ${total}` : "";
  const pageW = width(pageNo, 8);
  if (pageNo) p.right(W - M, y, pageNo, 8, "R", "#8A93A0");
  const site = "milkywayy.com";
  const sx = W - M - pageW - width(site, 8.5, "B");
  p.text(sx, y, site, 8.5, "B", WHITE);
  const g = icon(sx - 14);
  p.stroke(circle(g.x + 12 * s, g.y + 12 * s, 9.5 * s), FOOT, g.w);
  p.stroke(`${n2(g.x + 2.5 * s)} ${n2(g.y + 12 * s)} m ${n2(g.x + 21.5 * s)} ${n2(g.y + 12 * s)} l`, FOOT, g.w);
  p.stroke(circle(g.x + 12 * s, g.y + 12 * s, 3.9 * s, 9.5 * s), FOOT, g.w);
}

export function invoicePdf(
  d: PdfInvoice,
  opts: {
    payUrl?: string;
    title?: string;
    reference?: string;
    logo?: PdfImage | null;
    signature?: PdfImage | null;
  } = {},
): Uint8Array {
  const i = d.invoice;
  const cur = i.currency;
  const pages: Page[] = [];
  let p = new Page();
  pages.push(p);
  const company = d.company.name || "Milkywayy";
  const R = W - M;

  // The black band with the logo, first page only.
  p.rect(0, H - BAND_H, W, BAND_H, BAND);
  if (opts.logo) p.image("Logo", M, H - 20 - 31, 250, 31);
  else p.text(M, H - 46, "MILKYWAYY", 22, "B", WHITE, 1);
  let y = H - BAND_H - 24;

  // Title (left); number, date, due date and period (right).
  const title = opts.title ?? (d.company.vat_registered ? "TAX INVOICE" : "INVOICE");
  p.text(M, y - 20, title, 26, "B", INK, 1.4);
  let my = y - 7;
  const meta = (k: string, v: string) => {
    p.right(R, my, v, 9, "B");
    p.right(R - width(v, 9, "B") - 8, my, k, 8.5, "R", MUTED);
    my -= 12;
  };
  meta("No.", i.number ?? "DRAFT");
  meta("Date", dmy(i.issued_on));
  if (i.due_on) meta("Due", dmy(i.due_on));
  if (i.period_start) meta("Period", period(i.period_start, i.period_end));
  y = Math.min(y - 30, my + 3) - 18;
  p.line(M, y, R, y);
  y -= 18;

  // Bill to (left); from, how to pay (right).
  const colW = (W - 2 * M) * 0.47;
  const colR = R - colW;
  const label = (x: number, yy: number, s: string, color = MUTED) =>
    p.text(x, yy, s, 7.5, "B", color, 1.5);
  const paragraph = (x: number, yy: number, s: string) => {
    for (const part of s.split(/\n/).filter(Boolean))
      for (const l of wrap(part.trim(), colW, 9)) {
        p.text(x, yy, l, 9, "R", BODY);
        yy -= 14;
      }
    return yy;
  };
  const name = (x: number, yy: number, s: string) => {
    for (const l of wrap(s, colW, 11.5, "B")) {
      p.text(x, yy, l, 11.5, "B");
      yy -= 14;
    }
    return yy - 1;
  };

  label(M, y - 6, "BILL TO");
  let ly = name(M, y - 21, d.account.name);
  if (d.account.attn) ly = paragraph(M, ly, `Attn: ${d.account.attn}`);
  ly = paragraph(M, ly, d.account.billing_address ?? "");
  if (d.account.trn) {
    p.kv(M, ly - 2, "TRN", d.account.trn);
    ly -= 14;
  }

  label(colR, y - 6, "FROM");
  let ry = name(colR, y - 21, company);
  ry = paragraph(colR, ry, d.company.address ?? "");
  ry += 1;
  const from: [string, string | null | undefined][] = [
    ["Licence No.", d.company.licence],
    ["TRN:", d.company.trn],
    ["Email", d.company.email],
    ["Phone", d.company.phone],
  ];
  for (const [k, v] of from)
    if (v) {
      p.kv(colR, ry, k, v);
      ry -= 12.2;
    }

  if (i.status !== "paid") {
    if (d.pays_online && opts.payUrl) {
      ry -= 4;
      p.kv(colR, ry, "Pay online:", "milkywayy.com/portal/billing");
      ry -= 8;
    }
    if (d.bank.iban) {
      const rows = (
        [
          ["Holder", d.bank.account_name],
          ["Bank", d.bank.bank],
          ["Account", d.bank.account_no],
          ["IBAN", d.bank.iban],
          ["SWIFT", d.bank.swift],
        ] as [string, string | null | undefined][]
      ).filter((r): r is [string, string] => !!r[1]);
      const pad = 9;
      const ref = wrap(
        `Please use ${opts.reference ?? i.number ?? "the invoice number"} as the reference.`,
        colW - 2 * pad - 2,
        7.5,
      );
      const boxH = pad * 2 + 16 + rows.length * 12.2 + ref.length * 10 + 2;
      const top = ry - 2;
      p.fill(roundRect(colR, top - boxH, colW, boxH, 2), PANEL);
      p.rect(colR, top - boxH, 2, boxH, BAND);
      let by = top - pad - 6;
      label(colR + pad + 2, by, "BANK DETAILS");
      by -= 16;
      for (const [k, v] of rows) {
        p.kv(colR + pad + 2, by, k, v);
        by -= 12.2;
      }
      by -= 1;
      for (const l of ref) {
        p.text(colR + pad + 2, by, l, 7.5, "R", MUTED);
        by -= 10;
      }
      ry = top - boxH;
    }
  } else {
    ry -= 8;
    p.text(colR, ry, "PAID", 12, "B");
    ry -= 14;
    // Money given back (cancellations), phase 1.
    if (Number(i.refunded ?? 0) > 0) {
      p.text(colR, ry, `REFUNDED ${money(cur, Number(i.refunded))}`, 9, "B", MUTED);
      ry -= 14;
    }
  }
  y = Math.min(ly, ry) - 22;

  // Lines.
  const cAmt = R - 10;
  const cRate = cAmt - 88;
  const cQtyMid = cRate - 80 - 21;
  const descW = cQtyMid - 21 - 10 - (M + 10);
  const newPage = () => {
    p = new Page();
    pages.push(p);
    y = H - 38;
  };
  const header = () => {
    p.rect(M, y - 22, W - 2 * M, 22, BAND);
    const b = y - 14;
    p.text(M + 10, b, "SERVICE", 7.5, "B", WHITE, 1.2);
    p.center(cQtyMid, b, "QTY", 7.5, "B", WHITE, 1.2);
    p.right(cRate, b, "RATE", 7.5, "B", WHITE, 1.2);
    p.right(cAmt, b, "AMOUNT", 7.5, "B", WHITE, 1.2);
    y -= 22;
  };
  header();
  for (const l of i.lines) {
    // "Photo shoot · 4 Bed villa · MW-1772": the service in bold, the rest and the date below it.
    const [service, ...rest] = l.description.split(" · ");
    const date = l.line_item_id ? d.line_dates?.[l.line_item_id] : null;
    const sub = [...rest, ...(date ? [dayMonth(date)] : [])].join(" · ");
    const nameRows = wrap(service, descW, 10, "B");
    const subRows = sub ? wrap(sub, descW, 8) : [];
    const need = 18 + nameRows.length * 12 + subRows.length * 11;
    if (y - need < FOOT_H + 16) {
      newPage();
      header();
    }
    let t = y - 9 - 8;
    p.center(cQtyMid, t, String(Number(l.qty)), 9);
    p.right(cRate, t, money(cur, Number(l.unit_price)), 9);
    p.right(cAmt, t, money(cur, Number(l.amount)), 9, "B");
    for (const r of nameRows) {
      p.text(M + 10, t, r, 10, "B");
      t -= 12;
    }
    t += 1;
    for (const r of subRows) {
      p.text(M + 10, t, r, 8, "R", MUTED);
      t -= 11;
    }
    y -= need;
    p.line(M, y, R, y);
  }

  // Totals, then any note; moved whole to a new page if they'd run into the signature.
  const vatOn = Number(i.vat) > 0;
  const noteRows = i.note ? wrap(i.note, 330, 8.5).slice(0, 6) : [];
  const totalsH = 16 + 18 + (vatOn ? 18 : 0) + 30 + (noteRows.length ? 20 + noteRows.length * 13 : 0);
  if (y - totalsH < SIGN_TOP) newPage();
  y -= 16;
  const tL = R - 232;
  const row = (k: string, v: string) => {
    p.text(tL, y - 9, k, 9, "R", BODY);
    p.right(R, y - 9, v, 9.5, "B");
    y -= 18;
  };
  row("Subtotal", money(cur, Number(i.subtotal ?? i.amount)));
  if (vatOn) row(`VAT ${Number(i.vat_rate)}%`, money(cur, Number(i.vat)));
  y -= 2;
  p.line(tL, y, R, y, LINE_2, 1.4);
  p.text(tL, y - 17, "TOTAL", 10.5, "B", INK, 1);
  p.right(R, y - 19, money(cur, Number(i.amount)), 13.5, "B");
  y -= 28;
  if (noteRows.length) {
    y -= 20;
    for (const r of noteRows) {
      p.text(M, y, r, 8.5, "R", MUTED);
      y -= 13;
    }
  }

  // Terms and signature, last page only.
  const bottom = 56;
  qr(p, M, bottom, 56);
  const tx = M + 56 + 11;
  p.text(tx, bottom + 56 - 8, "Terms & Conditions", 9.5, "B");
  let ty = bottom + 56 - 19;
  for (const l of wrap(
    `By proceeding with payment or service confirmation, you agree to ${company}’s Terms & Conditions. Scan the code to view the full terms.`,
    253,
    7.5,
  )) {
    p.text(tx, ty, l, 7.5, "R", MUTED);
    ty -= 11;
  }
  const signMid = R - 75;
  p.center(signMid, bottom + 2, "Founder & CEO", 7.5, "R", MUTED);
  p.center(signMid, bottom + 12, "Akash Praseed", 9, "B");
  p.line(signMid - 70, bottom + 24, signMid + 70, bottom + 24, LINE_2);
  if (opts.signature) {
    const scale = Math.min(110 / opts.signature.w, 71 / opts.signature.h);
    const sw = opts.signature.w * scale;
    p.image("Sign", signMid - sw / 2, bottom + 26, sw, opts.signature.h * scale);
  }

  pages.forEach((pg, n) => footBand(pg, d.company.email, n + 1, pages.length));

  // Assemble: catalog, pages, fonts, images, one content stream per page.
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
  const stream = (dict: string, bytes: Buffer) => {
    const z = deflateSync(bytes);
    return add(
      `<< ${dict} /Filter /FlateDecode /Length ${z.length} >>\nstream\n${z.toString("latin1")}\nendstream`,
    );
  };
  const addImage = (im: PdfImage) => {
    const size = `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /BitsPerComponent 8`;
    const mask = im.alpha ? stream(`${size} /ColorSpace /DeviceGray`, im.alpha) : 0;
    return stream(
      `${size} /ColorSpace /DeviceRGB${mask ? ` /SMask ${mask} 0 R` : ""}`,
      im.rgb,
    );
  };
  const images: Record<string, number> = {};
  if (opts.logo) images.Logo = addImage(opts.logo);
  if (opts.signature) images.Sign = addImage(opts.signature);
  const kids: number[] = [];
  for (const pg of pages) {
    const body = pg.ops.join("\n");
    const content = add(
      `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`,
    );
    const xobj = [...pg.images].map((k) => `/${k} ${images[k]} 0 R`).join(" ");
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ""} >> /Contents ${content} 0 R >>`,
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
