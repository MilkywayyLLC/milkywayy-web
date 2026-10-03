import type { Membership } from "./auth";

export type Tab = { href: string; label: string; icon: string };

/**
 * Tabs (CLIENT_PORTAL_GUIDE §5.1; owner QA, 3 Oct 2026): Home, Shoots, Editing and Avatars for
 * everyone, so any client can start any service. Listings and Billing are hidden until they're
 * built (Phases 12–13). Team for the Owner and Admins, Contacts and Settings for everyone.
 */
export function portalTabs(m: Membership) {
  const manager = m.role === "owner" || m.role === "admin";
  const main: Tab[] = [
    { href: "/portal", label: "Home", icon: "home" },
    { href: "/portal/shoots", label: "Shoots", icon: "shoots" },
    { href: "/portal/editing", label: "Editing", icon: "editing" },
    { href: "/portal/avatars", label: "Avatars", icon: "avatars" },
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
