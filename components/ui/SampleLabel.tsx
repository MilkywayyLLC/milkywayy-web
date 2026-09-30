import type { ReactNode } from "react";

/** Dashed label marking sample or draft content (guide §0, §10). */
export function SampleLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={["sample", className].filter(Boolean).join(" ")}>{children}</span>;
}
