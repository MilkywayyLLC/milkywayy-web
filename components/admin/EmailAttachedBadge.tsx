/**
 * A website booking that joined a client's account by its email while nobody was signed in
 * (owner, 3 Oct 2026): anyone can type an email, so confirm it before trusting it.
 */
export function EmailAttachedBadge() {
  return (
    <span
      className="ad-pill warn"
      title="Booked with this client's email while signed out. Confirm it with them before trusting it."
    >
      Attached by email, not signed in
    </span>
  );
}
