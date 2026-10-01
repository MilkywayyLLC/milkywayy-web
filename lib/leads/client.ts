import { capiContext } from "@/lib/tracking/events";
import type { LeadType, LeadValues } from "./rules";

/**
 * Browser side of a lead: where the visitor came from (captured once per visit, guide §9.1) and
 * the POST to /api/lead.
 */
const KEY = "mw-attr";
type Attribution = { utm: Record<string, string>; referrer?: string; landing?: string };

/** First page of the visit: keep UTM/click ids, the external referrer and the landing page. */
export function captureAttribution() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    for (const [k, v] of params)
      if (/^(utm_[a-z]+|gclid|fbclid|msclkid)$/.test(k) && v) utm[k] = v.slice(0, 200);
    const ref =
      document.referrer && new URL(document.referrer).origin !== location.origin
        ? document.referrer
        : undefined;
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ utm, referrer: ref, landing: location.pathname } satisfies Attribution),
    );
  } catch {}
}

function attribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "") as Attribution;
  } catch {
    return { utm: {} };
  }
}

export type SendResult =
  | { ok: true; ref: string; eventId: string; message?: string }
  | { ok: false; errors?: Record<string, string>; error: string };

export async function sendLead(
  type: LeadType,
  values: LeadValues,
  extra: { hp: string; elapsed: number; booking?: unknown },
): Promise<SendResult> {
  const a = attribution();
  const eventId = crypto.randomUUID();
  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        ...values,
        ...extra,
        page: location.pathname,
        landing: a.landing,
        referrer: a.referrer,
        utm: a.utm ?? {},
        eventId,
        ...capiContext(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ref) return { ok: true, ref: body.ref, eventId, message: body.message };
    return {
      ok: false,
      errors: body.errors,
      error:
        body.error ??
        (body.errors ? "Check the highlighted fields." : "We couldn't send that just now."),
    };
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again." };
  }
}

/** Read a form's answers: text fields as strings, checkbox groups as arrays. */
export function readForm(form: HTMLFormElement, multi: string[] = []) {
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const fields: Record<string, string | string[]> = {};
  for (const k of new Set(fd.keys()))
    if (
      ![
        "name",
        "company",
        "phone",
        "phone_country",
        "phone_dial",
        "email",
        "pref",
        "company_website",
      ].includes(k)
    )
      fields[k] = multi.includes(k) ? fd.getAll(k).map(String) : get(k);
  for (const k of multi) fields[k] ??= [];
  const values: LeadValues = {
    name: get("name") || undefined,
    company: get("company") || undefined,
    phone: get("phone") || undefined,
    phone_country: get("phone_country") || undefined,
    phone_dial: get("phone_dial") || undefined,
    email: get("email") || undefined,
    preferred_reply: (get("pref") || undefined) as LeadValues["preferred_reply"],
    fields,
  };
  return { values, hp: get("company_website") };
}

/** Cal.com booking page for the call, prefilled. NEXT_PUBLIC_CAL_LINK: "user/15min" or a full URL. */
export function calUrl(link: string, prefill: { name?: string; email?: string; notes?: string }) {
  const base = /^https?:\/\//.test(link) ? link : `https://cal.com/${link.replace(/^\/+/, "")}`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(prefill)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("theme", "light");
  return url.toString();
}
