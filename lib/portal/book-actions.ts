"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPropertyPricing } from "@/lib/data";
import { can } from "./access";
import { requireAccount } from "./auth";
import {
  cleanVideos,
  clientPricing,
  estimate,
  estimateLines,
  normalizeServices,
  photosOnly,
  SERVICE_LABEL,
  serviceSummary,
  SLOTS,
  type BookingLocation,
  type BookingService,
  type Rates,
  type Slot,
} from "./booking";
import { portalAdminAs } from "./admin";
import { originFrom } from "./invite";
import { notifyMilkywayy } from "./notify";
import { applyMyChange } from "./payment-actions";
import { afterBooking, companyRates } from "./payment-server";
import { BOOKING_TERMS_VERSION } from "./payments";
import { whenLabel } from "./when";

/**
 * "Book a shoot" (owner, 10 Oct 2026): every client can book in the portal. The request becomes a
 * Requested shoot; Milkywayy is emailed "New booking request" (a 100% / 50% upfront one only once it's
 * paid or a bank receipt is uploaded: until then it's an "Awaiting payment" draft). The estimate is worked out here from
 * the client's own rates and the property price list (only for those who may see money).
 * Payment terms (owner, 24 Oct 2026): the Booking Terms must be accepted (stored with the version);
 * 100% / 50% clients get their invoice now and, with Stripe on, the payment page (paid = confirmed).
 */
export type BookResult = {
  ok: boolean;
  error?: string;
  ref?: string;
  /** Stripe Checkout for what's due now. */
  payUrl?: string | null;
  /** An invoice was issued (Stripe off: pay it by bank transfer from the shoot page). */
  invoice?: { number: string | null; amount: number; currency: string } | null;
};

const why = (m: string) =>
  /isn't enabled/.test(m)
    ? "Shoots aren’t part of your account yet. Message us to add them."
    : /include shoots/.test(m)
      ? "Your access doesn’t include booking shoots. Ask the account owner."
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

/** What the database stores: Photos (photos-only config) and Videos (counts, or a day). */
function cleanService(s: BookingService): BookingService | null {
  if (s.service === "property")
    return s.property ? { service: "property", property: photosOnly(s.property) } : null;
  if (s.service === "videos" && s.videos) {
    const videos = cleanVideos(s.videos);
    if (videos.by === "count" && !videos.short && !videos.long) return null;
    return { service: "videos", videos };
  }
  return null;
}
/** Today's shape only (an older booking is converted before it's edited), notes and links kept. */
const cleanServices = (list: BookingService[]) =>
  normalizeServices(list).flatMap((s) => {
    const c = cleanService(s);
    return c
      ? [
          {
            ...c,
            ...(s.notes?.trim() ? { notes: s.notes.trim() } : {}),
            ...(s.links?.length ? { links: s.links.map((l) => l.trim()).filter(Boolean) } : {}),
          },
        ]
      : [];
  });
const startTime = (t?: string) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

export async function bookShoot(b: {
  date: string;
  slot: Slot;
  location: BookingLocation;
  services: BookingService[];
  note?: string;
  /** Preferred start time (HH:MM), optional: scheduling only. */
  startTime?: string;
  /** The Agent (a contact id); empty leaves the database default (an agent's own card). */
  agent?: string | null;
  /** "I agree to the Booking Terms" (required). */
  termsAccepted?: boolean;
}): Promise<BookResult> {
  const { db, user, current } = await requireAccount("/portal/shoots");
  if (!can(current, "shoots"))
    return {
      ok: false,
      error: "Your access doesn’t include booking shoots. Ask the account owner.",
    };
  if (!b.termsAccepted) return { ok: false, error: "Tick “I agree to the Booking Terms” first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return { ok: false, error: "Choose a date." };
  if (!SLOTS.some(([k]) => k === b.slot)) return { ok: false, error: "Choose a time slot." };
  if (!b.location.address?.trim()) return { ok: false, error: "Add the location." };
  const services = cleanServices(b.services);
  if (!services.length) return { ok: false, error: "Add at least one service." };
  const pricing = await getPropertyPricing();
  const { data: opts } = await db.rpc("my_booking_options", { p_account: current.account.id });
  // Teammates without price access still book at the company's rates (server-side only).
  const rates = await companyRates<Rates>(
    current.account.id,
    (opts as { rates: Rates | null } | null)?.rates ?? null,
    `client:${user.email ?? user.id}`,
  );
  const est = rates ? estimate(services, rates, clientPricing(pricing, rates)) : null;
  const loc: BookingLocation = {
    address: b.location.address.trim(),
    ...(b.location.lat != null && b.location.lng != null
      ? { lat: b.location.lat, lng: b.location.lng }
      : {}),
    ...(b.location.place_id ? { place_id: b.location.place_id } : {}),
    ...(b.location.building?.trim() ? { building: b.location.building.trim() } : {}),
    ...(b.location.community?.trim() ? { community: b.location.community.trim() } : {}),
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
    p_start_time: startTime(b.startTime),
  });
  if (error) {
    console.error("[portal] book_shoot:", error.message);
    return { ok: false, error: why(error.message) };
  }
  const out = data as { id: string; ref: string };
  const { error: te } = await db.rpc("accept_booking_terms", {
    p_project: out.id,
    p_version: BOOKING_TERMS_VERSION,
  });
  if (te) console.error("[portal] accept_booking_terms:", te.message);
  if (b.agent) {
    // The database checks the contact is this account's and that you booked it.
    const { error: ae } = await db.rpc("set_project_agent", {
      p_project: out.id,
      p_contact: b.agent,
    });
    if (ae) console.error("[portal] set_project_agent:", ae.message);
  }
  const origin = originFrom(await headers());
  // What's due now by the client's term (an invoice, then Stripe if it's on).
  const pay =
    est != null && rates
      ? await afterBooking({
          rpc: portalAdminAs(`client:${user.email ?? user.id}`),
          projectId: out.id,
          ref: out.ref,
          type: "shoot",
          lines: estimateLines(services, rates, clientPricing(pricing, rates))
            .filter((l) => l.amount != null && l.amount > 0)
            .map((l) => ({
              description: l.label,
              qty: l.qty,
              unit_price: Math.round((Number(l.amount) / l.qty) * 100) / 100,
            })),
          estimate: est,
          email: user.email,
          origin,
          actor: `client:${user.email ?? user.id}`,
        })
      : { invoice: null, payUrl: null, held: false };
  // A 100% / 50% upfront shoot is held as a draft until paid: Milkywayy hears about it then.
  if (!pay.held)
    await notifyMilkywayy(
      out.id,
      "booking_requested",
      `New booking request: ${current.account.name} · ${b.date}`,
      [
        `${current.account.name} asked for a shoot on ${whenLabel(b.date, startTime(b.startTime), b.slot)}.`,
        `Where: ${loc.address}${loc.unit ? ` · ${loc.unit}` : ""}`,
        ...services.map((s) => `${SERVICE_LABEL[s.service]}: ${serviceSummary(s, pricing)}`),
        ...(est != null
          ? [`Estimate at their rates: ${current.account.currency} ${est.toLocaleString("en-US")}`]
          : []),
        "Confirm the date and time in the admin, or propose another time.",
      ],
      `${origin}/admin/projects/${out.id}`,
    ).catch((e) => console.error("[portal] booking alert:", e));
  // Sent: the booking draft goes.
  await db
    .from("portal_drafts")
    .delete()
    .eq("account_id", current.account.id)
    .eq("user_id", user.id)
    .eq("kind", "booking");
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    ref: out.ref,
    payUrl: pay.payUrl,
    // Teammates without price access never see amounts (they choose how to pay on the pay page).
    invoice:
      pay.invoice && can(current, "billing")
        ? { number: pay.invoice.number, amount: pay.invoice.amount, currency: pay.invoice.currency }
        : null,
  };
}

type BookingInput = Parameters<typeof bookShoot>[0];

/** Edit a Requested shoot, or ask to change a Confirmed one (back to Requested). Admin is told. */
export async function updateBooking(projectId: string, b: BookingInput): Promise<BookResult> {
  const { db, user, current } = await requireAccount("/portal/shoots");
  if (!can(current, "shoots"))
    return { ok: false, error: "Your access doesn’t include shoots. Ask the account owner." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return { ok: false, error: "Choose a date." };
  if (!SLOTS.some(([k]) => k === b.slot)) return { ok: false, error: "Choose a time slot." };
  if (!b.location.address?.trim()) return { ok: false, error: "Add the location." };
  const services = cleanServices(b.services);
  if (!services.length) return { ok: false, error: "Add at least one service." };
  const { data: before } = await db
    .from("projects")
    .select("ref, title, shoot_date, slot, meta")
    .eq("id", projectId)
    .maybeSingle();
  if (!before) return { ok: false, error: "You don’t have access to that shoot." };
  const moved =
    before.shoot_date !== b.date ||
    (before.meta?.booking?.start_time ?? "") !== (b.startTime ?? "");
  if (moved) {
    const { data: pay } = await db.rpc("my_project_payment", { p_project: projectId });
    const { data: t } = await db.rpc("my_payment_terms", { p_account: current.account.id });
    const startAt = (pay as { start?: string | null } | null)?.start;
    const free = Number((t as { cancel_free_hours?: number } | null)?.cancel_free_hours ?? 3);
    if (startAt && new Date(startAt).getTime() - Date.now() < free * 36e5)
      return {
        ok: false,
        error: `It’s less than ${free} hours before the shoot. Use “Reschedule” on the shoot page to see the fee first.`,
      };
  }
  const pricing = await getPropertyPricing();
  const { data: opts } = await db.rpc("my_booking_options", { p_account: current.account.id });
  // Teammates without price access still book at the company's rates (server-side only).
  const rates = await companyRates<Rates>(
    current.account.id,
    (opts as { rates: Rates | null } | null)?.rates ?? null,
    `client:${user.email ?? user.id}`,
  );
  const est = rates ? estimate(services, rates, clientPricing(pricing, rates)) : null;
  const loc: BookingLocation = {
    address: b.location.address.trim(),
    ...(b.location.lat != null && b.location.lng != null
      ? { lat: b.location.lat, lng: b.location.lng }
      : {}),
    ...(b.location.place_id ? { place_id: b.location.place_id } : {}),
    ...(b.location.building?.trim() ? { building: b.location.building.trim() } : {}),
    ...(b.location.community?.trim() ? { community: b.location.community.trim() } : {}),
    ...(b.location.unit?.trim() ? { unit: b.location.unit.trim() } : {}),
    ...(b.location.access?.trim() ? { access: b.location.access.trim() } : {}),
  };
  const { data, error } = await db.rpc("update_booking", {
    p_project: projectId,
    p_date: b.date,
    p_slot: b.slot,
    p_location: loc,
    p_services: services,
    p_note: b.note?.trim() || null,
    p_estimate: est,
    p_start_time: startTime(b.startTime),
  });
  if (error) {
    console.error("[portal] update_booking:", error.message);
    return {
      ok: false,
      error: /changed any more/.test(error.message)
        ? "This shoot can’t be changed any more. Send us a message instead."
        : why(error.message),
    };
  }
  const out = data as { ref: string; was: string; note: string };
  // What changed, for the email.
  const old = (
    before.meta as {
      booking?: { location?: BookingLocation; services?: BookingService[]; note?: string };
    }
  ).booking;
  const svc = (list: BookingService[] | undefined) =>
    normalizeServices(list ?? [])
      .map((s) => `${SERVICE_LABEL[s.service]}: ${serviceSummary(s, pricing)}`)
      .join("; ");
  const changes = [
    before.shoot_date !== b.date ? `Date: ${before.shoot_date ?? "—"} → ${b.date}` : "",
    (before.meta?.booking?.start_time ?? "") !== (b.startTime ?? "")
      ? `Start time: ${before.meta?.booking?.start_time ?? "—"} → ${b.startTime || "—"}`
      : "",
    (old?.location?.address ?? "") !== loc.address
      ? `Location: ${old?.location?.address ?? "—"} → ${loc.address}`
      : "",
    (old?.location?.unit ?? "") !== (loc.unit ?? "") ? `Unit: ${loc.unit ?? "—"}` : "",
    (old?.location?.access ?? "") !== (loc.access ?? "")
      ? `Access notes: ${loc.access ?? "—"}`
      : "",
    svc(old?.services) !== svc(services)
      ? `Services: ${svc(old?.services) || "—"} → ${svc(services)}`
      : "",
    (old?.note ?? "") !== (b.note?.trim() ?? "") ? `Notes: ${b.note?.trim() || "—"}` : "",
  ].filter(Boolean);
  await notifyMilkywayy(
    projectId,
    "booking_changed",
    `Booking changed: ${current.account.name} · ${out.ref}`,
    [
      `${current.account.name} ${out.was === "confirmed" ? "asked to change a confirmed shoot (it’s back to Requested; confirm it again)" : "edited a requested shoot"}: ${out.ref}.`,
      ...(changes.length ? changes : ["No visible change."]),
    ],
    `${originFrom(await headers())}/admin/projects/${projectId}`,
  ).catch((e) => console.error("[portal] booking change alert:", e));
  revalidatePath("/portal", "layout");
  return { ok: true, ref: out.ref };
}

/**
 * Cancel a Requested or Confirmed shoot (payment terms, 24 Oct 2026): free more than 3 hours before,
 * else the late fee; refunds follow. The dialog shows the quote first (quoteMyChange).
 */
export async function cancelBooking(projectId: string): Promise<BookResult> {
  const r = await applyMyChange(projectId, "cancel");
  return { ok: r.ok, error: r.error };
}
