import { ProjectDetail } from "@/components/portal/ProjectViews";

export const metadata = { title: "Batch" };

/** One batch (§5.3): status, files in, deliveries, revisions, approve, activity, messages. */
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ paid?: string; pay?: string }>;
}) {
  const { ref } = await params;
  const q = await searchParams;
  const banner = q.paid ? "paid" : q.pay ? "pay" : null;
  return <ProjectDetail type="edit" projectRef={ref} banner={banner} />;
}
