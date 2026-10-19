import { ProjectDetail } from "@/components/portal/ProjectViews";

export const metadata = { title: "Batch" };

/** One batch (§5.3): status, files in, deliveries, revisions, approve, activity, messages. */
export default async function BatchPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <ProjectDetail type="edit" projectRef={ref} />;
}
