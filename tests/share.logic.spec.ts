import { expect, test } from "@playwright/test";
import { bedsFromSize, shareState } from "@/lib/portal/listings";
import { embedUrl, facts, isBot, price, whatsappLink } from "@/lib/share";

/** Share-page helpers (Phase 13): bot filter, video embeds, the facts line, links. */
test("people count; crawlers, preview fetchers, headless browsers and scripts don't", () => {
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ])
    expect(isBot(ua), ua).toBe(false);
  for (const ua of [
    null,
    "",
    "WhatsApp/2.24.6.77 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "curl/8.7.1",
    "python-requests/2.32.3",
  ])
    expect(isBot(ua), String(ua)).toBe(true);
});

test("YouTube and Vimeo links become privacy-friendly embeds; anything else doesn't", () => {
  expect(embedUrl("https://youtu.be/abc123XYZ")).toBe(
    "https://www.youtube-nocookie.com/embed/abc123XYZ?autoplay=1",
  );
  expect(embedUrl("https://www.youtube.com/watch?v=abc123XYZ&t=5")).toBe(
    "https://www.youtube-nocookie.com/embed/abc123XYZ?autoplay=1",
  );
  expect(embedUrl("https://youtube.com/shorts/abc123XYZ")).toBe(
    "https://www.youtube-nocookie.com/embed/abc123XYZ?autoplay=1",
  );
  // Unlisted Vimeo links carry a hash.
  expect(embedUrl("https://vimeo.com/123456789/abcdef1234")).toBe(
    "https://player.vimeo.com/video/123456789?autoplay=1&h=abcdef1234",
  );
  expect(embedUrl("https://example.com/video.mp4")).toBeNull();
  expect(embedUrl("not a url")).toBeNull();
});

test("price, facts, WhatsApp message, states, beds from the booking", () => {
  expect(price(6950000, "AED", "sale")).toBe("AED 6,950,000");
  expect(price(185000, "AED", "rent")).toBe("AED 185,000 / year");
  expect(price(950, "AED", "holiday")).toBe("AED 950 / night");
  expect(facts({ beds: "3", baths: 4, size_sqft: 2410, furnishing: "partly" })).toEqual([
    "3 Bed",
    "4 Bath",
    "2,410 sq ft",
    "Partly furnished",
  ]);
  expect(facts({ beds: "Studio", baths: 1.5 })).toEqual(["Studio", "1.5 Bath"]);
  const wa = whatsappLink(
    "+971 50 123 4567",
    "Marina loft",
    "https://milkywayy.com/l/marina-loft-ab12",
  );
  expect(wa).toBe(
    `https://wa.me/971501234567?text=${encodeURIComponent("Hi, I’m interested in Marina loft (https://milkywayy.com/l/marina-loft-ab12)")}`,
  );
  const today = "2026-10-03";
  expect(shareState({ status: "live", expires_on: null, disabled_at: null }, today)).toBe("live");
  expect(shareState({ status: "live", expires_on: "2026-10-03", disabled_at: null }, today)).toBe(
    "live",
  );
  expect(shareState({ status: "live", expires_on: "2026-10-02", disabled_at: null }, today)).toBe(
    "expired",
  );
  expect(shareState({ status: "paused", expires_on: null, disabled_at: "x" }, today)).toBe(
    "disabled",
  );
  expect(bedsFromSize("3 Bed")).toBe("3");
  expect(bedsFromSize("Studio")).toBe("Studio");
  expect(bedsFromSize("4 BR + Maid")).toBe("4");
  expect(bedsFromSize(undefined)).toBe("");
});
