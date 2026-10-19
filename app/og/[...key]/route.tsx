import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getCaseStudies, getCaseStudy } from "@/lib/data";
import { SEO_PAGES, seoPage } from "@/lib/seo/pages";

/**
 * Share images, 1200×630, in the Viewfinder style (guide §12): /og/<page> and /og/work/<slug>.
 * Rendered at build time and on revalidation, never per request.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateStaticParams() {
  const cases = await getCaseStudies();
  return [
    { key: ["logo"] },
    ...SEO_PAGES.map((p) => ({ key: [p.key] })),
    ...cases.map((c) => ({ key: ["work", c.slug] })),
  ];
}

const font = (f: string) => readFile(path.join(process.cwd(), "assets/og", f));

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  if (key[0] === "logo") return logo();
  let lines: [string, string];
  let eyebrow: string;
  if (key[0] === "work" && key[1]) {
    const cs = await getCaseStudy(key[1]);
    if (!cs) return new Response("Not found", { status: 404 });
    lines = cs.heroLines ?? [cs.title, ""];
    eyebrow = `Case study · ${cs.client}`;
  } else {
    const p = seoPage(key[0]);
    if (!p) return new Response("Not found", { status: 404 });
    lines = p.og;
    eyebrow = p.eyebrow;
  }
  const [display, mono, logoPng] = await Promise.all([
    font("Archivo-Condensed-ExtraBold.woff"),
    font("DMMono-Medium.ttf"),
    font("logo-on-dark.png"),
  ]);
  const logoSrc = `data:image/png;base64,${logoPng.toString("base64")}`;
  const bracket = (pos: Record<string, number>, h: "left" | "right", v: "top" | "bottom") => (
    <div
      style={{
        position: "absolute",
        width: 56,
        height: 56,
        ...pos,
        [`border${h[0].toUpperCase() + h.slice(1)}`]: "3px solid #ededea",
        [`border${v[0].toUpperCase() + v.slice(1)}`]: "3px solid #ededea",
      }}
    />
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#111111",
        color: "#ededea",
        padding: "72px 84px",
        position: "relative",
      }}
    >
      {bracket({ left: 40, top: 40 }, "left", "top")}
      {bracket({ right: 40, top: 40 }, "right", "top")}
      {bracket({ left: 40, bottom: 40 }, "left", "bottom")}
      {bracket({ right: 40, bottom: 40 }, "right", "bottom")}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "Mono",
          fontSize: 26,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "#8e8c87",
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#e5484d" }} />
        {eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: "Display",
          fontSize: 112,
          lineHeight: 0.95,
          textTransform: "uppercase",
          letterSpacing: -1,
        }}
      >
        <span>{lines[0]}</span>
        {lines[1] && <span style={{ color: "#e6d3a3" }}>{lines[1]}</span>}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "Mono",
          fontSize: 24,
          letterSpacing: 2,
          color: "#8e8c87",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse */}
        <img src={logoSrc} width={Math.round((72 * 9988) / 1235 / 2)} height={36} alt="" />
        <span>milkywayy.com</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Display", data: display, weight: 800, style: "normal" },
        { name: "Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}

/** Square logo for structured data (Organization.logo): the brand icon on #111111 (app/icon.png). */
async function logo() {
  const png = await readFile(path.join(process.cwd(), "app/icon.png"));
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
