export interface Step {
  n: string; // "01", "Day 1"
  title: string;
  text: string;
}

/** Process steps in 4 or 5 columns, separated by 1px lines; 2 then 1 column on smaller screens. */
export function Steps({
  steps,
  snap = false,
}: {
  steps: Step[];
  /** Phones: a sideways snap row instead of a stacked list. */
  snap?: boolean;
}) {
  const cls = ["steps", steps.length === 5 && "five", snap && "snap-m"].filter(Boolean).join(" ");
  return (
    <ol className={cls}>
      {steps.map((s) => (
        <li className="step" key={s.n}>
          <span className="n">{s.n}</span>
          <h3 className="d h3">{s.title}</h3>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
