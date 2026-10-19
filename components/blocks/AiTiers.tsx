import type { ReactNode } from "react";
import type { OtherPricing } from "@/content/types";

/** "One-off" / "One-time" → ONE-TIME, "Monthly" → MONTHLY: the billing as a small tag. */
const billing = (cadence: string) =>
  /one[\s-]?(off|time)/i.test(cadence) ? "One-time" : cadence.trim() || "Monthly";

/**
 * AI avatar plans (owner, 3 Oct 2026): the plan's name is the big title and how it's billed a small
 * tag, so "Monthly" never reads as a plan name. Launch pricing until prices are set (guide §6.5).
 */
export function AiTiers({
  tiers,
  note,
  action,
}: {
  tiers: OtherPricing["aiAvatars"]["tiers"];
  note: string;
  action: (featured: boolean) => ReactNode;
}) {
  return (
    <>
      <div className="ai-tiers">
        {tiers.map((t, i) => (
          <div className={i === 1 ? "pcard feat" : "pcard"} key={t.name}>
            <span className="plan-tag">{billing(t.cadence)}</span>
            <h3 className="plan-name">{t.name}</h3>
            <ul>
              {t.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {action(i === 1)}
          </div>
        ))}
      </div>
      <p className="tnote">{note}</p>
    </>
  );
}
