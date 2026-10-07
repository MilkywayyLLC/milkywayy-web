/**
 * 360 tours (owner, 7 Oct 2026): only Matterport, Panoee and Kuula links. Each is checked and
 * turned into the URL its player embeds; anything else is refused.
 *   Matterport  my.matterport.com/show/?m=<id>
 *   Panoee      panoee.com/…, tour.panoee.net/…
 *   Kuula       kuula.co/post/<id>, kuula.co/share/<id>, kuula.co/share/collection/<id>
 */
export type TourHost = "matterport" | "panoee" | "kuula";
export const TOUR_HINT = "Matterport, Panoee or Kuula link";

/** Hosts the site may frame (next.config.ts frame-src). */
export const TOUR_FRAME_HOSTS = [
  "https://my.matterport.com",
  "https://panoee.com",
  "https://*.panoee.com",
  "https://tour.panoee.net",
  "https://*.panoee.net",
  "https://kuula.co",
  "https://*.kuula.co",
];

export function tourEmbed(input: string): { host: TourHost; embed: string } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();

  if (host === "my.matterport.com" && /^\/show\/?$/.test(u.pathname)) {
    const m = u.searchParams.get("m");
    if (!m || !/^[A-Za-z0-9]{6,20}$/.test(m)) return null;
    return { host: "matterport", embed: `https://my.matterport.com/show/?m=${m}&play=1&qs=1` };
  }

  if (
    host === "panoee.com" ||
    host === "www.panoee.com" ||
    host === "tour.panoee.net" ||
    host.endsWith(".panoee.com") ||
    host.endsWith(".panoee.net")
  ) {
    if (u.pathname === "/" || u.pathname === "") return null;
    return { host: "panoee", embed: `https://${host}${u.pathname}${u.search}` };
  }

  if (host === "kuula.co" || host === "www.kuula.co") {
    const c = u.pathname.match(/^\/share\/collection\/([A-Za-z0-9]+)\/?$/);
    if (c)
      return {
        host: "kuula",
        embed: `https://kuula.co/share/collection/${c[1]}?logo=1&info=1&fs=1&vr=0&thumbs=1`,
      };
    const p = u.pathname.match(/^\/(?:post|share)\/([A-Za-z0-9]+)\/?$/);
    if (p)
      return {
        host: "kuula",
        embed: `https://kuula.co/share/${p[1]}?logo=1&info=1&fs=1&vr=0&thumbs=1`,
      };
    return null;
  }
  return null;
}
