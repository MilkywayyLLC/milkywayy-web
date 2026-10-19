import { can } from "./access";
import type { Membership } from "./auth";

export type Tab = { href: string; label: string; icon: string };

/**
 * Tabs (CLIENT_PORTAL_GUIDE §5.1; owner, 10 Oct 2026): each area only for those whose access
 * includes it (the Owner and Admins see all). Billing for "Billing and prices", Team for
 * "Manage team"; Inquiries, Contacts and Settings for everyone.
 */
export function portalTabs(m: Membership) {
  const main: Tab[] = [
    { href: "/portal", label: "Home", icon: "home" },
    ...(can(m, "shoots") ? [{ href: "/portal/shoots", label: "Shoots", icon: "shoots" }] : []),
    ...(can(m, "editing") ? [{ href: "/portal/editing", label: "Editing", icon: "editing" }] : []),
    ...(can(m, "avatars") ? [{ href: "/portal/avatars", label: "Avatars", icon: "avatars" }] : []),
    ...(can(m, "listings")
      ? [{ href: "/portal/listings", label: "Listings", icon: "listings" }]
      : []),
    { href: "/portal/inquiries", label: "Inquiries", icon: "chat" },
    ...(can(m, "billing") ? [{ href: "/portal/billing", label: "Billing", icon: "billing" }] : []),
  ];
  const account: Tab[] = [
    ...(can(m, "team") ? [{ href: "/portal/team", label: "Team", icon: "team" }] : []),
    ...(can(m, "listings")
      ? [{ href: "/portal/contacts", label: "Contacts", icon: "contacts" }]
      : []),
    { href: "/portal/settings", label: "Settings", icon: "settings" },
  ];
  return { main, account };
}

/** Manages the team and the company details (Owner, Admins, or "Manage team"). */
export const isManager = (m: Membership) => can(m, "team");
/** Sees billing and prices (Owner, Admins, or "Billing and prices"). */
export const seesMoney = (m: Membership) => can(m, "billing");

/** "RH" from "Rania Haddad"; falls back to the first two letters of what we have. */
export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)
  ).toUpperCase();
};
