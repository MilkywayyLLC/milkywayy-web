/**
 * Phone numbers are stored in E.164 (+971501234567) on every lead and booking, so the client
 * portal can match people by number later (CLIENT_PORTAL_GUIDE §12). Most visitors are in the UAE,
 * so numbers without a country code are read as UAE numbers.
 *
 *   "+971 50 123 4567" → +971501234567    "00971501234567" → +971501234567
 *   "050 123 4567"     → +971501234567    "50 123 4567"    → +971501234567
 *   "+44 7700 900123"  → +447700900123    "447700900123"   → +447700900123
 */
export function toE164(raw: string, defaultCountry = "971"): string | null {
  const s = raw.trim();
  if (!s || /[^\d\s()+.\-]/.test(s)) return null;
  let digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountry + digits.slice(1);
  else if (digits.length === 9 && digits.startsWith("5")) digits = defaultCountry + digits;
  else if (digits.length < 10) digits = defaultCountry + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
