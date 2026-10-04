/**
 * Owner confirmations that can't live in the database (owner, 4 Oct 2026). While one is false
 * its page shows a draft label, and a production build fails (scripts/launch-check.mts), so a
 * draft can never go live by accident. Flip one only when Akash confirms it.
 */
export const LAUNCH = {
  /** Privacy and Terms reviewed (ideally by a UAE lawyer). Removes "Draft · to be reviewed". */
  legalReviewed: false,
  /** The About story confirmed by Akash. Removes "Draft · owner to confirm". */
  aboutConfirmed: false,
  /** Every number in the stats band is defensible (Admin → Stats). */
  statsConfirmed: false,
} as const;
