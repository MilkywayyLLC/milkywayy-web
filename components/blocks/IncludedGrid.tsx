export interface Included {
  kicker: string;
  title: string;
  text: string;
}

/** Bordered 3-column grid of what's included (Production). */
export function IncludedGrid({ items }: { items: Included[] }) {
  return (
    <div className="incl">
      {items.map((i) => (
        <div key={i.kicker}>
          <span className="k">{i.kicker}</span>
          <b>{i.title}</b>
          <p>{i.text}</p>
        </div>
      ))}
    </div>
  );
}
