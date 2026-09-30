import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Page section: vertical rhythm, optional alternate background (`--surface-2`). */
export function Section({
  alt,
  tight,
  className,
  children,
  ...rest
}: { alt?: boolean; tight?: boolean; children: ReactNode } & ComponentProps<"section">) {
  return (
    <section className={cx("sec", alt && "alt", tight && "tight", className)} {...rest}>
      {children}
    </section>
  );
}

/** Max-width content column with side gutters. */
export function Container({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("w", className)} {...rest}>
      {children}
    </div>
  );
}

/** Section heading row: eyebrow + h2 on the left, optional aside (lede, chips) on the right. */
export function SectionHead({
  eyebrow,
  title,
  aside,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="head">
      <div className="stack">
        <span className="eb">{eyebrow}</span>
        <h2 className="d h2" id={id}>
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

/** Headline highlight: champagne text on dark, champagne block on light. */
export function Hl({ children }: { children: ReactNode }) {
  return <span className="hl">{children}</span>;
}
