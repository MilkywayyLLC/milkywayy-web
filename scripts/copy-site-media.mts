/**
 * One-off (24 Oct 2026): copy the website's media (every object under `site/`) from the portal
 * bucket (R2_BUCKET, the dev bucket on previews) to the site bucket (R2_SITE_BUCKET), keeping
 * identical keys, so the stored "r2:site/…" references keep working. Never deletes anything.
 * Skips objects already in the site bucket with the same size. Prints counts only, no secrets.
 *
 *   node --env-file=<env with both R2 configs> scripts/copy-site-media.mts
 */
import { createHash, createHmac } from "node:crypto";

type Cred = { key: string; secret: string; bucket: string };
const env = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is not set`);
  return v;
};
const account = env("R2_ACCOUNT_ID");
const src: Cred = {
  key: env("R2_ACCESS_KEY_ID"),
  secret: env("R2_SECRET_ACCESS_KEY"),
  bucket: env("R2_BUCKET"),
};
const dst: Cred = {
  key: env("R2_SITE_ACCESS_KEY_ID"),
  secret: env("R2_SITE_SECRET_ACCESS_KEY"),
  bucket: env("R2_SITE_BUCKET"),
};
if (src.bucket === dst.bucket) throw new Error("Source and destination are the same bucket.");
const PREFIX = "site/";
const host = `${account}.r2.cloudflarestorage.com`;

const sha = (d: string | Uint8Array) => createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
const enc = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

async function s3(
  c: Cred,
  method: string,
  key: string,
  q: Record<string, string> = {},
  body?: Uint8Array,
  extra: Record<string, string> = {},
) {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amz.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const payload = body ? sha(body) : sha("");
  const path = key ? `/${c.bucket}/${key.split("/").map(enc).join("/")}` : `/${c.bucket}`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payload,
    "x-amz-date": amz,
    ...extra,
  };
  const names = Object.keys(headers).sort();
  const qs = Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join("&");
  const canon = [
    method,
    path,
    qs,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    payload,
  ].join("\n");
  const sk = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), "auto"), "s3"), "aws4_request");
  const sig = createHmac("sha256", sk)
    .update(["AWS4-HMAC-SHA256", amz, scope, sha(canon)].join("\n"))
    .digest("hex");
  const res = await fetch(`https://${host}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`,
    },
    body: body ? Buffer.from(body) : undefined,
  });
  if (!res.ok && !(method === "HEAD" && res.status === 404))
    throw new Error(
      `${method} ${c.bucket}/${key}: ${res.status} ${/<Code>(.*?)<\/Code>/.exec(await res.text())?.[1] ?? ""}`,
    );
  return res;
}

async function list(c: Cred) {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const q: Record<string, string> = { "list-type": "2", prefix: PREFIX, "max-keys": "1000" };
    if (token) q["continuation-token"] = token;
    const xml = await (await s3(c, "GET", "", q)).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
      out.push({
        key: (/<Key>(.*?)<\/Key>/.exec(m[1])?.[1] ?? "").replace(/&amp;/g, "&"),
        size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0),
      });
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>(.*?)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return out;
}

const from = await list(src);
console.log(`Source ${src.bucket}: ${from.length} objects under ${PREFIX}`);
let copied = 0;
let skipped = 0;
for (const o of from) {
  const head = await s3(dst, "HEAD", o.key);
  if (head.ok && Number(head.headers.get("content-length")) === o.size) {
    skipped++;
    continue;
  }
  const res = await s3(src, "GET", o.key);
  const type = res.headers.get("content-type") ?? "application/octet-stream";
  const body = new Uint8Array(await res.arrayBuffer());
  if (body.length !== o.size) throw new Error(`Short read on ${o.key}`);
  await s3(dst, "PUT", o.key, {}, body, { "content-type": type });
  copied++;
}
const to = await list(dst);
const sizes = new Map(to.map((o) => [o.key, o.size]));
const missing = from.filter((o) => sizes.get(o.key) !== o.size);
console.log(
  `Copied ${copied}, already there ${skipped}. Destination ${dst.bucket}: ${to.length} objects under ${PREFIX}.`,
);
if (missing.length) {
  console.error(`MISMATCH: ${missing.length} source objects missing or a different size.`);
  process.exit(1);
}
console.log("Counts and sizes match.");
