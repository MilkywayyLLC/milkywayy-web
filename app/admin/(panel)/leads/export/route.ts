import type { NextRequest } from "next/server";
import { adminOrThrow } from "@/lib/admin/auth";
import { leadSummary, queryLeads, type LeadRow } from "@/lib/admin/leads";

/** CSV of the leads matching the current filters (Owner only). */
export async function GET(req: NextRequest) {
  let db;
  try {
    ({ db } = await adminOrThrow({ owner: true }));
  } catch {
    return new Response("Not allowed", { status: 403 });
  }
  const p = req.nextUrl.searchParams;
  const { data, error } = await queryLeads(
    db,
    { q: p.get("q") ?? "", type: p.get("type") ?? "", status: p.get("status") ?? "" },
    5000,
  );
  if (error) return new Response(error.message, { status: 500 });
  const cols = [
    "ref",
    "created_at",
    "type",
    "status",
    "name",
    "company",
    "phone",
    "email",
    "preferred_reply",
    "summary",
    "page",
    "utm_source",
    "utm_campaign",
    "referrer",
    "call_booked_at",
    "notes",
  ];
  // Quote every cell; neutralise spreadsheet formulas (=, +, -, @ at the start).
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const rows = ((data ?? []) as LeadRow[]).map((l) =>
    [
      l.ref,
      l.created_at,
      l.type,
      l.status,
      l.name,
      l.company,
      l.phone,
      l.email,
      l.preferred_reply,
      leadSummary(l),
      l.page,
      l.utm?.utm_source,
      l.utm?.utm_campaign,
      l.referrer,
      l.call_booked_at,
      l.notes,
    ]
      .map(cell)
      .join(","),
  );
  const body = "﻿" + [cols.join(","), ...rows].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="milkywayy-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
