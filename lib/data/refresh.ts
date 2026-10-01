import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { pageNames } from "@/lib/pages";
import { getCaseStudies } from "./index";
import type { Tag } from "./tags";

/**
 * Called after every admin save (and by /api/revalidate). Two steps:
 *
 * 1. Mark the tags stale with the "max" profile. Stale, not expired: if the database read fails
 *    while refreshing, Next.js keeps the last version that loaded successfully instead of erroring
 *    (see lib/data/index.ts).
 * 2. After the response is sent, request every public page once. A stale page is served one last
 *    time and re-rendered in the background, so by the time anyone opens it the change is there.
 */
export function refresh(tags: readonly Tag[], origin: string) {
  for (const tag of tags) revalidateTag(tag, "max");
  after(async () => {
    const work = (await getCaseStudies().catch(() => [])).map((c) => `/work/${c.slug}`);
    const paths = [...Object.keys(pageNames), "/privacy", "/terms", ...work];
    await Promise.allSettled(
      paths.map((p) => fetch(new URL(p, origin), { cache: "no-store", headers: { "x-warm": "1" } })),
    );
  });
}
