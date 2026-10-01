import type { Metadata } from "next";
import { FreeTestSection } from "@/components/forms/FreeTestSection";
import { pageMetadata } from "@/lib/seo/meta";
import { PageLd } from "@/components/seo/JsonLd";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("free-test");
}

/** The free test form on its own (guide §3), for links from cold emails. */
export default function FreeTestPage() {
  return (
    <>
      <PageLd page="free-test" />
      <FreeTestSection headingLevel={1} />
    </>
  );
}
