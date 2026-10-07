/**
 * Instagram links, read the same way in the admin (browser) and on the server. Only the URL is
 * parsed here; whether a reel is ours is the Instagram API's answer (lib/instagram.ts).
 */
export const OUR_INSTAGRAM = "milkywayy.media";

export const isInstagramUrl = (v: unknown): v is string =>
  typeof v === "string" &&
  /^https?:\/\/(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\//i.test(v.trim());

/** The shortcode of a reel or post link (instagram.com/reel/<code>/, /p/<code>/, /tv/<code>/). */
export function instagramShortcode(v: string): string | null {
  const m = v
    .trim()
    .match(
      /^https?:\/\/(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/i,
    );
  return m ? m[1] : null;
}

/** A clean link to the post, without tracking parameters. */
export const instagramPermalink = (shortcode: string) =>
  `https://www.instagram.com/reel/${shortcode}/`;
