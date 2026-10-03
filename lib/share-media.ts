/** Media sizing shared by the share page (server) and its gallery (browser). */
export type GalleryPhoto = { small: string; large: string };

/**
 * Phones always get the 800px photo (sharp enough at this size, a fraction of the bytes on
 * mobile data; the viewer has the big one). Wider screens get the 2048px one. The page preloads
 * the same pair, so the browser picks once.
 */
export const HERO_SIZES = "(min-width: 760px) 720px, 266px";
export const heroSrcSet = (p: GalleryPhoto) => `${p.small} 800w, ${p.large} 2048w`;
