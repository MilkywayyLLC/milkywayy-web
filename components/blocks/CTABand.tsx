import type { ReactNode } from "react";

/** Final call-to-action band: champagne on dark pages, black on light pages (guide §4.1). */
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
        <div className="ctas">{actions}</div>
      </div>
    </section>
  );
}
