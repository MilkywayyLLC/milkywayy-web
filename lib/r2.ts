import { createHash, createHmac } from "node:crypto";

/**
 * Cloudflare R2 (S3-compatible) for files we host (CLIENT_PORTAL_GUIDE D6), signed with AWS
 * Signature V4 and no SDK. Server-only: the keys never reach a browser. Browsers get short-lived
 * presigned URLs instead: PUTs for the admin's uploads (one per part, so big files go up in 16 MB
 * pieces and can resume), GETs for clients' downloads.
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
const cfg = () => ({
  account: process.env.R2_ACCOUNT_ID ?? "",
  key: process.env.R2_ACCESS_KEY_ID ?? "",
  secret: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.R2_BUCKET ?? "",
});
export const r2Ready = () => Object.values(cfg()).every(Boolean);

export const PART_SIZE = 16 * 1024 * 1024;

const sha = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
/** RFC 3986 encoding, as SigV4 wants it. */
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const path = (key: string) => `/${cfg().bucket}/${key.split("/").map(enc).join("/")}`;
const host = () => `${cfg().account}.r2.cloudflarestorage.com`;

function stamp() {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, day: amz.slice(0, 8) };
}
function signingKey(day: string) {
  return hmac(hmac(hmac(hmac(`AWS4${cfg().secret}`, day), "auto"), "s3"), "aws4_request");
}
const canonicalQuery = (q: Record<string, string>) =>
  Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join("&");

/** A presigned URL a browser can use directly (no headers needed beyond Host). */
export function presign(method: "GET" | "PUT", key: string, seconds: number, extra: Record<string, string> = {}) {
  const c = cfg();
  const { amz, day } = stamp();
  const scope = `${day}/auto/s3/aws4_request`;
  const q: Record<string, string> = {
    ...extra,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.key}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(seconds),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = canonicalQuery(q);
  const canon = [method, path(key), qs, `host:${host()}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sig = createHmac("sha256", signingKey(day))
    .update(["AWS4-HMAC-SHA256", amz, scope, sha(canon)].join("\n"))
    .digest("hex");
  return `https://${host()}${path(key)}?${qs}&X-Amz-Signature=${sig}`;
}

/** A signed server-side request (create/complete/abort multipart, list parts, delete). */
async function call(method: string, key: string, q: Record<string, string> = {}, body = "") {
  const c = cfg();
  const { amz, day } = stamp();
  const scope = `${day}/auto/s3/aws4_request`;
  const payload = sha(body);
  const headers: Record<string, string> = { host: host(), "x-amz-content-sha256": payload, "x-amz-date": amz };
  const names = Object.keys(headers).sort();
  const qs = canonicalQuery(q);
  const canon = [method, path(key), qs, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payload].join("\n");
  const sig = createHmac("sha256", signingKey(day))
    .update(["AWS4-HMAC-SHA256", amz, scope, sha(canon)].join("\n"))
    .digest("hex");
  const res = await fetch(`https://${host()}${path(key)}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`,
    },
    body: body || undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`R2 ${method} ${res.status}: ${/<Message>(.*?)<\/Message>/.exec(text)?.[1] ?? text.slice(0, 200)}`);
  return text;
}

/** Download link: the browser saves it under the original name. 10 minutes by default. */
export function downloadUrl(key: string, filename: string, seconds = 600) {
  const safe = filename.replace(/["\\\r\n]/g, "").slice(0, 150) || "download";
  // Plain ASCII name for old browsers; the real (UTF-8) name in filename*, which browsers prefer.
  const ascii = safe.normalize("NFKD").replace(/[^\x20-\x7e]/g, "-");
  return presign("GET", key, seconds, {
    "response-content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${enc(safe)}`,
  });
}

export async function startMultipart(key: string) {
  const xml = await call("POST", key, { uploads: "" });
  const id = /<UploadId>(.*?)<\/UploadId>/.exec(xml)?.[1];
  if (!id) throw new Error("R2 didn't return an upload id");
  return id;
}

export const partUrl = (key: string, uploadId: string, partNumber: number, seconds = 3600) =>
  presign("PUT", key, seconds, { partNumber: String(partNumber), uploadId });

export async function listParts(key: string, uploadId: string) {
  const xml = await call("GET", key, { uploadId, "max-parts": "1000" });
  // R2 doesn't promise the field order inside <Part>, so read each field on its own.
  return [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({
    partNumber: Number(/<PartNumber>(\d+)<\/PartNumber>/.exec(m[1])?.[1]),
    etag: (/<ETag>(.*?)<\/ETag>/.exec(m[1])?.[1] ?? "").replace(/&quot;/g, '"'),
  }));
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  const body = `<CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/"/g, "&quot;")}</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  await call("POST", key, { uploadId }, body);
}

export const abortMultipart = (key: string, uploadId: string) => call("DELETE", key, { uploadId }).then(() => undefined);
export const deleteObject = (key: string) => call("DELETE", key).then(() => undefined);
