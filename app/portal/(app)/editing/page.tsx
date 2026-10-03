import { ProjectList } from "@/components/portal/ProjectViews";

export const metadata = { title: "Editing" };

/** Editing (§5.3): active batches, and Completed with search and "Ask about this project". */
export default async function Editing({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab, q } = await searchParams;
  return <ProjectList type="edit" tab={tab} q={q} />;
}
