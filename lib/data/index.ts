/**
 * The only way components get editable content (guide §0, §18).
 *
 * Today every getter returns the seed data in `content/`. In Phase 5A the bodies switch to
 * cached Supabase reads tagged for `revalidateTag` (e.g. "pricing", "faqs:post-production"),
 * falling back to the same seed if the database is unreachable. Signatures stay the same, so
 * pages and components don't change.
 */
import { avatarHero, avatars } from "@/content/avatars";
import { beforeAfter } from "@/content/beforeAfter";
import { clients } from "@/content/clients";
import { faqs } from "@/content/faqs";
import { portfolio } from "@/content/portfolio";
import { otherPricing, propertyPricing } from "@/content/pricing";
import { reviews } from "@/content/reviews";
import { siteSettings } from "@/content/site";
import { statOrderByPlacement, stats } from "@/content/stats";
import type { PageKey, PortfolioPlacement, Publishable, StatPlacement } from "@/content/types";

const live = <T extends Publishable>(rows: T[]) =>
  rows.filter((r) => r.published).sort((a, b) => a.sortOrder - b.sortOrder);

export async function getSiteSettings() {
  return siteSettings;
}

export async function getClients() {
  return live(clients);
}

export async function showsProofStrip(page: PageKey) {
  return siteSettings.proofStripPages.includes(page);
}

export async function getStats(placement: StatPlacement) {
  const order = statOrderByPlacement[placement];
  return live(stats)
    .filter((s) => s.placements.includes(placement))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map((s) => ({ ...s, label: s.labelByPlacement?.[placement] ?? s.label }));
}

export async function getFaqs(page: PageKey) {
  return live(faqs).filter((f) => f.page === page);
}

export async function getReviews(page: PageKey) {
  return live(reviews).filter((r) => r.placements.includes(page));
}

export async function getPortfolio(placement?: PortfolioPlacement) {
  const rows = live(portfolio);
  if (!placement) return rows;
  const pos = (p: (typeof rows)[number]) => p.placementOrder?.[placement] ?? p.sortOrder;
  return rows.filter((p) => p.placements.includes(placement)).sort((a, b) => pos(a) - pos(b));
}

export async function getBeforeAfter() {
  return live(beforeAfter);
}

export async function getAvatarHero() {
  return avatarHero;
}

export async function getAvatars() {
  return live(avatars);
}

export async function getPropertyPricing() {
  return propertyPricing;
}

export async function getOtherPricing() {
  return otherPricing;
}
