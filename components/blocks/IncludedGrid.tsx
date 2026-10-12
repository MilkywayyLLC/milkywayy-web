export interface Included {
  kicker: string;
  title: string;
  text: string;
}

/** Bordered 3-column grid of what's included (Production); `cols={2}`: a 2×2 of larger cards. */
export function IncludedGrid({ items, cols = 3 }: { items: Included[]; cols?: 2 | 3 }) {
  return (
    <div className={cols === 2 ? "incl incl-2" : "incl"}>
      {items.map((i) => (
        <div key={i.title}>
          <span className="k">{i.kicker}</span>
          <b>{i.title}</b>
          <p>{i.text}</p>
        </div>
      ))}
    </div>
  );
}
