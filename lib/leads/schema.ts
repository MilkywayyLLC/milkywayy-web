import { z } from "zod";

/**
 * Shape of a POST to /api/lead. zod checks the shape (types, lengths, known keys only); the
 * business rules (what's required, phone/email formats) live in ./rules so the forms share them.
 */
const s = (max: number) => z.string().max(max).optional();

const property = z.object({
  id: z.number().int().min(1).max(1000),
  type: z.enum(["apartment", "villa", "commercial"]),
  size: z.number().int().min(0).max(30),
  photo: z.boolean(),
  twilight: z.boolean(),
  twilightQty: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  video: z.boolean(),
  short: z.boolean(),
  long: z.boolean(),
  lighting: z.enum(["day", "night", "dayNight"]),
  tour: z.boolean(),
  area: z.string().max(120),
  building: z.string().max(120),
  unit: z.string().max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().max(30),
});

export const leadRequest = z.object({
  type: z.enum(["production", "property", "post", "avatars", "contact", "free-test"]),
  name: s(200),
  company: s(200),
  phone: s(60),
  /** ISO country of the phone field (its dialling code is looked up on the server). */
  phone_country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  email: s(300),
  preferred_reply: z.enum(["WhatsApp", "Email", "Call"]).optional(),
  fields: z
    .object({
      service: s(40),
      brief: s(4000),
      use: s(40),
      use_other: s(400),
      what: z.array(z.string().max(20)).max(3).optional(),
      volume: s(2000),
      now: s(40),
      country: s(60),
      link: s(1000),
      /** Free test: "calendar" (book a call) or "email" (send requirements instead). */
      path: z.enum(["calendar", "email"]).optional(),
    })
    .strict()
    .default({}),
  booking: z
    .object({ properties: z.array(property).min(1).max(10), nextId: z.number().int() })
    .optional(),
  page: z.string().max(200),
  landing: s(200),
  referrer: s(500),
  utm: z.record(z.string().max(40), z.string().max(200)).default({}),
  /** Honeypot: a hidden field people never see. Anything in it means a bot. */
  hp: z.string().max(500).default(""),
  /** Milliseconds between the form appearing and the submit. */
  elapsed: z.number().nonnegative(),
  /** Shared with the Pixel and the Conversions API (Phase 7) so the two are de-duplicated. */
  eventId: z.string().max(64),
  /** Tracking consent and Meta's browser cookies, for the Conversions API copy of the Lead. */
  consent: z.boolean().optional(),
  fbp: s(200),
  fbc: s(300),
});

export type LeadRequest = z.infer<typeof leadRequest>;
