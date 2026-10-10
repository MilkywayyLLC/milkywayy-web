import type { Membership } from "./auth";

export type Tab = { href: string; label: string; icon: string };

/**
 * Tabs (CLIENT_PORTAL_GUIDE §5.1; owner QA, 3 Oct 2026): Home, Shoots, Editing and Avatars for
 * everyone, so any client can start any service; Billing and Team for the Owner and Admins;
 * Contacts and Settings for everyone. Listings for everyone (Phase 13).
 */
export function portalTabs(m: Membership) {
  const manager = m.role === "owner" || m.role === "admin";
  const main: Tab[] = [
    { href: "/portal", label: "Home", icon: "home" },
    { href: "/portal/shoots", label: "Shoots", icon: "shoots" },
    { href: "/portal/editing", label: "Editing", icon: "editing" },
    { href: "/portal/avatars", label: "Avatars", icon: "avatars" },
    // Listings (Phase 13): everyone; agents make the share pages. Never shows our prices.
    { href: "/portal/listings", label: "Listings", icon: "listings" },
    // Inquiries (owner, 10 Oct 2026): everyone; a thread with Milkywayy, optionally about a shoot.
    { href: "/portal/inquiries", label: "Inquiries", icon: "chat" },
    // Billing (Phase 12): Owner and Admins only; Members never see prices.
    ...(manager ? [{ href: "/portal/billing", label: "Billing", icon: "billing" }] : []),
  ];
  const account: Tab[] = [
    ...(manager ? [{ href: "/portal/team", label: "Team", icon: "team" }] : []),
    { href: "/portal/contacts", label: "Contacts", icon: "contacts" },
    { href: "/portal/settings", label: "Settings", icon: "settings" },
  ];
  return { main, account };
}

export const isManager = (m: Membership) => m.role === "owner" || m.role === "admin";

/** "RH" from "Rania Haddad"; falls back to the first two letters of what we have. */
export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)
  ).toUpperCase();
};
