import Link from "next/link";

export interface PathCard {
  kicker: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  current?: boolean;
}

/** Two side-by-side choices (Production: monthly packages vs single shoot). */
export function PathCards({ paths }: { paths: PathCard[] }) {
  return (
    <div className="paths">
      {paths.map((p) => (
        <Link key={p.href} href={p.href} className={p.current ? "path on" : "path"}>
          <span className="k">{p.kicker}</span>
          <h3 className="d h3">{p.title}</h3>
          <p>{p.text}</p>
          <span className="lnk">{p.cta}</span>
        </Link>
      ))}
    </div>
  );
}
