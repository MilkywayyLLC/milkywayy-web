"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteObject, presign, r2Ready } from "@/lib/r2";
import { embedUrl } from "@/lib/share";
import { requireAccount } from "./auth";
import type { ListingInput } from "./listings";
import { isManager } from "./shell";

/**
 * Listing share pages and collections (§6), contact photos (§5.6) and the agent's branding.
 * Everyone in an account can make share pages from the shoots they see; save_listing() and
 * save_collection() check the shoot, photos and contacts. Uploads (permit QR, contact photo,
 * logo) go straight to R2 under the account's own folder, which the database enforces.
 */
export type ShareResult = {
  ok: boolean;
  error?: string;
  notice?: string;
  id?: string;
  slug?: string;
  url?: string;
  key?: string;
};

const why = (m: string): string =>
  /only delivered shoots/.test(m)
    ? "Share pages are for delivered shoots."
    : /a photo isn't from this shoot/.test(m)
      ? "One of the photos isn’t from this shoot. Refresh and choose again."
      : /choose at least one photo/.test(m)
        ? "Choose at least one photo."
        : /one or two of your contacts/.test(m)
          ? "Choose one or two contacts."
          : /video isn't ready/.test(m)
            ? "That video isn’t ready for share pages yet."
            : /highlight under 40/.test(m)
              ? "Keep each highlight under 40 characters."
              : /choose at least one listing/.test(m)
                ? "Choose at least one listing."
                : /isn't yours to add/.test(m)
                  ? "One of those listings isn’t yours to add."
                  : /not allowed/.test(m)
                    ? "You can only change share pages you made."
                    : /check constraint/.test(m)
                      ? "Something in that isn’t in the right format."
                      : "We couldn’t save that. Try again in a minute.";

const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const opt = (max: number) => z.string().trim().max(max);

const Listing = z.object({
  title: z.string().trim().min(3, "Add a title (3 characters or more).").max(120),
  purpose: z.enum(["sale", "rent", "holiday"]),
  price: z
    .string()
    .transform((s) => s.replace(/[,\s]/g, ""))
    .pipe(z.string().regex(/^\d{1,11}(\.\d{1,2})?$/, "Enter the price as a number."))
    .refine((s) => Number(s) > 0, "Enter the price as a number."),
  location: opt(160),
  property_type: opt(40),
  beds: opt(20),
  baths: z
    .string()
    .trim()
    .refine((s) => !s || (/^\d{1,2}(\.5)?$/.test(s) && Number(s) <= 50), "Check the bathrooms."),
  size_sqft: z
    .string()
    .transform((s) => s.replace(/[,\s]/g, ""))
    .refine((s) => !s || (/^\d{1,6}$/.test(s) && Number(s) > 0), "Enter the size in sq ft."),
  furnishing: z.enum(["", "furnished", "unfurnished", "partly"]),
  description: opt(4000),
  highlights: z
    .array(z.string().trim().min(1).max(40, "Keep each highlight under 40 characters."))
    .max(12, "Up to 12 highlights."),
  permit_no: z
    .string()
    .trim()
    .refine((s) => !s || /^[A-Za-z0-9-]{3,40}$/.test(s), "Check the permit number."),
  permit_qr_key: z.string(),
  contact_ids: z.array(z.uuid()).min(1, "Choose a contact.").max(2, "Up to 2 contacts."),
  photo_ids: z.array(z.uuid()).min(1, "Choose at least one photo.").max(80),
  reel_id: z.union([z.literal(""), z.uuid()]),
  video_url: z
    .string()
    .trim()
    .refine((s) => !s || !!embedUrl(s), "Paste a YouTube or Vimeo link."),
  tour_url: z
    .string()
    .trim()
    .refine((s) => !s || /^https:\/\/\S+$/.test(s), "Paste the tour link starting with https://"),
  show_brand: z.boolean(),
  expires_on: z
    .string()
    .refine(
      (s) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today()),
      "Pick a date from today on.",
    ),
});

const done = (r: ShareResult): ShareResult => {
  revalidatePath("/portal/listings", "layout");
  return r;
};

export async function saveListing(
  input: ListingInput,
  ids: { id?: string; project?: string },
): Promise<ShareResult> {
  const { db, current } = await requireAccount("/portal/listings");
  const parsed = Listing.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (v.permit_qr_key && !v.permit_qr_key.startsWith(`listings/${current.account.id}/`))
    return { ok: false, error: "Upload the QR code again." };
  const { data, error } = await db.rpc("save_listing", {
    p_id: ids.id ?? null,
    p_project: ids.project ?? null,
    p: { ...v, permit_no: v.permit_no || "", baths: v.baths, size_sqft: v.size_sqft },
  });
  if (error) {
    console.error("[portal] save listing:", error.code, error.message);
    return { ok: false, error: why(error.message) };
  }
  const out = data as { id: string; slug: string };
  return done({ ok: true, ...out, notice: ids.id ? "Saved." : "Link ready." });
}

export async function setShareStatus(
  kind: "l" | "c",
  id: string,
  status: "live" | "paused",
): Promise<ShareResult> {
  const { db } = await requireAccount("/portal/listings");
  const { error } = await db.rpc("set_share_status", { p_kind: kind, p_id: id, p_status: status });
  if (error) return { ok: false, error: why(error.message) };
  return done({ ok: true, notice: status === "live" ? "Live again." : "Paused." });
}

export async function deleteShare(kind: "l" | "c", id: string): Promise<ShareResult> {
  const { db } = await requireAccount("/portal/listings");
  const { data, error } = await db.rpc("delete_share", { p_kind: kind, p_id: id });
  if (error) return { ok: false, error: why(error.message) };
  if (typeof data === "string" && r2Ready()) await deleteObject(data).catch(() => undefined);
  return done({ ok: true, notice: "Deleted." });
}

const Collection = z.object({
  title: z.string().trim().min(3, "Add a title (3 characters or more).").max(120),
  note: opt(600),
  listing_ids: z.array(z.uuid()).min(1, "Choose at least one listing.").max(30),
  contact_ids: z.array(z.uuid()).min(1, "Choose a contact.").max(2, "Up to 2 contacts."),
  expires_on: z
    .string()
    .refine(
      (s) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today()),
      "Pick a date from today on.",
    ),
});

export async function saveCollection(
  input: z.input<typeof Collection>,
  id?: string,
): Promise<ShareResult> {
  const { db, current } = await requireAccount("/portal/listings");
  const parsed = Collection.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { data, error } = await db.rpc("save_collection", {
    p_id: id ?? null,
    p_account: current.account.id,
    p: parsed.data,
  });
  if (error) {
    console.error("[portal] save collection:", error.code, error.message);
    return { ok: false, error: why(error.message) };
  }
  return done({ ok: true, ...(data as { id: string; slug: string }), notice: "Saved." });
}

// ---------- small uploads: permit QR, contact photo, logo ----------

const IMAGE = /^image\/(png|jpeg|webp)$/;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const rand = () => randomBytes(6).toString("hex");

function signImage(key: string, type: string, size: number, maxMb: number): ShareResult {
  if (!r2Ready()) return { ok: false, error: "File storage isn’t set up here." };
  if (!IMAGE.test(type)) return { ok: false, error: "Use a PNG, JPG or WebP image." };
  if (size > maxMb * 1024 * 1024) return { ok: false, error: `Keep it under ${maxMb} MB.` };
  return { ok: true, key, url: presign("PUT", key, 600) };
}

/** The DLD permit's QR code, as an image, for one listing page. */
export async function qrUploadUrl(type: string, size: number): Promise<ShareResult> {
  const { current } = await requireAccount("/portal/listings");
  return signImage(
    `listings/${current.account.id}/qr-${rand()}.${EXT[type] ?? "png"}`,
    type,
    size,
    2,
  );
}

/** A contact's photo: the browser shrinks it to a small WebP first. */
export async function contactPhotoUrl(contactId: string): Promise<ShareResult> {
  const { db, current } = await requireAccount("/portal/contacts");
  const { data } = await db
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("account_id", current.account.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "That contact isn’t here any more." };
  return signImage(
    `contacts/${current.account.id}/${contactId}-${rand()}.webp`,
    "image/webp",
    0,
    1,
  );
}

export async function setContactPhoto(contactId: string, key: string | null): Promise<ShareResult> {
  const { db, current } = await requireAccount("/portal/contacts");
  if (
    key &&
    (!key.startsWith(`contacts/${current.account.id}/${contactId}-`) || key.includes(".."))
  )
    return { ok: false, error: "Upload the photo again." };
  const { data: before } = await db
    .from("contacts")
    .select("photo_url")
    .eq("id", contactId)
    .maybeSingle();
  const { data, error } = await db
    .from("contacts")
    .update({ photo_url: key })
    .eq("id", contactId)
    .select("id");
  if (error || !data?.length)
    return { ok: false, error: "You can only change contacts you added." };
  const old = before?.photo_url as string | null | undefined;
  if (old && old !== key && r2Ready()) await deleteObject(old).catch(() => undefined);
  revalidatePath("/portal/contacts");
  return { ok: true, notice: key ? "Photo saved." : "Photo removed." };
}

/** The company name and logo on share pages (Owner/Admins). */
export async function brandLogoUrl(type: string, size: number): Promise<ShareResult> {
  const { current } = await requireAccount("/portal/settings");
  if (!isManager(current)) return { ok: false, error: "Only the owner and admins can do that." };
  return signImage(
    `brands/${current.account.id}/logo-${rand()}.${EXT[type] ?? "png"}`,
    type,
    size,
    1,
  );
}

export async function saveBrand(name: string, logoKey: string | null): Promise<ShareResult> {
  const { db, current } = await requireAccount("/portal/settings");
  if (!isManager(current)) return { ok: false, error: "Only the owner and admins can do that." };
  const n = name.trim();
  if (n.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  if (logoKey && (!logoKey.startsWith(`brands/${current.account.id}/`) || logoKey.includes("..")))
    return { ok: false, error: "Upload the logo again." };
  const old = current.account.brand_logo_key ?? null;
  const { error } = await db
    .from("accounts")
    .update({ brand_name: n || null, brand_logo_key: logoKey })
    .eq("id", current.account.id);
  if (error) return { ok: false, error: "We couldn’t save that. Try again in a minute." };
  if (old && old !== logoKey && r2Ready()) await deleteObject(old).catch(() => undefined);
  revalidatePath("/portal", "layout");
  return { ok: true, notice: "Saved." };
}
