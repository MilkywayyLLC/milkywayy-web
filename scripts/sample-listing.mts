/**
 * A sample listing share page in the DEV portal database and DEV R2 bucket (Phase 13), for
 * looking at /l/<slug> on a phone and for Lighthouse. Never run against production.
 *
 *   node --env-file=.env.local scripts/sample-listing.mts
 *
 * Makes (or reuses) a demo client "Milkywayy Demo Realty" owned by e2e-portal-demo-sample@
 * example.com, a delivered shoot with 8 generated photos at camera size (so the page weighs what
 * a real one does), the web versions the admin's browser would make, a contact, and a live
 * listing. Prints the slug. Running it again replaces the listing (with a new demo shoot).
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { presign, r2Ready } from "../lib/r2.ts";

const URL_ = process.env.NEXT_PUBLIC_PORTAL_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_PORTAL_SUPABASE_ANON_KEY!;
const ADMIN = process.env.PORTAL_ADMIN_SECRET!;
const E2E = process.env.E2E_PORTAL_SECRET!;
if (!URL_ || !KEY || !ADMIN || !E2E || !r2Ready()) throw new Error("Portal and R2 values missing");
if (!/kebewumaxywroewopssd/.test(URL_)) throw new Error("Dev portal project only");

const EMAIL = "e2e-portal-demo-sample@example.com";
const PASSWORD = "Portal-e2e-pass-2026";
const anon = createClient(URL_, KEY, { auth: { persistSession: false } });
const must = async <T,>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const admin = <T,>(fn: string, args: Record<string, unknown>) =>
  must<T>(anon.rpc(fn, { p_secret: ADMIN, p_actor: "sample-listing script", ...args }));
async function put(key: string, body: Buffer, type: string) {
  const r = await fetch(presign("PUT", key, 600), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "Content-Type": type },
  });
  if (!r.ok) throw new Error(`R2 PUT ${r.status} ${key}`);
}

// ---------- the demo client ----------
const { error: createErr } = await anon.rpc("e2e_create_user", {
  p_secret: E2E,
  p_email: EMAIL,
  p_password: PASSWORD,
  p_confirmed: true,
});
if (createErr && !/already|exists|duplicate/i.test(createErr.message)) throw createErr;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const { error: signErr } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signErr) throw signErr;
const mine = await must<{ account_id: string }[]>(db.from("account_members").select("account_id"));
const account =
  mine[0]?.account_id ??
  (await must<string>(
    db.rpc("create_my_account", {
      p_type: "company",
      p_name: "Milkywayy Demo Realty",
      p_industry: "agency",
      p_full_name: "Demo Owner",
    }),
  ));
await must(db.from("accounts").update({ brand_name: "Milkywayy Demo Realty" }).eq("id", account));
let contacts = await must<{ id: string }[]>(
  db.from("contacts").select("id").eq("account_id", account),
);
if (!contacts.length)
  contacts = await must(
    db
      .from("contacts")
      .insert({
        account_id: account,
        name: "Sara Demo",
        role: "Sales agent",
        whatsapp: "+971507263306",
        brn: "SAMPLE",
        is_default: true,
      })
      .select("id"),
  );

// Replace the previous demo listing (an earlier demo shoot just stays in the dev database).
for (const l of await must<{ id: string }[]>(
  db.from("listings").select("id").eq("account_id", account),
))
  await must(db.rpc("delete_share", { p_kind: "l", p_id: l.id }));

const shoot = await admin<{ id: string; ref: string }>("portal_admin_create_project", {
  p_account: account,
  p_type: "shoot",
  p_title: "Sample: Burj Vista penthouse",
  p_area: "Downtown Dubai",
  p_building: "Burj Vista 1",
  p_unit: "5101",
  p_services: ["photo"],
});

// ---------- photos: camera-size JPEGs with photo-like detail, then the web versions ----------
const SCENES: [string, string, string][] = [
  ["#c9b79a", "#6d5a43", "#f4ead8"],
  ["#d8d2c4", "#7d776b", "#fbf7ee"],
  ["#a9b8c6", "#45505a", "#e7eef3"],
  ["#e3cfa9", "#8a6a3f", "#fff3dc"],
  ["#bfc7c0", "#4f5b52", "#eef2ee"],
  ["#d6c2b2", "#6e5847", "#f7ece3"],
  ["#9fb2c8", "#2f3d4f", "#dfe8f2"],
  ["#cdbfa5", "#5d4f3a", "#f3ecdf"],
];
async function photo(i: number) {
  const [mid, dark, light] = SCENES[i];
  const W = 4000;
  const H = 2667;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="${300 + i * 90}" y="300" width="1500" height="1300" fill="${light}" opacity="0.85"/>
    <rect x="${2100 - i * 60}" y="420" width="1400" height="1100" fill="${light}" opacity="0.6"/>
    <rect x="0" y="1900" width="${W}" height="767" fill="${dark}" opacity="0.55"/>
    <rect x="${900 + i * 120}" y="1500" width="1800" height="520" fill="${mid}" opacity="0.9"/>
  </svg>`;
  // Detail at several scales, so every size we make weighs what a real photo's would.
  const grain = (w: number, h: number, sigma: number) =>
    sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma },
      },
    })
      .png()
      .toBuffer()
      .then((b) => sharp(b).resize(W, H, { kernel: "cubic" }).png().toBuffer());
  const [coarse, mid2, fine] = await Promise.all([
    grain(500, 333, 60),
    grain(1300, 867, 45),
    grain(W, H, 22),
  ]);
  return sharp(Buffer.from(svg))
    .composite([
      { input: coarse, blend: "soft-light" },
      { input: mid2, blend: "soft-light" },
      { input: fine, blend: "soft-light" },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

for (let i = 0; i < SCENES.length; i++) {
  const original = await photo(i);
  const name = `MW_${String(i + 1).padStart(3, "0")}.jpg`;
  const key = `projects/${shoot.ref}/d1/sample-${name}`;
  await put(key, original, "image/jpeg");
  const id = await admin<string>("portal_admin_add_file", {
    p_id: shoot.id,
    p_delivery_no: 1,
    p_delivery_label: "Delivery 1",
    p_kind: "photos",
    p_source: "r2",
    p_url: null,
    p_r2_key: key,
    p_label: name,
    p_bytes: original.length,
    p_content_type: "image/jpeg",
  });
  // The same sizes the admin's browser makes on upload (ProjectWork → makeImage).
  const img = sharp(original);
  const [thumb, web, og] = await Promise.all([
    img.clone().resize(800, 800, { fit: "inside" }).webp({ quality: 80 }).toBuffer(),
    img.clone().resize(2048, 2048, { fit: "inside" }).webp({ quality: 82 }).toBuffer(),
    img.clone().resize(1200, 1200, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer(),
  ]);
  const base = `projects/${shoot.id}/web/${id}`;
  await put(`${key}.thumb.webp`, thumb, "image/webp");
  await put(`${base}.webp`, web, "image/webp");
  await put(`${base}.og.jpg`, og, "image/jpeg");
  await admin("portal_admin_set_thumb", { p_file: id, p_thumb_key: `${key}.thumb.webp` });
  await admin("portal_admin_set_media", {
    p_file: id,
    p_web: `${base}.webp`,
    p_og: `${base}.og.jpg`,
    p_poster: null,
    p_web_bytes: web.length,
  });
  console.log(
    `${name}: original ${(original.length / 1e6).toFixed(1)} MB, thumb ${Math.round(thumb.length / 1e3)} KB, web ${Math.round(web.length / 1e3)} KB`,
  );
}
await admin("portal_admin_publish_delivery", { p_id: shoot.id, p_delivery_no: 1 });

const photos = await must<{ id: string }[]>(
  db.from("project_files").select("id").eq("project_id", shoot.id).order("label"),
);
const listing = await must<{ slug: string }>(
  db.rpc("save_listing", {
    p_id: null,
    p_project: shoot.id,
    p: {
      title: "Sample: sky-high 3 bed penthouse with Burj views",
      purpose: "sale",
      price: "6950000",
      location: "Burj Vista 1, Downtown Dubai",
      property_type: "Apartment",
      beds: "3",
      baths: "4",
      size_sqft: "2410",
      furnishing: "furnished",
      description:
        "A sample share page made by Milkywayy to show how listing links look. The photos are generated placeholders at real camera size.\n\nFull-floor layout with a wraparound terrace, three en-suite bedrooms and a kitchen that opens onto the living room.",
      highlights: ["Burj Khalifa view", "Private terrace", "Vacant on transfer"],
      permit_no: "SAMPLE-0001",
      permit_qr_key: "",
      contact_ids: [contacts[0].id],
      photo_ids: photos.map((p) => p.id),
      reel_id: "",
      video_url: "",
      tour_url: "",
      show_brand: true,
      expires_on: "",
    },
  }),
);
console.log(`\nSample listing: /l/${listing.slug}`);
