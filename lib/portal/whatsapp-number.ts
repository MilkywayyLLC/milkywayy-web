import { DEFAULT_COUNTRY, toE164 } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";

/**
 * The optional WhatsApp number from a PhoneField (onboarding, Settings): E.164, null when left
 * empty, false when it doesn't look like a number. Contact only: it never signs anyone in.
 */
export function whatsappFrom(form: FormData): string | null | false {
  const raw = String(form.get("phone") ?? "").trim();
  if (!raw) return null;
  const country = COUNTRIES.find((c) => c.iso === form.get("phone_country")) ?? DEFAULT_COUNTRY;
  return toE164(raw, country) ?? false;
}
