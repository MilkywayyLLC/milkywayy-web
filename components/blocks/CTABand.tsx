import { Ctas } from "@/components/ui/Ctas";
import type { ReactNode } from "react";

/** Final call-to-action band: always champagne (never the footer colour); #222120 after a champagne section. */
export function CTABand({
  title,
  text,
  actions,
}: {
  title: string;
  text?: string;
  actions: ReactNode;
}) {
  return (
    <section className="band" aria-label="Get started">
      <div className="w band-in">
        <div>
          <h2 className="d h2">{title}</h2>
          {text && <p className="muted">{text}</p>}
        </div>
        <Ctas>{actions}</Ctas>
      </div>
    </section>
  );
}
