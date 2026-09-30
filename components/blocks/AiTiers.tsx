import type { ReactNode } from "react";
import type { OtherPricing } from "@/content/types";

/** AI avatar plans: structure only, "launch pricing" until prices are set (guide §6.5). */
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
            <span className="nm">{t.name}</span>
            <div className="pr">{t.cadence}</div>
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
