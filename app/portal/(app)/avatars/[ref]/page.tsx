import { ProjectDetail } from "@/components/portal/ProjectViews";

export const metadata = { title: "Avatar video" };

/** One avatar video (§5.4): the brief, script approval, deliveries, revisions, messages. */
export default async function AvatarPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ edit?: string; revise?: string; paid?: string; pay?: string }>;
}) {
  const { ref } = await params;
  const q = await searchParams;
  const open = q.edit ? "edit" : q.revise ? "revise" : undefined;
  const banner = q.paid ? "paid" : q.pay ? "pay" : null;
  return <ProjectDetail type="avatar" projectRef={ref} open={open} banner={banner} />;
}
