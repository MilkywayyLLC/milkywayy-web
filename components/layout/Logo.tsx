import Link from "next/link";

/** "MILKYWAYY" wordmark with the blinking REC dot. */
export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link className="logo" href="/" aria-label="Milkywayy home" onClick={onClick}>
      <i aria-hidden="true" />
      Milkywayy
    </Link>
  );
}
