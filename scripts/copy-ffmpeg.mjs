/**
 * ffmpeg.wasm (admin video uploads compress in the browser) is served from our own origin, never
 * a CDN: this copies the single-threaded core, and ffmpeg's own worker, from node_modules into
 * public/ffmpeg/ before every build and dev run (lib/video-compress.ts loads them from there).
 * The worker is served as is because the bundler rewrites its dynamic import of the core. The
 * folder is gitignored; only the admin's video upload ever loads it.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const core = join("node_modules", "@ffmpeg", "core", "dist", "esm");
const lib = join("node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");
const out = join("public", "ffmpeg");
mkdirSync(out, { recursive: true });
const files = [
  [core, "ffmpeg-core.js"],
  [core, "ffmpeg-core.wasm"],
  [lib, "worker.js"],
  [lib, "const.js"],
  [lib, "errors.js"],
];
for (const [dir, f] of files) {
  const src = join(dir, f);
  const to = join(out, f);
  if (!existsSync(to) || statSync(to).size !== statSync(src).size) copyFileSync(src, to);
}
console.log("[ffmpeg] core ready in public/ffmpeg");
