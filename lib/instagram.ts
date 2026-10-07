import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { instagramShortcode } from "@/lib/instagram-link";
import { portalKey, portalUrl } from "@/lib/portal/supabase";

/**
 * Our reels from @milkywayy.media, through the official Instagram API (Instagram API with
 * Instagram Login, permission instagram_business_basic). Server-only: the token never reaches a
 * browser, and the site never scrapes instagram.com or puts an Instagram CDN link in a page.
 *
 *   INSTAGRAM_ACCESS_TOKEN  the long-lived token (60 days) from the Meta app; the daily cron
 *                           refreshes it and keeps the newest in the database (migration
 *                           20261018090000_site_instagram.sql).
 *   INSTAGRAM_GRAPH_URL     optional; tests point it at a local mock of the API.
 */
const VERSION = "v23.0";
const graph = () =>
  (process.env.INSTAGRAM_GRAPH_URL || "https://graph.instagram.com").replace(/\/$/, "");
const envToken = () => process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || "";
const seed = (t: string) => createHash("sha256").update(t).digest("hex");

const storeReady = () => !!(portalUrl && portalKey && process.env.PORTAL_ADMIN_SECRET);
const store = () =>
  createClient(portalUrl, portalKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Stored = { token: string; expires_at: string | null; refreshed_at: string };

async function stored(): Promise<Stored | null> {
  const t = envToken();
  if (!t || !storeReady()) return null;
  try {
    const { data, error } = await store().rpc("site_instagram_token", {
      p_secret: process.env.PORTAL_ADMIN_SECRET,
      p_seed: seed(t),
    });
    return error ? null : ((data as Stored | null) ?? null);
  } catch {
    return null;
  }
}

export const instagramConfigured = () => !!envToken();

/** The newest token: the refreshed one if the cron has stored it, else the env var. */
export async function instagramToken() {
  return (await stored())?.token ?? (envToken() || null);
}

class IgError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, params: Record<string, string>, token?: string) {
  const t = token ?? (await instagramToken());
  if (!t) throw new IgError("Instagram isn’t connected (no token).", 0);
  const url = new URL(`${graph()}/${VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", t);
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new IgError("Instagram didn’t answer.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error)
    throw new IgError(body.error?.message ?? `Instagram said ${res.status}.`, res.status);
  return body;
}

/** Which account the token belongs to (admin status line). */
export async function instagramAccount(): Promise<
  { ok: true; username: string } | { ok: false; error: string }
> {
  if (!instagramConfigured()) return { ok: false, error: "not connected" };
  try {
    const me = await call<{ username?: string }>("me", { fields: "user_id,username" });
    return { ok: true, username: me.username ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

export type ReelMatch =
  | { state: "ours"; id: string; shortcode: string; video: boolean; thumbnail?: string }
  | { state: "other"; shortcode: string }
  | { state: "invalid" }
  | { state: "error"; message: string };

type IgMedia = {
  id: string;
  shortcode?: string;
  media_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
};

/**
 * Match a pasted reel link to our account's media (by shortcode, through /me/media). Not found
 * means another account's reel: it can only be a "View on Instagram ↗" link.
 */
export async function matchReel(link: string): Promise<ReelMatch> {
  const shortcode = instagramShortcode(link);
  if (!shortcode) return { state: "invalid" };
  if (!instagramConfigured())
    return { state: "error", message: "Instagram isn’t connected yet (INSTAGRAM_ACCESS_TOKEN)." };
  try {
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await call<{
        data?: IgMedia[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>("me/media", {
        fields: "id,shortcode,media_type,permalink,thumbnail_url",
        limit: "100",
        ...(after ? { after } : {}),
      });
      const hit = (r.data ?? []).find(
        (m) => m.shortcode === shortcode || m.permalink?.includes(`/${shortcode}`),
      );
      if (hit)
        return {
          state: "ours",
          id: hit.id,
          shortcode,
          video: hit.media_type === "VIDEO",
          thumbnail: hit.thumbnail_url,
        };
      after = r.paging?.next ? r.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return { state: "other", shortcode };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "Instagram failed." };
  }
}

export type ReelMedia = { mediaUrl: string; thumbnailUrl?: string; permalink?: string };

async function loadReel(id: string): Promise<ReelMedia> {
  const m = await call<IgMedia>(id, { fields: "media_type,media_url,thumbnail_url,permalink" });
  if (!m.media_url || m.media_type !== "VIDEO") throw new IgError("Not a video.", 400);
  return { mediaUrl: m.media_url, thumbnailUrl: m.thumbnail_url, permalink: m.permalink };
}

export const reelTag = (id: string) => `ig:${id}`;
export const IG_ID = /^\d{1,40}$/;

/**
 * One of our reels, fetched server-side and cached for 30 minutes: Instagram's media_url expires,
 * so the cache refreshes well before it does (and the video route refreshes early on a 403).
 * A failure isn't cached, so a broken reel is retried on the next render. Null = can't play.
 */
export async function reelMedia(id: string): Promise<ReelMedia | null> {
  if (!IG_ID.test(id) || !instagramConfigured()) return null;
  try {
    return await unstable_cache(() => loadReel(id), ["ig-reel", id], {
      revalidate: 1800,
      tags: [reelTag(id)],
    })();
  } catch {
    return null;
  }
}

/** Fresh, uncached (the video route after Instagram refused a cached link). */
export const reelMediaFresh = (id: string) => loadReel(id).catch(() => null);

/* ---------- token refresh (daily cron) ---------- */

const DAY = 864e5;

/**
 * Refresh the long-lived token once a week (Instagram allows it once a token is 24 hours old;
 * each refresh gives another 60 days), and keep the newest in the database. Without the
 * database store the env token is used as is and must be replaced in Vercel before it expires.
 */
export async function refreshInstagramToken(now = Date.now()) {
  const t = envToken();
  if (!t) return { skipped: "not connected" };
  if (!storeReady()) return { skipped: "no token store" };
  const row = await stored();
  if (row && now - Date.parse(row.refreshed_at) < 7 * DAY) return { skipped: "fresh" };
  const current = row?.token ?? t;
  const url = new URL(`${graph()}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", current);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !body.access_token)
    return { error: body.error?.message ?? `Instagram said ${res.status}` };
  const { error } = await store().rpc("site_instagram_token_save", {
    p_secret: process.env.PORTAL_ADMIN_SECRET,
    p_seed: seed(t),
    p_token: body.access_token,
    p_expires_at: body.expires_in ? new Date(now + body.expires_in * 1000).toISOString() : null,
  });
  if (error) return { error: error.message };
  return { refreshed: true, expiresInDays: Math.round((body.expires_in ?? 0) / 86400) };
}

/** Admin status: connected account and when the token runs out (if known). */
export async function instagramStatus() {
  if (!instagramConfigured()) return { connected: false as const };
  const [account, row] = await Promise.all([instagramAccount(), stored()]);
  return {
    connected: true as const,
    account,
    expiresAt: row?.expires_at ?? null,
    refreshedAt: row?.refreshed_at ?? null,
  };
}
