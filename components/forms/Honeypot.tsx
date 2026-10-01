/** Spam trap (guide §9.4): off-screen and skipped by keyboards and screen readers. Bots fill it. */
export function Honeypot() {
  return (
    <div className="hp" aria-hidden="true">
      <label>
        Leave this empty
        <input name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
