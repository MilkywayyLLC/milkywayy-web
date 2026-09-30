/** Two-column "the usual way vs with Milkywayy" comparison. */
export function CompareTable({
  bad,
  good,
}: {
  bad: { title: string; items: string[] };
  good: { title: string; items: string[] };
}) {
  return (
    <div className="compare">
      <div className="bad">
        <span className="eb">{bad.title}</span>
        <ul>
          {bad.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
      <div className="good">
        <span className="eb">{good.title}</span>
        <ul>
          {good.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
