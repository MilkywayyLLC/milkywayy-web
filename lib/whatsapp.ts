/**
 * WhatsApp links. Every chat link uses the business chat number from Site settings
 * (+971 50 726 3306); there is no fallback number in code. The Twilio WhatsApp API number is for
 * notifications only and must never appear as a chat link (owner, 2 Oct 2026).
 */
export const TWILIO_NOTIFICATIONS_NUMBER = "971508305678";

/** wa.me link with a message written from the client's side (guide §5). */
export function whatsappLink(text: string, number: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Default page link: "Hi Milkywayy, I came from the {page} page." */
export function pageWhatsappLink(pageName: string, number: string) {
  return whatsappLink(`Hi Milkywayy, I came from the ${pageName} page.`, number);
}

/** Why a number can't be the chat number (Site settings validation), or null if it's fine. */
export function chatNumberProblem(n: string): string | null {
  if (!/^[1-9]\d{9,14}$/.test(n)) return "Digits only, with the country code (e.g. 971507263306).";
  if (n === TWILIO_NOTIFICATIONS_NUMBER)
    return "That's the Twilio notifications number. Chats must use the business WhatsApp number.";
  return null;
}
