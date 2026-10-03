import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickContact, PickPhoto, PickVideo } from "@/components/portal/ListingForm";
import { presign, r2Ready } from "@/lib/r2";
import type { Account } from "./auth";
import { bedsFromSize, type ListingInput } from "./listings";
import type { Project } from "./projects";
import { initials } from "./shell";

const PROPERTY: Record<string, string> = {
  apartment: "Apartment",
  villa: "Villa",
  commercial: "Commercial",
};
const sign = (key: string | null) => (key && r2Ready() ? presign("GET", key, 3600) : null);

/**
 * Everything the create/edit form needs for one shoot: its delivered photos and web-ready videos,
 * the account's contacts, and the starting values: the listing being edited, else the details
 * saved to the property last time, else what the booking says.
 */
export async function listingFormData(
  db: SupabaseClient,
  account: Account,
  project: Project & { listing_defaults?: Partial<ListingInput> | null },
  editing?: Partial<ListingInput> & { permit_qr_key?: string | null },
) {
  const [{ data: files }, { data: cs }] = await Promise.all([
    db
      .from("project_files")
      .select("id, kind, source, url, label, r2_key, thumb_key, web_key, created_at")
      .eq("project_id", project.id)
      .eq("direction", "out")
      .order("delivery_no")
      .order("created_at"),
    db
      .from("contacts")
      .select("id, name, role, is_default")
      .eq("account_id", account.id)
      .order("is_default", { ascending: false })
      .order("name"),
  ]);
  const fs = files ?? [];
  const photos: PickPhoto[] = fs
    .filter((f) => f.kind === "photos" && f.source === "r2")
    .map((f) => ({ id: f.id, label: f.label, src: sign(f.thumb_key) }));
  const videos: PickVideo[] = fs
    .filter((f) => (f.kind === "reel" || f.kind === "long_form") && f.web_key)
    .map((f) => ({ id: f.id, label: f.label }));
  const contacts: PickContact[] = (cs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    initials: initials(c.name),
  }));
  const tour = fs.find((f) => f.kind === "tour" && f.source === "link")?.url ?? "";
  const m = project.meta;
  const fromBooking: ListingInput = {
    title: "",
    purpose: "sale",
    price: "",
    location: [m.building, m.area].filter(Boolean).join(", "),
    property_type: PROPERTY[m.property_type ?? ""] ?? m.property_type ?? "",
    beds: bedsFromSize(m.size),
    baths: "",
    size_sqft: "",
    furnishing: "",
    description: "",
    highlights: [],
    permit_no: "",
    permit_qr_key: "",
    contact_ids: contacts.slice(0, 1).map((c) => c.id),
    photo_ids: photos.map((p) => p.id),
    reel_id: videos[0]?.id ?? "",
    video_url: "",
    tour_url: tour,
    show_brand: true,
    expires_on: "",
  };
  const saved = editing ?? project.listing_defaults ?? {};
  const pick = <T>(v: T | null | undefined, d: T) => (v === null || v === undefined ? d : v);
  const s = saved as Partial<Record<keyof ListingInput, unknown>>;
  const str = (k: keyof ListingInput) =>
    s[k] === null || s[k] === undefined ? (fromBooking[k] as string) : String(s[k]);
  const known = new Set(photos.map((p) => p.id));
  const contactIds = new Set(contacts.map((c) => c.id));
  const initial: ListingInput = {
    title: str("title"),
    purpose: pick(s.purpose as ListingInput["purpose"], "sale"),
    price: str("price").replace(/\.00$/, ""),
    location: str("location"),
    property_type: str("property_type"),
    beds: str("beds"),
    baths: str("baths").replace(/\.0$/, ""),
    size_sqft: str("size_sqft"),
    furnishing: str("furnishing"),
    description: str("description"),
    highlights: pick(s.highlights as string[], []),
    permit_no: str("permit_no"),
    permit_qr_key: str("permit_qr_key"),
    contact_ids: ((s.contact_ids as string[] | undefined) ?? fromBooking.contact_ids).filter((id) =>
      contactIds.has(id),
    ),
    // Saved photos still delivered, in the saved order; or all of them.
    photo_ids: ((s.photo_ids as string[] | undefined) ?? fromBooking.photo_ids).filter((id) =>
      known.has(id),
    ),
    reel_id: videos.some((x) => x.id === s.reel_id)
      ? String(s.reel_id)
      : editing
        ? ""
        : fromBooking.reel_id,
    video_url: str("video_url"),
    tour_url: str("tour_url"),
    show_brand: pick(s.show_brand as boolean, true),
    expires_on: editing ? str("expires_on") : "",
  };
  if (!initial.contact_ids.length) initial.contact_ids = fromBooking.contact_ids;
  if (!initial.photo_ids.length) initial.photo_ids = fromBooking.photo_ids;
  const from = [
    project.ref,
    [m.unit && `Unit ${m.unit}`, m.building, m.area].filter(Boolean).join(", ") || project.title,
  ].join(" · ");
  return {
    initial,
    photos,
    videos,
    contacts,
    from,
    qrPreview: sign(initial.permit_qr_key || null),
    hasBrand: !!(account.brand_name || account.brand_logo_key || account.type === "company"),
  };
}
