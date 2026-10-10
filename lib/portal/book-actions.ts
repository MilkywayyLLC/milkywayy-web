"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPropertyPricing } from "@/lib/data";
import { requireAccount } from "./auth";
import {
  estimate,
  SERVICE_LABEL,
  serviceSummary,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type Rates,
  type Slot,
} from "./booking";
import { originFrom } from "./invite";
import { notifyMilkywayy } from "./notify";

/**
 * "Book a shoot" (owner, 10 Oct 2026): the client's request becomes a Requested shoot project;
 * Milkywayy is emailed and confirms the date and slot. The estimate is worked out here from the
 * client's own rates and the property price list (only for those who may see money).
 */
export type BookResult = { ok: boolean; error?: string; ref?: string };

const why = (m: string) =>
  /package clients/.test(m)
    ? "Booking here is for clients on a package. Book on the website instead."
    : /choose a date/.test(m)
      ? "Choose a date from today."
      : /time slot/.test(m)
        ? "Choose a time slot."
        : /add the location/.test(m)
          ? "Add the location."
          : /in the UAE/.test(m)
            ? "The pin must be in the UAE."
            : /at least one service/.test(m)
              ? "Add at least one service."
              : /https:\/\/ links/.test(m)
                ? "Reference links must start with https:// (5 at most per service)."
                : /too many/.test(m)
                  ? "That’s a lot at once. WhatsApp us and we’ll sort it out."
                  : "Couldn’t send the booking. Try again.";

export async function bookShoot(b: {
  date: string;
  slot: Slot;
  location: BookingLocation;
  services: BookingService[];
  note?: string;
}): Promise<BookResult> {
  const { db, current } = await requireAccount("/portal/shoots/book");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return { ok: false, error: "Choose a date." };
  if (!SLOTS.some(([k]) => k === b.slot)) return { ok: false, error: "Choose a time slot." };
  if (!b.location.address?.trim()) return { ok: false, error: "Add the location." };
  if (!b.services.length) return { ok: false, error: "Add at least one service." };
  const pricing = await getPropertyPricing();
  const { data: opts } = await db.rpc("my_booking_options", { p_account: current.account.id });
  const rates = (opts as { rates: Rates | null } | null)?.rates ?? null;
  const est = rates ? estimate(b.services, rates, pricing) : null;
  const services = b.services.map((s) => ({
    service: s.service,
    ...(s.service === "property" ? { property: s.property } : { qty: Math.round(s.qty ?? 1) }),
    ...(s.notes?.trim() ? { notes: s.notes.trim() } : {}),
    ...(s.links?.length ? { links: s.links.map((l) => l.trim()).filter(Boolean) } : {}),
  }));
  const loc: BookingLocation = {
    address: b.location.address.trim(),
    ...(b.location.lat != null && b.location.lng != null
      ? { lat: b.location.lat, lng: b.location.lng }
      : {}),
    ...(b.location.place_id ? { place_id: b.location.place_id } : {}),
    ...(b.location.unit?.trim() ? { unit: b.location.unit.trim() } : {}),
    ...(b.location.access?.trim() ? { access: b.location.access.trim() } : {}),
  };
  const { data, error } = await db.rpc("book_shoot", {
    p_account: current.account.id,
    p_date: b.date,
    p_slot: b.slot,
    p_location: loc,
    p_services: services,
    p_note: b.note?.trim() || null,
    p_estimate: est,
  });
  if (error) {
    console.error("[portal] book_shoot:", error.message);
    return { ok: false, error: why(error.message) };
  }
  const out = data as { id: string; ref: string };
  const origin = originFrom(await headers());
  const slot = SLOTS.find(([k]) => k === b.slot)![1];
  await notifyMilkywayy(
    out.id,
    "booking_requested",
    `Shoot requested: ${current.account.name} · ${b.date}`,
    [
      `${current.account.name} asked for a shoot on ${b.date} (${slot}).`,
      `Where: ${loc.address}${loc.unit ? ` · ${loc.unit}` : ""}`,
      ...b.services.map((s) => `${SERVICE_LABEL[s.service]}: ${serviceSummary(s, pricing)}`),
      ...(est != null
        ? [`Estimate at their rates: ${current.account.currency} ${est.toLocaleString("en-US")}`]
        : []),
      "Confirm the date and slot in the admin.",
    ],
    `${origin}/admin/projects/${out.id}`,
  ).catch((e) => console.error("[portal] booking alert:", e));
  revalidatePath("/portal/shoots");
  return { ok: true, ref: out.ref };
}
