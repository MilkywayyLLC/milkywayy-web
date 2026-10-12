import { AppLink as Link } from "@/components/ui/AppLink";

export interface Need {
  key: string; // UAE · GLOBAL · ANYONE
  title: string;
  sub: string;
  href: string;
}

/** Home "What do you need?": three equal service cards, its own section below the hero. */
export function NeedSelector({ needs }: { needs: Need[] }) {
  return (
    <nav className="need" aria-labelledby="need-title">
      <h2 className="d h3 need-h" id="need-title">
        What do you need?
      </h2>
      <div className="need-cards">
        {needs.map((n) => (
          <Link key={n.href} href={n.href}>
            <span className="k">{n.key}</span>
            <b>{n.title}</b>
            <small>{n.sub}</small>
            <span className="arr" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
