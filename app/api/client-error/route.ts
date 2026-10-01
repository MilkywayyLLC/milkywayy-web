import { NextResponse, type NextRequest } from "next/server";
import { alert } from "@/lib/monitoring/alert";

/**
 * Browser errors from our own scripts (sent by components/forms/Attribution.tsx). At most one
 * email per distinct error per hour, and at most one browser-error email per 10 minutes overall.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as {
    message?: unknown;
    source?: unknown;
    page?: unknown;
  } | null;
  if (!b || typeof b.message !== "string" || b.message.length > 500)
    return new NextResponse(null, { status: 204 });
  const source = typeof b.source === "string" ? b.source.slice(0, 300) : "";
  if (source && !source.startsWith(req.nextUrl.origin))
    return new NextResponse(null, { status: 204 });
  await alert(
    {
      kind: "browser error",
      message: b.message,
      where: typeof b.page === "string" ? b.page.slice(0, 200) : undefined,
      detail: `${source}\n${req.headers.get("user-agent") ?? ""}`,
    },
    { throttle: "browser-errors" },
  );
  return new NextResponse(null, { status: 204 });
}
