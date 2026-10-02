/**
 * Portal switches. Phone sign-in (WhatsApp/SMS codes via Twilio Verify) is built but off: the
 * owner chose email-only sign-in (3 Oct 2026). Set NEXT_PUBLIC_PORTAL_PHONE_SIGNIN=on to bring
 * it back (the Supabase Phone provider must be on too). For codes in English, also turn on the
 * Send SMS hook described in DECISIONS.md ("Sign-in codes in English").
 */
export const phoneSignIn = process.env.NEXT_PUBLIC_PORTAL_PHONE_SIGNIN === "on";
