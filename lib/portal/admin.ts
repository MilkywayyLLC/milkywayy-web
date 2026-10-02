import { createClient } from "@supabase/supabase-js";
import { adminOrThrow, requireAdmin } from "@/lib/admin/auth";
import { portalKey, portalUrl } from "./supabase";

/**
 * Client accounts in the admin (CLIENT_PORTAL_GUIDE §7.1). Admins sign in on the website's
 * project; client accounts live in the portal's project (the dev project while Phase 9 is built).
 * So the admin reaches them through the portal_admin_* database functions, which need
 * PORTAL_ADMIN_SECRET (server-only, hash in the database) and log who acted. Only the Owner,
 * signed in with two-factor, gets here: the same rule as leads.
 */
export const portalAdminReady = () => !!(portalUrl && portalKey && process.env.PORTAL_ADMIN_SECRET);

const db = () =>
  createClient(portalUrl, portalKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function call<T>(actor: string, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(fn, {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_actor: actor,
    ...args,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}

/** For admin pages (redirects anyone who isn't the Owner). */
export async function portalAdminPage() {
  const a = await requireAdmin({ owner: true });
  return <T>(fn: string, args: Record<string, unknown> = {}) => call<T>(a.email, fn, args);
}

/** For admin server actions (throws instead of redirecting). */
export async function portalAdminAction() {
  const a = await adminOrThrow({ owner: true });
  return <T>(fn: string, args: Record<string, unknown> = {}) => call<T>(a.email, fn, args);
}

export type ClientListRow = {
  id: string;
  type: "individual" | "company";
  name: string;
  industry: string | null;
  industry_other: string | null;
  currency: "AED" | "USD";
  services_interest: string[];
  created_at: string;
  members: number;
  open_invites: number;
  bookings: number;
  owner: string | null;
  last_activity: string;
};

export type ClientDetail = {
  account: ClientListRow & {
    volume_note: string | null;
    trn: string | null;
    billing_address: string | null;
    member_visibility: "own" | "all";
    updated_at: string;
  };
  members: {
    user_id: string;
    role: string;
    joined: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    last_sign_in: string | null;
  }[];
  invites: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    created_at: string;
  }[];
  contacts: {
    name: string;
    role: string | null;
    whatsapp: string | null;
    email: string | null;
    brn: string | null;
    is_default: boolean;
  }[];
  bookings: {
    ref: string;
    booked_at: string;
    via: string;
    claimed_at: string;
    properties: {
      type: string;
      size: string;
      services: string[];
      area: string;
      building: string;
      unit?: string;
      date: string;
      slot: string;
      subtotal?: number;
    }[];
  }[];
  notes: string | null;
  notes_updated: { by: string; at: string } | null;
  log: { at: string; actor: string; action: string; detail: string | null }[] | null;
};
