/**
 * Phone numbers → E.164 (+971501234567), using the country the visitor picked in the phone
 * field. A number is never guessed to be a UAE number: it's either written internationally
 * (+44…, 0044…) or read with the chosen country's code (CLIENT_PORTAL_GUIDE §12).
 * No dependencies and no country list here, so forms stay light; the list is ./countries.
 */
export type Dial = { iso: string; dial: string };

export const DEFAULT_COUNTRY: Dial & { name: string } = {
  iso: "AE",
  name: "United Arab Emirates",
  dial: "971",
};

/** Shown first in the picker (owner, 2 Oct 2026). */
export const TOP_COUNTRIES = [
  DEFAULT_COUNTRY,
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "IN", name: "India", dial: "91" },
];

/** Countries whose national numbers keep the leading 0 after the country code. */
const KEEP_ZERO = new Set(["IT", "SM", "VA"]);
/** Countries whose domestic trunk prefix is 8 rather than 0. */
const TRUNK_EIGHT = new Set(["RU", "KZ", "BY", "LT"]);

export function toE164(raw: string, country: Dial = DEFAULT_COUNTRY): string | null {
  const s = raw.trim();
  if (!s || /[^\d\s()+.\-/]/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  let intl: string;
  if (s.startsWith("+")) intl = digits;
  else if (digits.startsWith("00")) intl = digits.slice(2);
  else {
    let national = digits;
    if (national.length >= 11 && national.startsWith(country.dial)) {
      // They typed the country code without the + (e.g. 971 50 123 4567).
      national = national.slice(country.dial.length);
    } else if (national.startsWith("0") && !KEEP_ZERO.has(country.iso))
      national = national.slice(1);
    else if (national.startsWith("8") && TRUNK_EIGHT.has(country.iso) && national.length === 11)
      national = national.slice(1);
    intl = country.dial + national;
  }
  return /^[1-9]\d{7,14}$/.test(intl) ? `+${intl}` : null;
}

/** 🇦🇪 from "AE" (shown as letters where the system has no flag emoji). */
export const flag = (iso: string) =>
  String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
