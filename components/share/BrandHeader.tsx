/* eslint-disable @next/next/no-img-element -- a small logo from R2 (signed or public URL) */
/**
 * The creator's brand at the top of a share page (phase 1 part 12), in the layout they chose:
 *   logo       the logo alone (the name if there's no logo)
 *   icon_name  the logo small, with the name
 *   name       the name alone
 *   (none)     whatever exists: logo and name
 * Shared by the public page and the live preview in Settings, so the two never drift.
 */
export type BrandLayout = "logo" | "icon_name" | "name";

export function BrandHeader({
  name,
  logo,
  layout,
}: {
  name: string | null;
  logo: string | null;
  layout: BrandLayout | null;
}) {
  const showLogo = !!logo && layout !== "name";
  const showName = !!name && (layout !== "logo" || !logo);
  if (!showLogo && !showName) return null;
  return (
    <header className="sh-brand" data-layout={layout ?? "auto"}>
      {showLogo && (
        <img
          src={logo!}
          alt={showName ? "" : `${name ?? "Company"} logo`}
          className={layout === "icon_name" ? "sh-brand-icon" : "sh-brand-logo"}
        />
      )}
      {showName && <span className="sh-brand-name">{name}</span>}
    </header>
  );
}
