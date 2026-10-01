import { publicDb } from "@/lib/supabase/public";
import type { LeadType, Reply } from "./rules";

/** A lead as it's saved (guide §11). `data` holds every answer, plus the booking and estimate. */
export interface Lead {
  type: LeadType;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  preferred_reply?: Reply;
  data: Record<string, unknown>;
  page: string;
  utm: Record<string, string>;
  referrer?: string;
}

export type SaveResult = { ref: string; duplicate?: boolean } | { rateLimited: true };

export interface LeadStore {
  /** `limit` overrides the per-visitor rate limit (only for verified test runs). */
  save(lead: Lead, ipHash: string, limit?: number): Promise<SaveResult>;
}

/**
 * Saves through the database's submit_lead() with LEAD_SECRET: the function can only add a lead,
 * so the site needs no service-role key (owner decision, 1 Oct 2026). It also issues the ref,
 * rate-limits per visitor and folds double taps into one lead.
 */
export class SupabaseLeadStore implements LeadStore {
  async save(lead: Lead, ipHash: string, limit?: number): Promise<SaveResult> {
    const db = publicDb();
    const secret = process.env.LEAD_SECRET;
    if (!db || !secret)
      throw new Error("Lead store not configured (Supabase URL/key or LEAD_SECRET).");
    const { data, error } = await db.rpc("submit_lead", {
      p_secret: secret,
      p_lead: lead,
      p_ip_hash: ipHash,
      p_limit: limit ?? Number(process.env.LEAD_RATE_LIMIT ?? 6),
      p_window_minutes: 10,
    });
    if (error) throw new Error(`submit_lead: ${error.message}`);
    if (data?.rate_limited) return { rateLimited: true };
    return { ref: data.ref, duplicate: !!data.duplicate };
  }
}

/** Local development without a database: prints the lead and invents a ref. */
export class ConsoleLeadStore implements LeadStore {
  async save(lead: Lead): Promise<SaveResult> {
    const ref = `MW-${9000 + Math.floor(Math.random() * 999)}`;
    console.info(`[lead] ${ref}`, JSON.stringify(lead, null, 2));
    return { ref };
  }
}

/** LEAD_STORE=supabase (default) or console. */
export function leadStore(): LeadStore {
  return process.env.LEAD_STORE === "console" ? new ConsoleLeadStore() : new SupabaseLeadStore();
}
