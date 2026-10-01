import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** RFC 6238 six-digit code (SHA-1, 30 s), what an authenticator app shows. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Waits for the next 30-second window (a code can only be used once). */
export const nextWindow = () =>
  new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500));

/** The e2e Owner's authenticator secret, saved when the setup enrolled it (gitignored). */
const FILE = "tests/.auth/owner-totp.txt";
export const savedSecret = () => (existsSync(FILE) ? readFileSync(FILE, "utf8").trim() : "");
export const saveSecret = (s: string) => writeFileSync(FILE, s);
