import type { Metadata } from "next";
import { FreeTestSection } from "@/components/forms/FreeTestSection";

export const metadata: Metadata = {
  title: "Free Test Edit",
  description:
    "Book a free test edit: tell us what you need edited, book a 15-minute call, and we edit one listing (up to 10 photos) or one reel for free. No commitment.",
  alternates: { canonical: "/post-production/free-test" },
};

/** The free test form on its own (guide §3), for links from cold emails. */
export default function FreeTestPage() {
  return <FreeTestSection headingLevel={1} />;
}
