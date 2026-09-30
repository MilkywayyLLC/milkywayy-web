/**
 * Advance widths of Archivo (wght 800, wdth 68, uppercase, as `.d`) in em, measured in the
 * browser. Used to size two-line hero titles on the server so the first paint already matches
 * what HeroTitle's fitter computes after hydration (no layout shift). Unknown glyphs fall back
 * to an average width; the client fitter corrects any small error.
 */
const GLYPH_EM: Record<string, number> = {
  A: 0.534,
  B: 0.519,
  C: 0.539,
  D: 0.538,
  E: 0.486,
  F: 0.429,
  G: 0.572,
  H: 0.544,
  I: 0.252,
  J: 0.453,
  K: 0.539,
  L: 0.44,
  M: 0.71,
  N: 0.547,
  O: 0.58,
  P: 0.503,
  Q: 0.58,
  R: 0.533,
  S: 0.487,
  T: 0.487,
  U: 0.536,
  V: 0.508,
  W: 0.742,
  X: 0.521,
  Y: 0.515,
  Z: 0.493,
  "0": 0.453,
  "1": 0.398,
  "2": 0.445,
  "3": 0.451,
  "4": 0.443,
  "5": 0.453,
  "6": 0.453,
  "7": 0.404,
  "8": 0.443,
  "9": 0.453,
  " ": 0.1,
  ".": 0.224,
  ",": 0.224,
  "'": 0.204,
  "’": 0.206,
  "&": 0.574,
  "!": 0.262,
  "?": 0.436,
  "-": 0.25,
  ":": 0.234,
};
const AVERAGE = 0.5;

/** Width of a line of display text in em (text is uppercased as the CSS does). */
export function lineEm(text: string) {
  let em = 0;
  for (const ch of text.toUpperCase()) em += GLYPH_EM[ch] ?? AVERAGE;
  return em;
}

/** Extra width a highlighted segment adds on light tone (padding 0 0.12em). */
export const LIGHT_HL_PAD_EM = 0.24;
