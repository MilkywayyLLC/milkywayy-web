import Link from "next/link";

export interface Need {
  key: string; // UAE · GLOBAL · ANYONE
  title: string;
  sub: string;
  href: string;
}

/** Home hero "What do you need?" list, one row per service. */
export function NeedSelector({ needs }: { needs: Need[] }) {
  return (
    <nav className="need" aria-label="Choose what you need">
      <span className="need-h">What do you need?</span>
      {needs.map((n) => (
        <Link key={n.href} href={n.href}>
          <span className="k">{n.key}</span>
          <span>
            <b>{n.title}</b>
            <small>{n.sub}</small>
          </span>
          <span className="arr" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </nav>
  );
}
