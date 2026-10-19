/**
 * Brand assets from the owner's logo files (assets/brand, transparent PNGs; site-refine, 3 Oct 2026).
 * Run: node scripts/brand-assets.mjs. Writes:
 *   public/brand/logo-on-dark.{webp,png}   "Logo (Black Bg)": light marks, for dark pages
 *   public/brand/logo-on-light.{webp,png}  "Logo (White Bg)": dark marks, for light pages
 *     both trimmed, 2x of a 22px-high logo (44px), plus 3x PNG for retina phones' share sheets
 *   app/icon.png (512), app/apple-icon.png (180), app/favicon.ico (16 + 32 + 48): the icon centred
 *     on a #111111 square with padding
 *   public/brand/og.png (1200 × 630): the default share image, icon centred on #111111
 *   assets/og/logo-on-dark.png: the wordmark for the per-page share images (app/og)
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const BG = { r: 17, g: 17, b: 17, alpha: 1 }; // #111111
const src = (f) => `assets/brand/${f}.png`;
const trimmed = (f) => sharp(src(f)).trim({ threshold: 1 }).toBuffer();

async function logo(file, out) {
  const t = await trimmed(file);
  for (const [h, suffix] of [
    [44, ""],
    [66, "@3x"],
  ]) {
    const img = sharp(t).resize({ height: h });
    if (!suffix)
      await img.clone().webp({ lossless: true, effort: 6 }).toFile(`public/brand/${out}.webp`);
    await img
      .clone()
      .png({ compressionLevel: 9, palette: true })
      .toFile(`public/brand/${out}${suffix}.png`);
  }
  const m = await sharp(`public/brand/${out}.png`).metadata();
  return `${out}: ${m.width}×${m.height}`;
}

/** The icon on a square #111111 tile, the icon ~64% of the width. */
async function tile(size, pad = 0.18) {
  const t = await trimmed("Icon (Black Bg)");
  const inner = Math.round(size * (1 - 2 * pad));
  const icon = await sharp(t).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: icon, gravity: "center" }])
    .png();
}

/** A .ico holding PNG images (supported by every current browser). */
async function ico(sizes) {
  const pngs = await Promise.all(sizes.map(async (s) => (await tile(s, 0.12)).toBuffer()));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4); // planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
}

console.log(await logo("Logo (Black Bg)", "logo-on-dark"));
console.log(await logo("Logo (White Bg)", "logo-on-light"));
await (await tile(512)).toFile("app/icon.png");
await (await tile(180, 0.16)).toFile("app/apple-icon.png");
await writeFile("app/favicon.ico", await ico([16, 32, 48]));

const icon = await sharp(await trimmed("Icon (Black Bg)"))
  .resize({ height: 260 })
  .toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
  .composite([{ input: icon, gravity: "center" }])
  .png()
  .toFile("public/brand/og.png");
await sharp(await trimmed("Logo (Black Bg)"))
  .resize({ height: 72 })
  .png()
  .toFile("assets/og/logo-on-dark.png");
console.log("icons, favicon and share image written");
