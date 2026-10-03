import { ProjectDetail } from "@/components/portal/ProjectViews";

export const metadata = { title: "Avatar video" };

/** One avatar video (§5.4): the brief, script approval, deliveries, revisions, messages. */
export default async function AvatarPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <ProjectDetail type="avatar" projectRef={ref} />;
}
