import { ProjectList } from "@/components/portal/ProjectViews";

export const metadata = { title: "Avatars" };

/** Avatars (§5.4): avatar videos, with script approval on each one. */
export default async function Avatars({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab, q } = await searchParams;
  return <ProjectList type="avatar" tab={tab} q={q} />;
}
