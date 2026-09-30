import { Ctas } from "@/components/ui/Ctas";
import type { ReactNode } from "react";
import { StaticChips } from "@/components/ui/ChipGroup";
import { formatNumber } from "@/lib/format";

/** "Packages from AED X a month." No tiers, no calculator, no discounts (guide §6.2). */
export function PackagesBand({
  fromMonthly,
  chips,
  actions,
}: {
  fromMonthly: number;
  chips: string[];
  actions: ReactNode;
}) {
  return (
    <div className="pk-band">
      <div className="stack" style={{ gap: 16 }}>
        <span className="eb">Packages</span>
        <h2 className="d h2">Packages from AED {formatNumber(fromMonthly)} a month.</h2>
        <p className="lede">
          Every package is built around your listings, volume and schedule. Tell us what you need
          and we&apos;ll put your plan together on a call, over WhatsApp or in person.
        </p>
      </div>
      <div className="stack" style={{ gap: 14, alignContent: "end" }}>
        <StaticChips items={chips} />
        <Ctas>{actions}</Ctas>
      </div>
    </div>
  );
}
