/**
 * Browser-side video optimising for admin uploads (owner, 7 Oct 2026): ffmpeg.wasm, loaded only
 * when someone picks a video (its core is served from /ffmpeg, scripts/copy-ffmpeg.mjs). Output:
 * H.264 at about 5 Mbps (lower for long clips, so the file stays under 40 MB), AAC audio,
 * "faststart" so playback begins before the whole file arrives, scaled down to fit the format's
 * export size. The single-threaded core needs no special page headers.
 */
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
const TARGET_BYTES = 38 * 1024 * 1024;
const VIDEO_BPS = 5_000_000;
const AUDIO_BPS = 128_000;

export type VideoInfo = { width: number; height: number; duration: number };

/** Width, height and length of a video file, read by the browser (null if it can't). */
export async function videoInfo(f: Blob): Promise<VideoInfo | null> {
  const url = URL.createObjectURL(f);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("unreadable"));
      setTimeout(() => rej(new Error("timeout")), 15_000);
    });
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration || 0 };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bitrate that keeps a clip of this length under the 40 MB target, never above 5 Mbps. */
export function targetBitrate(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return VIDEO_BPS;
  const fit = Math.floor((TARGET_BYTES * 8) / seconds - AUDIO_BPS);
  return Math.max(800_000, Math.min(VIDEO_BPS, fit));
}

/**
 * Optimise a video to fit inside `box` (e.g. 1080×1920 for a reel). Reports progress 0–1.
 * Throws if ffmpeg can't read or encode it; the caller then uploads the original.
 */
export async function compressVideo(
  file: File,
  box: { width: number; height: number },
  onProgress: (p: number) => void,
  seconds?: number,
): Promise<Blob> {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ff = new FFmpeg();
  ff.on("progress", ({ progress }) => onProgress(Math.max(0, Math.min(1, progress))));
  try {
    const at = (f: string) => new URL(`/ffmpeg/${f}`, location.origin).href;
    await ff.load({
      // ffmpeg's own worker, unbundled (scripts/copy-ffmpeg.mjs): it imports the core itself.
      classWorkerURL: at("worker.js"),
      coreURL: at("ffmpeg-core.js"),
      wasmURL: at("ffmpeg-core.wasm"),
    });
    const ext = /\.(\w{2,4})$/.exec(file.name)?.[1]?.toLowerCase() ?? "mp4";
    const input = `in.${ext}`;
    await ff.writeFile(input, await fetchFile(file));
    const bps = targetBitrate(seconds ?? 0);
    const scale =
      `scale='min(${box.width},iw)':'min(${box.height},ih)':force_original_aspect_ratio=decrease,` +
      "scale=trunc(iw/2)*2:trunc(ih/2)*2";
    const code = await ff.exec([
      "-i",
      input,
      "-vf",
      scale,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      String(bps),
      "-maxrate",
      String(bps),
      "-bufsize",
      String(bps * 2),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      String(AUDIO_BPS),
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    const data = await ff.readFile("out.mp4");
    if (typeof data === "string" || !data.byteLength) throw new Error("no output");
    onProgress(1);
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ff.terminate();
  }
}

export const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
