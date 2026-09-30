import { Children, Fragment, isValidElement, type CSSProperties, type ReactNode } from "react";
import { buttonWidth } from "@/lib/buttonWidth";
import { nodeText } from "@/lib/nodeText";

/**
 * A row of CTA buttons. On phones (≤ 600px) the buttons share the full width in equal columns, or
 * stack full width when the longest label can't fit in an equal share (guide rule, owner 1 Oct 2026).
 * The longest label is measured here, on the server, and handed to CSS as --btn-min, so the layout
 * is decided before first paint: no JavaScript and no layout shift.
 * `extraLabels` covers buttons whose text isn't in their props (e.g. a toggle's other state).
 */
/** Buttons passed in, looking through fragments (<CTABand actions={<>…</>} />). */
function buttons(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) =>
    isValidElement(c) && c.type === Fragment
      ? buttons((c.props as { children?: ReactNode }).children)
      : [c],
  );
}

export function Ctas({
  children,
  extraLabels = [],
  style,
}: {
  children: ReactNode;
  extraLabels?: string[];
  style?: CSSProperties;
}) {
  const labels = [...buttons(children).map(nodeText), ...extraLabels];
  const min = Math.max(...labels.map((l) => buttonWidth(l.trim())));
  return (
    <div className="ctas" style={{ ["--btn-min" as string]: `${min}px`, ...style }}>
      {children}
    </div>
  );
}
