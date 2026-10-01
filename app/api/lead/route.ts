import { createHmac } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import {
  buildMessage,
  normalize,
  priceLines,
  subtotal,
  title,
  total,
  validate as validateBooking,
  type BookingState,
} from "@/lib/booking";
import { addDays, dubaiToday, weekday } from "@/lib/booking/dates";
import { getPropertyPricing, getSiteSettings } from "@/lib/data";
import { e2eKey } from "@/lib/leads/e2e";
import { notifyLead } from "@/lib/leads/notify";
import { alert } from "@/lib/monitoring/alert";
import { sendCapi, trackingMode, type CapiResult } from "@/lib/tracking/capi";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";
import { checkLead, type LeadValues } from "@/lib/leads/rules";
import { leadRequest } from "@/lib/leads/schema";
import { leadStore, type Lead } from "@/lib/leads/store";

/**
 * POST /api/lead (guide §9.4, §11): every form and the booking builder.
 * Shape (zod) → spam checks → rules → for bookings, re-price on the server → save (issues the
 * ref) → respond { ref } → email/webhook after the response.
 *
 * Spam: a honeypot field, a minimum time to fill the form, and a per-visitor rate limit in the
 * database. Bots that trip the first two get a normal-looking reply and nothing is saved.
 */
export const runtime = "nodejs";

const MIN_FILL_MS = 2500;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const decoyRef = () => `MW-${1000 + Math.floor(Math.random() * 9000)}`;

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 100_000)
    return json({ error: "That's too much to send in one go." }, 413);
  const parsed = leadRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return json(
      { error: "Something in the form didn't come through. Refresh and try again." },
      400,
    );
  const r = parsed.data;

  if (r.hp || r.elapsed < MIN_FILL_MS) {
    console.warn(
      `[lead] dropped as spam (${r.hp ? "honeypot" : `filled in ${r.elapsed} ms`}) from ${r.page}`,
    );
    return json({ ref: decoyRef(), eventId: r.eventId });
  }

  // The dialling code comes from our own list, never from the browser.
  const country = COUNTRIES.find((c) => c.iso === r.phone_country) ?? DEFAULT_COUNTRY;
  const values: LeadValues = {
    name: r.name,
    company: r.company,
    phone: r.phone,
    phone_country: country.iso,
    phone_dial: country.dial,
    email: r.email,
    preferred_reply: r.preferred_reply,
    fields: r.fields as LeadValues["fields"],
  };
  const errors = checkLead(r.type, values);
  if (Object.keys(errors).length) return json({ errors }, 422);

  // Automated tests prove they hold LEAD_SECRET (an HMAC in x-e2e-key): their leads are flagged,
  // skip the rate limit and never email anyone.
  const isTest =
    !!process.env.LEAD_SECRET && req.headers.get("x-e2e-key") === e2eKey(process.env.LEAD_SECRET);
  let lines: Record<string, unknown>[] | undefined;
  // Stored in E.164 (CLIENT_PORTAL_GUIDE §12); what they typed is kept alongside if different.
  const phone = r.phone?.trim() ? toE164(r.phone, country) : null;
  const data: Record<string, unknown> = {
    ...r.fields,
    eventId: r.eventId,
    landing: r.landing,
    ...(isTest ? { test: true } : {}),
  };

  // Bookings: never trust the browser's prices. Re-check and re-price with today's prices, and
  // keep those prices with the lead (guide §18.3).
  if (r.type === "property") {
    if (!r.booking)
      return json({ error: "The booking didn't come through. Refresh and try again." }, 400);
    const [pricing, site] = await Promise.all([getPropertyPricing(), getSiteSettings()]);
    const state: BookingState = {
      nextId: r.booking.nextId,
      properties: r.booking.properties.map((p) => normalize(p, pricing)),
    };
    const bad = validateBooking(state);
    if (Object.keys(bad).length)
      return json({ error: "Some properties are missing details.", booking: bad }, 422);
    const today = dubaiToday(new Date());
    for (const p of state.properties) {
      const sizes = p.type === "commercial" ? pricing.commercial.tiers : pricing[p.type].sizes;
      const tooEarly = p.date < addDays(today, -1); // the page may be up to a day old at midnight
      const tooLate = p.date > addDays(today, site.booking.windowDays + 1);
      if (
        p.size >= sizes.length ||
        tooEarly ||
        tooLate ||
        site.booking.closedWeekdays.includes(weekday(p.date)) ||
        !site.booking.slots.includes(p.slot)
      )
        return json(
          {
            error: "A date, time or size is no longer available. Refresh the page and pick again.",
          },
          422,
        );
    }
    data.booking = state;
    // The database swaps {{REF}} for the reference it issues, so the saved message is final.
    data.message = buildMessage(state, pricing, "{{REF}}");
    data.estimate = {
      currency: "AED",
      total: total(state, pricing),
      properties: state.properties.map((p) => ({
        title: title(p, pricing),
        subtotal: subtotal(p, pricing),
        lines: priceLines(p, pricing),
      })),
    };
    // One structured row per property (booking_properties), for the client portal later.
    lines = state.properties.map((p, i) => ({
      line_no: i + 1,
      property_type: p.type,
      size_index: p.size,
      size_label:
        p.type === "commercial"
          ? pricing.commercial.tiers[p.size].label
          : pricing[p.type].sizes[p.size].label,
      services: [
        p.photo && "photo",
        p.video && p.short && "short",
        p.video && p.long && "long",
        p.tour && "tour",
      ].filter(Boolean),
      long_lighting: p.video && p.long ? p.lighting : null,
      add_ons: p.photo && p.twilight ? [{ key: "twilight", qty: p.twilightQty }] : [],
      area: p.area.trim(),
      building: p.building.trim(),
      unit: p.unit.trim() || null,
      shoot_date: p.date,
      slot: p.slot,
      subtotal: subtotal(p, pricing),
      price_lines: priceLines(p, pricing),
    }));
  }

  let message: string | undefined;
  const lead: Lead = {
    type: r.type,
    name: r.name?.trim() || undefined,
    company: r.company?.trim() || undefined,
    phone: phone ?? undefined,
    email: r.email?.trim().toLowerCase() || undefined,
    preferred_reply: r.type === "property" ? "WhatsApp" : r.preferred_reply,
    data,
    page: r.page,
    utm: r.utm,
    referrer: r.referrer || undefined,
    lines,
  };
  if (phone) {
    data.phone_country = country.iso;
    if (r.phone!.trim() !== phone) data.phone_entered = r.phone!.trim();
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHmac("sha256", process.env.LEAD_SECRET ?? "dev")
    .update(ip)
    .digest("hex")
    .slice(0, 32);

  let saved;
  try {
    saved = await leadStore().save(lead, ipHash, isTest ? 1000 : undefined);
  } catch (err) {
    console.error("[lead] save failed", err);
    after(() =>
      alert({
        kind: "lead not saved",
        message: err instanceof Error ? err.message : String(err),
        where: `/api/lead (${r.type} from ${r.page})`,
        detail: "The visitor saw an error and was offered WhatsApp/email instead.",
      }),
    );
    return json({ error: "We couldn't save that just now." }, 503);
  }
  if ("rateLimited" in saved)
    return json(
      { error: "Too many requests from here in a short time. Please WhatsApp us instead." },
      429,
    );

  if (typeof data.message === "string") {
    message = data.message.replace("{{REF}}", saved.ref);
    data.message = message;
  }
  const testMode = trackingMode() === "test";
  let capi: CapiResult | undefined;
  if (!saved.duplicate) {
    const origin = req.nextUrl.origin;
    if (!isTest) after(() => notifyLead(lead, saved.ref, origin));
    // Test mode: also for automated test leads, and the answer from Meta comes back in the
    // response so the setup can be checked without reading logs. Otherwise after the response.
    const event = () =>
      sendCapi({
        event: "Lead",
        eventId: saved.ref,
        url: `${origin}${r.page}`,
        email: lead.email,
        phone: lead.phone,
        ip: ip === "unknown" ? undefined : ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
        fbp: r.fbp,
        fbc: r.fbc,
        custom: {
          lead_type: r.type,
          ...(r.type === "property"
            ? { currency: "AED", value: (data.estimate as { total: number }).total }
            : {}),
        },
      });
    if (r.consent && testMode) capi = await event();
    else if (r.consent && !isTest) after(event);
  }
  return json({
    ref: saved.ref,
    eventId: r.eventId,
    message,
    ...(testMode && capi ? { capi } : {}),
  });
}
