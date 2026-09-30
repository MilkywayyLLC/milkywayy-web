import { FreeTestForm } from "./FreeTestForm";

/**
 * "See the quality first." Free test edit section (guide §6.4 item 10, §9.3). Used on
 * /post-production (h2) and on its own at /post-production/free-test (h1).
 * No turnaround promise here (guide §6.4 tone rules).
 */
export function FreeTestSection({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="sec alt" id="free-test" aria-labelledby="free-test-title">
      <div className="w formwrap">
        <div className="stack">
          <span className="eb">Free test edit</span>
          <Heading className="d h2" id="free-test-title">
            See the quality first.
          </Heading>
          <p className="lede">
            Tell us what you need, book a 15-minute call, and we&apos;ll edit a small test project
            for free.
          </p>
          <div className="direct">
            <div>
              <span>Test size</span>1 listing (up to 10 photos) or 1 reel
            </div>
            <div>
              <span>Commitment</span>None
            </div>
          </div>
        </div>
        <FreeTestForm />
      </div>
    </section>
  );
}
