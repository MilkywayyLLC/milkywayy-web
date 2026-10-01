import type { SupabaseClient } from "@supabase/supabase-js";

/** Leads in the admin (Owner only, also enforced by RLS). */
export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_TYPES: Record<string, string> = {
  property: "Property shoot",
  production: "Production",
  contact: "Contact",
  avatars: "AI avatar demo",
  "free-test": "Free test edit",
  post: "Post-production",
};

export type LeadRow = {
  ref: string;
  type: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  preferred_reply: string | null;
  data: Record<string, unknown>;
  page: string | null;
  utm: Record<string, string>;
  referrer: string | null;
  status: LeadStatus;
  notes: string | null;
  call_booked_at: string | null;
  created_at: string;
};

export type LeadFilter = { q?: string; type?: string; status?: string };

export function queryLeads(db: SupabaseClient, f: LeadFilter, limit = 200) {
  let q = db
    .from("leads")
    .select(
      "ref, type, name, company, phone, email, preferred_reply, data, page, utm, referrer, status, notes, call_booked_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.type && f.type in LEAD_TYPES) q = q.eq("type", f.type);
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status))
    q = q.eq("status", f.status);
  const term = (f.q ?? "")
    .replace(/[^\p{L}\p{N}@.+\-\s]/gu, "")
    .trim()
    .slice(0, 60);
  if (term)
    q = q.or(
      ["name", "company", "email", "phone", "ref"].map((c) => `${c}.ilike.%${term}%`).join(","),
    );
  return q;
}

/** A short line describing what the lead asked for. */
export function leadSummary(l: LeadRow): string {
  const d = l.data;
  if (l.type === "property") {
    const est = d.estimate as { total?: number; properties?: { title: string }[] } | undefined;
    const n = est?.properties?.length ?? 0;
    return `${n} ${n === 1 ? "property" : "properties"}${est?.total ? ` · AED ${est.total.toLocaleString("en-US")} est.` : ""}`;
  }
  if (l.type === "avatars") return `For: ${d.use === "Other" ? d.use_other : d.use}`;
  if (l.type === "free-test")
    return `${((d.what as string[]) ?? []).join(", ")}${d.volume ? ` · ${d.volume}` : ""}`;
  return String(d.brief ?? d.service ?? "");
}

/** wa.me link to the lead's own number (digits only). */
export const waTo = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
