import { notFound } from "next/navigation";
import { BookPage } from "@/components/portal/BookPage";
import type { BookingEdit, ShootKind } from "@/components/portal/BookingFlow";
import { can } from "@/lib/portal/access";
import { requireAccount } from "@/lib/portal/auth";
import { normalizeServices, type Slot } from "@/lib/portal/booking";
import type { Project } from "@/lib/portal/projects";
import { requestConfig } from "@/lib/portal/requests";

export const metadata = { title: "Book media" };

/**
 * Book media (owner, 18 Oct 2026): a page in the client dashboard instead of a modal. `?edit=REF`
 * changes a Requested or Confirmed shoot (Edit details / Request a change on the shoot page).
 */
export default async function BookMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; only?: string }>;
}) {
  const sp = await searchParams;
  const { db, current } = await requireAccount("/portal/book");
  const cfg = await requestConfig(db, current);
  if (!cfg.shoots && !cfg.editing) notFound();
  let edit: (BookingEdit & { kind: ShootKind }) | undefined;
  if (sp.edit) {
    if (!can(current, "shoots")) notFound();
    const { data } = await db
      .from("projects")
      .select("*")
      .eq("ref", sp.edit)
      .eq("type", "shoot")
      .maybeSingle();
    const p = data as Project | null;
    if (!p || (p.status !== "requested" && p.status !== "confirmed")) notFound();
    const booking = p.meta.booking;
    const slotKey = (p.slot ?? "").toLowerCase().replace(" ", "_") as Slot | "";
    const services = booking?.services ?? [];
    edit = {
      projectId: p.id,
      ref: p.ref,
      status: p.status as "requested" | "confirmed",
      date: p.shoot_date ?? "",
      slot: ["morning", "afternoon", "full_day"].includes(slotKey) ? slotKey : "",
      startTime: booking?.start_time ?? "",
      location: booking?.location ?? {
        address: [p.meta.building, p.meta.area].filter(Boolean).join(", "),
        unit: p.meta.unit,
      },
      services,
      note: booking?.note ?? "",
      // A booking with a property (or none) is a property shoot; videos alone, a content shoot.
      kind:
        normalizeServices(services).some((s) => s.service === "property") || !services.length
          ? "property"
          : "content",
    };
  }
  return <BookPage cfg={cfg} edit={edit} only={sp.only === "shoot" ? "shoot" : undefined} />;
}
