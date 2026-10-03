import type { Tone } from "@/content/types";
import { AppLink as Link } from "@/components/ui/AppLink";

/**
 * The brand logo (site-refine, 3 Oct 2026): light marks on dark pages, dark marks on light pages.
 * 2x images (356 × 44); width and height are set so nothing shifts while it loads.
 */
export function BrandLogo({ tone, className = "brand-logo" }: { tone: Tone; className?: string }) {
  const f = tone === "light" ? "logo-on-light" : "logo-on-dark";
  return (
    <picture>
      <source type="image/webp" srcSet={`/brand/${f}.webp`} />
      {}
      <img className={className} src={`/brand/${f}.png`} width={178} height={22} alt="Milkywayy" />
    </picture>
  );
}

export function Logo({ tone, onClick }: { tone: Tone; onClick?: () => void }) {
  return (
    <Link className="logo" href="/" aria-label="Milkywayy home" onClick={onClick}>
      <BrandLogo tone={tone} />
    </Link>
  );
}
