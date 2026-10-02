import type { Membership } from "./auth";

export type Tab = { href: string; label: string; icon: string };

/**
 * Tabs for this account (CLIENT_PORTAL_GUIDE §5.1): the services it uses or chose at
 * onboarding (a booking counts as using shoots), Listings with shoots, Billing and Team for the
 * Owner and Admins, Contacts and Settings for everyone.
 */
export function portalTabs(m: Membership, hasBookings: boolean) {
  const s = m.account.services_interest;
  const manager = m.role === "owner" || m.role === "admin";
  const shoots = hasBookings || s.includes("shoots") || s.includes("production");
  const main: Tab[] = [
    { href: "/portal", label: "Home", icon: "home" },
    ...(shoots ? [{ href: "/portal/shoots", label: "Shoots", icon: "shoots" }] : []),
    ...(s.includes("post") ? [{ href: "/portal/editing", label: "Editing", icon: "editing" }] : []),
    ...(s.includes("avatars")
      ? [{ href: "/portal/avatars", label: "Avatars", icon: "avatars" }]
      : []),
    ...(shoots ? [{ href: "/portal/listings", label: "Listings", icon: "listings" }] : []),
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
