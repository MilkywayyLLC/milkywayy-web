/**
 * What a team member may do (owner, 10 Oct 2026). The Owner and Admins can do everything; a
 * member has an access set, chosen from a preset or custom. The database enforces the same rules
 * (private.member_can): billing tables, project areas, "all projects" and team management.
 */
export const PERMS = [
  ["shoots", "Shoots & bookings"],
  ["editing", "Editing"],
  ["avatars", "AI avatars"],
  ["listings", "Listings & contacts"],
  ["billing", "Billing and prices"],
  ["all_projects", "See all company projects"],
  ["team", "Manage team"],
] as const;
export type Perm = (typeof PERMS)[number][0];
export type Access = Partial<Record<Perm, boolean>> & { preset?: PresetKey };

export const PRESETS = {
  admin: {
    label: "Admin",
    hint: "Everything, including billing and the team",
    access: {
      shoots: true,
      editing: true,
      avatars: true,
      listings: true,
      billing: true,
      all_projects: true,
      team: true,
    },
  },
  finance: {
    label: "Finance",
    hint: "Billing and prices, and sees every project",
    access: {
      shoots: true,
      editing: true,
      avatars: true,
      listings: false,
      billing: true,
      all_projects: true,
      team: false,
    },
  },
  production: {
    label: "Production",
    hint: "Shoots, editing, avatars, listings and contacts; no prices",
    access: {
      shoots: true,
      editing: true,
      avatars: true,
      listings: true,
      billing: false,
      all_projects: true,
      team: false,
    },
  },
  custom: { label: "Custom", hint: "Choose exactly what they can use", access: {} },
} as const satisfies Record<string, { label: string; hint: string; access: Access }>;
export type PresetKey = keyof typeof PRESETS;

type Who = { role: "owner" | "admin" | "member"; access?: Access | null };

/** Whether this person may use that part of the account. */
export const can = (m: Who, perm: Perm) =>
  m.role === "owner" || m.role === "admin" || !!m.access?.[perm];

/** The preset an access set matches (Admin for Owner/Admin roles), else Custom. */
export function presetOf(m: Who): PresetKey {
  if (m.role === "owner" || m.role === "admin") return "admin";
  if (m.access?.preset && m.access.preset in PRESETS) return m.access.preset;
  for (const k of ["finance", "production"] as const)
    if (PERMS.every(([p]) => !!m.access?.[p] === !!PRESETS[k].access[p])) return k;
  return "custom";
}

/** The access set to store for a member: a preset's, or the custom toggles. */
export function accessFor(preset: PresetKey, custom: Access = {}): Access {
  const base: Access = preset === "custom" ? custom : PRESETS[preset].access;
  const out: Access = { preset };
  for (const [p] of PERMS) out[p] = !!base[p];
  return out;
}

/** The project type's area. */
export const AREA_OF = { shoot: "shoots", edit: "editing", avatar: "avatars" } as const;
