import sharp from "sharp";
import { getObject } from "@/lib/r2";
import { portalDb } from "@/lib/portal/supabase";

/**
 * A locked delivery's photo preview (payment terms, 24 Oct 2026): low-res (1000px, 480px for the grid),
 * watermarked, never
 * the full-res file. Only for someone who can see the file (RLS); once the booking is paid the page
 * links the real files instead, and this keeps serving the preview only.
 */
export const dynamic = "force-dynamic";

const MAX = 1000;
const mark = (w: number, h: number) => {
  const size = Math.max(18, Math.round(w / 22));
  const rows = Math.ceil(h / (size * 4)) + 2;
  const text = Array.from(
    { length: rows },
    (_, i) =>
      `<text x="${(i % 2) * size * 4 - size * 2}" y="${i * size * 4}" font-size="${size}">MILKYWAYY · PREVIEW · MILKYWAYY · PREVIEW · MILKYWAYY · PREVIEW</text>`,
  ).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <g transform="rotate(-24 ${w / 2} ${h / 2})" fill="#fff" fill-opacity="0.32"
        font-family="Arial, Helvetica, sans-serif" font-weight="700" letter-spacing="2">${text}</g>
    </svg>`,
  );
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?s=t: the grid's thumbnail size.
  const max = new URL(req.url).searchParams.get("s") === "t" ? 480 : MAX;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await portalDb();
  if (!db) return new Response("Not found", { status: 404 });
  const { data: f } = await db
    .from("project_files")
    .select("kind, source, r2_key, web_key, thumb_key, direction")
    .eq("id", id)
    .maybeSingle();
  if (!f || f.direction !== "out" || f.source !== "r2")
    return new Response("Not found", { status: 404 });
  // The web copy (already reduced) when there is one; never sent as is, always resized and marked.
  const key = (f.web_key ?? f.thumb_key ?? f.r2_key) as string | null;
  const obj = key ? await getObject(key) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  try {
    const img = sharp(Buffer.from(await obj.arrayBuffer()))
      .rotate()
      .resize(max, max, {
        fit: "inside",
        withoutEnlargement: true,
      });
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const out = await sharp(data)
      .composite([{ input: mark(info.width, info.height), top: 0, left: 0 }])
      .jpeg({ quality: 60 })
      .toBuffer();
    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=600",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[preview]", e instanceof Error ? e.message : e);
    return new Response("Not found", { status: 404 });
  }
}
