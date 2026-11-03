/** The preview frames' two layouts and their canvases (shared by the showcase and its frames).
 *  Both landscape (owner, 3 Nov 2026): phones get the tablet frame scaled down, never a tall one. */
export type Layout = "desk" | "tablet";
export const CANVAS: Record<Layout, { w: number; h: number }> = {
  desk: { w: 960, h: 600 },
  tablet: { w: 720, h: 450 },
};
/** The portal's rail appears from here (app/styles/portal-v2.css). */
export const DESK_FROM = 900;
/** Never scale a frame up more than this (wide tablets). */
export const MAX_SCALE = 1.15;
