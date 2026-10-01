import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_REGIONS } from "@/lib/tracking/config";

/** Does this visitor need the opt-in consent banner? From Vercel's geo header (no IP stored). */
export function GET(req: NextRequest) {
  const country = (req.headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  return NextResponse.json(
    { consentRequired: CONSENT_REGIONS.has(country) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
