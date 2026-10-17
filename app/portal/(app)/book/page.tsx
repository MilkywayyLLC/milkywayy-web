import { notFound, redirect } from "next/navigation";
import { BookingFlow, type BookingEdit } from "@/components/portal/booking/BookingFlow";
import { can } from "@/lib/portal/access";
import { requireAccount } from "@/lib/portal/auth";
import type { Slot } from "@/lib/portal/booking";
import type { Project } from "@/lib/portal/projects";
import { requestConfig } from "@/lib/portal/requests";

export const metadata = { title: "Book a shoot" };

/**
 * Book a shoot as a page (UI rebuild, 17 Oct 2026). `?edit=<ref>` reopens a Requested or Confirmed
 * shoot prefilled ("Edit details" / "Request a change"); `?draft=1` restores the saved draft.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; draft?: string }>;
}) {
  const q = await searchParams;
  const { db, current } = await requireAccount("/portal/book");
  if (!can(current, "shoots"))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include booking shoots</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const cfg = await requestConfig(db, current);

  let edit: BookingEdit | undefined;
  if (q.edit) {
    const { data } = await db
      .from("projects")
      .select("*")
      .eq("ref", q.edit)
      .eq("type", "shoot")
      .maybeSingle();
    if (!data) notFound();
    const p = data as Project;
    // Only before it's shot (the same rule as the shoot page's change buttons).
    if (p.status !== "requested" && p.status !== "confirmed")
      redirect(`/portal/shoots/${encodeURIComponent(p.ref)}`);
    const booking = p.meta.booking;
    const slotKey = (p.slot ?? "").toLowerCase().replace(" ", "_") as Slot | "";
    edit = {
      projectId: p.id,
      ref: p.ref,
      status: p.status,
      date: p.shoot_date ?? "",
      slot: ["morning", "afternoon", "full_day"].includes(slotKey) ? slotKey : "",
      startTime: booking?.start_time ?? "",
      location: booking?.location ?? {
        address: [p.meta.building, p.meta.area].filter(Boolean).join(", "),
        unit: p.meta.unit,
      },
      services: booking?.services ?? [],
      note: booking?.note ?? "",
    };
  }

  return <BookingFlow cfg={cfg} edit={edit} resume={q.draft === "1"} />;
}
