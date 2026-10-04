/**
 * Samples step aside by themselves (owner, 4 Oct 2026): a list shows its real items as soon as
 * there are enough of them, and its "sample" placeholders only while there aren't. Reviews need 3
 * real ones; everything else 1. The production build check (scripts/launch-check.mts) uses the
 * same rule, so whatever it passes is what visitors see.
 */
export const REAL_REVIEWS_NEEDED = 3;

export function realFirst<T extends { sample?: boolean }>(items: T[], min = 1): T[] {
  const real = items.filter((i) => !i.sample);
  return real.length >= min ? real : items;
}
