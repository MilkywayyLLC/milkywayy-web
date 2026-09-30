import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** DM Mono label above headings, optionally led by the blinking REC dot. */
export function Eyebrow({
  children,
  rec,
  className,
}: {
  children: ReactNode;
  rec?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("eb", className)}>
      {rec && <i className="rec-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
