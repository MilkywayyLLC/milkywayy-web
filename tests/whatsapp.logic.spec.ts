import { expect, test } from "@playwright/test";
import { siteSettings } from "@/content/site";
import { chatNumberProblem, pageWhatsappLink, TWILIO_NOTIFICATIONS_NUMBER } from "@/lib/whatsapp";

/** Chat links use the business number; the Twilio API number is notifications-only (owner, 2 Oct 2026). */
test("the seed's chat number is the business number and Site settings refuses the Twilio number", () => {
  expect(siteSettings.whatsapp.number).toBe("971507263306");
  expect(siteSettings.whatsapp.display).toBe("+971 50 726 3306");
  expect(chatNumberProblem("971507263306")).toBeNull();
  expect(chatNumberProblem(TWILIO_NOTIFICATIONS_NUMBER)).toMatch(/Twilio/);
  expect(chatNumberProblem("+971 50 726 3306")).toMatch(/Digits only/);
  expect(pageWhatsappLink("Home", "971507263306")).toBe(
    "https://wa.me/971507263306?text=Hi%20Milkywayy%2C%20I%20came%20from%20the%20Home%20page.",
  );
});
