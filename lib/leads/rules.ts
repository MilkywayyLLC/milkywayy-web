/**
 * Lead rules shared by the forms (instant inline errors) and /api/lead (the real gate), with no
 * dependencies so the browser bundle stays small. Messages say how to fix the problem (§9.4).
 */
import { toE164 } from "./phone";

export type LeadType = "production" | "property" | "post" | "avatars" | "contact" | "free-test";
export type Reply = "WhatsApp" | "Email" | "Call";
export const REPLIES: Reply[] = ["WhatsApp", "Email", "Call"];

/** What a form sends. `fields` holds the form-specific answers. */
export interface LeadValues {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  preferred_reply?: Reply;
  fields: Record<string, string | string[]>;
}

export type LeadErrors = Partial<Record<string, string>>;

export const SERVICE_LABELS: Record<string, string> = {
  production: "Production",
  "post-production": "Post-production",
  "ai-avatars": "AI avatars",
};
export const AVATAR_USES = ["Real estate", "Clinic", "Personal brand", "Other"] as const;
export const EDIT_KINDS: Record<string, string> = {
  photo: "Photo edits",
  short: "Short-form",
  long: "Long-form",
};
export const EDITORS_NOW = ["In-house", "Freelancer", "Nobody yet"] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isPhone = (s: string) => toE164(s) !== null;
export const isEmail = (s: string) => EMAIL.test(s.trim());
const isUrl = (s: string) => {
  try {
    return /^https?:$/.test(new URL(s.trim()).protocol);
  } catch {
    return false;
  }
};
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

const MAX: Record<string, number> = {
  name: 120,
  company: 120,
  brief: 2000,
  volume: 1000,
  use_other: 200,
  link: 500,
};

export function checkLead(type: LeadType, v: LeadValues): LeadErrors {
  const e: LeadErrors = {};
  const name = (v.name ?? "").trim();
  const phone = (v.phone ?? "").trim();
  const email = (v.email ?? "").trim();
  const reply = v.preferred_reply;

  if (phone && !isPhone(phone))
    e.phone = "Check the number: digits only, with the country code (e.g. +971 50 123 4567).";
  if (email && !isEmail(email))
    e.email = "That email looks incomplete. Check for a typo (e.g. name@company.com).";

  if (type === "free-test") {
    if (!email) e.email = "Add your email so we can send the test and the call invite.";
    if (!list(v.fields.what).length)
      e.what = "Pick at least one: photo edits, short-form or long-form.";
    if (list(v.fields.what).some((w) => !(w in EDIT_KINDS)))
      e.what = "Pick from the options shown.";
    const link = str(v.fields.link);
    if (link && !isUrl(link)) e.link = "Paste the full link, starting with https://";
    if (str(v.fields.now) && !EDITORS_NOW.includes(str(v.fields.now) as never))
      e.now = "Pick one of the options.";
  } else if (type !== "property") {
    if (!name) e.name = "Add your name so we know who we're talking to.";
    if (reply && !REPLIES.includes(reply)) e.preferred_reply = "Pick how we should reply.";
    if (reply === "Email" && !email) e.email = "Add your email, or choose another way to reply.";
    else if (reply === "Call" && type !== "avatars" && !phone)
      e.phone = "Add a phone number for the call, or choose another way to reply.";
    else if (!phone && !email) e.phone = "Add a phone number or an email so we can reply.";
    if (type === "contact" && !(str(v.fields.service) in SERVICE_LABELS))
      e.service = "Pick the service you're asking about.";
    if (type === "avatars") {
      const use = str(v.fields.use);
      if (!AVATAR_USES.includes(use as never)) e.use = "Pick what the avatar is for.";
      if (use === "Other" && !str(v.fields.use_other))
        e.use_other = "Tell us in a few words what it's for.";
    }
  }

  for (const [k, max] of Object.entries(MAX)) {
    const val = k in v ? str((v as unknown as Record<string, string>)[k]) : str(v.fields[k]);
    if (val.length > max) e[k] = `Keep it under ${max} characters.`;
  }
  return e;
}

/**
 * The WhatsApp message a visitor sends after a form (written from their side; starts with the
 * ref so we can match it to the saved lead). The booking builder has its own (lib/booking).
 */
export function formMessage(type: LeadType, ref: string, v: LeadValues): string {
  const who = [v.name?.trim(), v.company?.trim() && `from ${v.company.trim()}`]
    .filter(Boolean)
    .join(" ");
  const use = str(v.fields.use) === "Other" ? str(v.fields.use_other) : str(v.fields.use);
  const about =
    type === "avatars"
      ? `an AI avatar demo${use ? ` (${use})` : ""}`
      : type === "free-test"
        ? "a free test edit"
        : (SERVICE_LABELS[str(v.fields.service)] ?? "Production");
  const brief = str(v.fields.brief);
  return [
    `Ref #${ref}`,
    `Hi Milkywayy, I'm ${who || "getting in touch"}. I sent a request about ${about} on your website.`,
    brief && (brief.length > 300 ? `${brief.slice(0, 297)}…` : brief),
  ]
    .filter(Boolean)
    .join("\n");
}
