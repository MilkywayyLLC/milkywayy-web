/** The preview frames' two layouts and their canvases (shared by the showcase and its frames). */
export type Layout = "desk" | "phone";
export const CANVAS: Record<Layout, { w: number; h: number }> = {
  desk: { w: 800, h: 700 },
  phone: { w: 390, h: 780 },
};
/** Below this window width the frames switch to the phone portal. */
export const PHONE_BELOW = 560;
/** Never scale a frame up more than this (wide tablets). */
export const MAX_SCALE = 1.15;
