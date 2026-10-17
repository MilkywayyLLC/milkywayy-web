import { Icon } from "../Icon";

/**
 * The booking's progress (UI rebuild, 17 Oct 2026): our own statuses as numbered circles on a
 * line, done ones checked, the current one dark. Same steps and labels as the old stepper.
 */
export function ProgressTracker({
  steps,
  now,
  note,
}: {
  steps: readonly string[];
  now: string;
  /** An open revision or the like, said in words under the line. */
  note?: string;
}) {
  const at = Math.max(0, steps.indexOf(now));
  return (
    <section className="pt-card pt-dt-progress" aria-labelledby="progress-h">
      <h2 id="progress-h" className="pt-h2">
        Progress
      </h2>
      <ol className="pt-dt-steps" aria-label={`Status: ${now}`}>
        {steps.map((s, i) => (
          <li
            key={s}
            data-state={i < at ? "done" : i === at ? "now" : "next"}
            aria-current={i === at ? "step" : undefined}
          >
            <span className="pt-dt-dot" aria-hidden="true">
              {i < at ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="pt-dt-label">{s}</span>
          </li>
        ))}
      </ol>
      {note && <p className="pt-meta pt-dt-note">{note}</p>}
    </section>
  );
}
