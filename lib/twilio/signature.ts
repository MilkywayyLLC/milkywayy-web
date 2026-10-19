import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request validation (twilio.com/docs/usage/security): HMAC-SHA1, keyed with the Auth
 * Token, over the exact webhook URL followed by every POST parameter as name + value, sorted
 * by name (case-sensitive), Base64-encoded. No SDK needed.
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string) {
  const data = Object.keys(params)
    .sort()
    .reduce((s, k) => s + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validTwilioSignature(
  signature: string | null,
  urls: string[],
  params: Record<string, string>,
  authToken: string,
) {
  if (!signature || !authToken) return false;
  const got = Buffer.from(signature);
  return urls.some((u) => {
    const want = Buffer.from(twilioSignature(u, params, authToken));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}
