/**
 * A stand-in for the Instagram API (graph.instagram.com) and its CDN, for the tests only
 * (playwright.config.ts points INSTAGRAM_GRAPH_URL here). Our account, @milkywayy.media, has:
 *   MWOKREEL01  a reel that plays          (id 17900000000000001)
 *   MWBROKEN01  a reel the API won't serve (id 17900000000000002)
 *   MWPHOTO01   a photo post               (id 17900000000000003)
 * Anything else is "another account's reel".
 */
import { createServer } from "node:http";
import sharp from "sharp";

const PORT = Number(process.env.IG_MOCK_PORT ?? 3298);
const BASE = `http://127.0.0.1:${PORT}`;
const thumb = await sharp({
  create: { width: 540, height: 960, channels: 3, background: "#3a4a5c" },
})
  .jpeg()
  .toBuffer();
// Not a real film: the tests check our route streams it (with Range), not the picture.
const reel = Buffer.concat([Buffer.from("....ftypisom"), Buffer.alloc(64 * 1024, 7)]);

const MEDIA = [
  { id: "17900000000000001", shortcode: "MWOKREEL01", media_type: "VIDEO" },
  { id: "17900000000000002", shortcode: "MWBROKEN01", media_type: "VIDEO" },
  { id: "17900000000000003", shortcode: "MWPHOTO01", media_type: "IMAGE" },
].map((m) => ({
  ...m,
  permalink: `https://www.instagram.com/reel/${m.shortcode}/`,
  thumbnail_url: `${BASE}/cdn/thumb.jpg`,
}));

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  if (path === "/health") return json(res, 200, { ok: true });
  if (path === "/refresh_access_token")
    return json(res, 200, { access_token: "test-token-refreshed", expires_in: 5184000 });
  if (path.startsWith("/cdn/")) {
    if (path === "/cdn/thumb.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": thumb.length });
      return res.end(thumb);
    }
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : reel.length - 1;
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-range": `bytes ${start}-${end}/${reel.length}`,
        "content-length": end - start + 1,
        "accept-ranges": "bytes",
      });
      return res.end(reel.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": reel.length });
    return res.end(reel);
  }
  if (!url.searchParams.get("access_token"))
    return json(res, 400, { error: { message: "An access token is required." } });
  if (path === "/me")
    return json(res, 200, { id: "1784", user_id: "1784", username: "milkywayy.media" });
  if (path === "/me/media") return json(res, 200, { data: MEDIA, paging: {} });
  const id = path.slice(1);
  if (id === "17900000000000001")
    return json(res, 200, { ...MEDIA[0], media_url: `${BASE}/cdn/reel.mp4` });
  if (id === "17900000000000003")
    return json(res, 200, { ...MEDIA[2], media_url: `${BASE}/cdn/thumb.jpg` });
  return json(res, 400, { error: { message: "Unsupported get request. Object does not exist." } });
}).listen(PORT, "127.0.0.1", () => console.log(`[ig-mock] ${BASE}`));
