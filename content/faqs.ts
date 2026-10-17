import type { Faq, PageKey } from "./types";

/**
 * Draft FAQs from the mockup (guide §10). The owner writes the final set in the admin.
 * Edits agreed 30 Sep 2026: reels are 24–48h everywhere; removed "every service page has a
 * builder" (Home) and "retainer clients pay by card automatically" (Post-production).
 */

let n = 0;
const draft = (page: PageKey, question: string, answer: string): Faq => ({
  id: `${page}-${++n}`,
  page,
  question,
  answer,
  draft: true,
  published: true,
  sortOrder: n,
});

export const faqs: Faq[] = [
  draft(
    "home",
    "Where do you work?",
    "We shoot across the UAE, based in Dubai. Editing and AI avatars are fully remote, so we work with clients anywhere.",
  ),
  draft(
    "home",
    "How fast is delivery?",
    "Property photos in 24 hours. Reels in 24–48 hours. Monthly packages follow an agreed content calendar.",
  ),
  draft(
    "home",
    "How does pricing work?",
    "Every service page shows starting prices. The final quote is confirmed in chat or on a short call, before you pay anything.",
  ),
  draft(
    "home",
    "How do I start?",
    "Send a request or WhatsApp us. We reply within 15 minutes during working hours.",
  ),

  draft(
    "production",
    "How many revisions do I get?",
    "Two rounds of revisions per edit are included. Changes to the brief after shooting are quoted separately.",
  ),
  draft(
    "production",
    "What if I don't use all my shoot days?",
    "Unused shoot days can move to the next month once. We'll remind you mid-month so nothing is wasted.",
  ),
  draft(
    "production",
    "Who owns the footage?",
    "You do. Final edits and raw footage from your shoots are yours to use anywhere.",
  ),
  draft(
    "production",
    "Can I change package mid-contract?",
    "Yes. Your package can grow with your listings from any month.",
  ),

  draft(
    "property-shoots",
    "How should I prepare the property?",
    "Lights on, blinds open, surfaces clear, personal items away. We send a 5-point checklist when you book.",
  ),
  draft("property-shoots", "Can I reschedule?", "Yes, free up to 24 hours before the shoot."),
  draft("property-shoots", "Which areas do you cover?", "All of Dubai. Other emirates on request."),
  draft(
    "property-shoots",
    "What if the weather is bad?",
    "We move exterior shots to a clear day at no cost, or replace the sky in editing.",
  ),

  draft(
    "post-production",
    "Can you match our current editing style?",
    "Yes. Send 5–10 finished photos you like. We build a preset and a written style guide before your first batch.",
  ),
  draft(
    "post-production",
    "What file formats do you accept?",
    "RAW brackets (CR3, NEF, ARW, DNG), JPEG, and video in any common format. Deliverables in the size and naming you need.",
  ),
  draft("post-production", "How do payments work?", "We invoice monthly after a custom quote."),
  draft(
    "post-production",
    "Is the free test really free?",
    "Yes. After a 15-minute call we edit one listing (up to 10 photos) or one reel, free, so you can judge the quality.",
  ),

  draft(
    "ai-avatars",
    "Will people know it's AI?",
    "Most won't spot it. We still label AI content where platforms require it, such as Meta and TikTok, and we recommend being open about it.",
  ),
  draft(
    "ai-avatars",
    "Who owns the avatar?",
    "You do. The avatar is built for your brand and isn't reused for anyone else.",
  ),
  draft(
    "ai-avatars",
    "Can it speak Arabic?",
    "Yes. English and Arabic are supported, and other languages on request.",
  ),
  draft(
    "ai-avatars",
    "Can it look like me?",
    "Yes, with your consent and a short photo session we can build an avatar based on you.",
  ),
];
