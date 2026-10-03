/**
 * Browser side of uploads to R2 (admin deliveries and client raw files): bytes go straight from
 * the browser to R2 with presigned URLs; our server only signs and records. Files up to 16 MB go
 * in one request; bigger ones in 16 MB parts, 3 at a time, each retried. If the page reloads
 * mid-upload, choosing the same file again resumes: R2 says which parts it already has.
 */
export const PART = 16 * 1024 * 1024;
const PARALLEL = 3;

export type Plan =
  | { ok: false; error: string }
  | {
      ok: true;
      key: string;
      single?: string;
      uploadId?: string;
      parts?: { partNumber: number; url: string }[];
      done?: { partNumber: number; etag: string }[];
    };
export type Finish = {
  key: string;
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
};
export type UploadApi = {
  start: () => Promise<Plan>;
  resume: (key: string, uploadId: string) => Promise<Plan>;
  finish: (f: Finish) => Promise<{ ok: boolean; error?: string }>;
};

/** PUT straight to R2 with a presigned URL, reporting progress; returns the part's ETag. */
function put(url: string, body: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () =>
      x.status >= 200 && x.status < 300
        ? resolve(x.getResponseHeader("ETag") ?? "")
        : reject(new Error(`Storage said ${x.status}`));
    x.onerror = () => reject(new Error("Network error"));
    x.send(body);
  });
}

async function retry<T>(fn: () => Promise<T>, tries = 3) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

type Saved = { key: string; uploadId: string };
const recall = (k: string): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null");
  } catch {
    return null;
  }
};
const remember = (k: string, v: Saved | null) => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {}
};

export type Progress = { done: number; state: string };

/** Uploads one file; reports progress; resolves with the final state ("Done" or an error). */
export async function uploadFile(
  f: File,
  scope: string,
  api: UploadApi,
  report: (p: Partial<Progress>) => void,
): Promise<boolean> {
  const memo = `mw-upload:${scope}:${f.name}:${f.size}`;
  try {
    const saved = recall(memo);
    let plan = saved ? await api.resume(saved.key, saved.uploadId) : await api.start();
    if (!plan.ok && saved) {
      remember(memo, null);
      plan = await api.start();
    }
    if (!plan.ok) {
      report({ state: plan.error });
      return false;
    }
    if (plan.single) {
      report({ state: "Uploading" });
      await retry(() => put(plan.single!, f, (n) => report({ done: n })));
      const r = await api.finish({ key: plan.key });
      report({ done: f.size, state: r.ok ? "Done" : r.error! });
      return r.ok;
    }
    remember(memo, { key: plan.key, uploadId: plan.uploadId! });
    const finished = [...(plan.done ?? [])];
    const sent: Record<number, number> = Object.fromEntries(
      finished.map((p) => [p.partNumber, PART]),
    );
    const show = () =>
      report({
        done: Math.min(
          f.size,
          Object.values(sent).reduce((a, b) => a + b, 0),
        ),
      });
    report({ state: finished.length ? "Resuming" : "Uploading" });
    show();
    const queue = [...plan.parts!];
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const part = p;
          const blob = f.slice((part.partNumber - 1) * PART, part.partNumber * PART);
          const etag = await retry(() =>
            put(part.url, blob, (n) => {
              sent[part.partNumber] = n;
              show();
            }),
          );
          finished.push({ partNumber: part.partNumber, etag });
        }
      }),
    );
    report({ state: "Finishing" });
    const r = await api.finish({ key: plan.key, uploadId: plan.uploadId, parts: finished });
    if (r.ok) remember(memo, null);
    report({ done: f.size, state: r.ok ? "Done" : r.error! });
    return r.ok;
  } catch (e) {
    report({
      state: `${e instanceof Error ? e.message : "Failed"}. Choose the file again to resume.`,
    });
    return false;
  }
}

/** A small WebP preview of a photo (longest side `max` px), or null if it isn't a photo. */
export const makeThumb = (f: File, max = 800) => makeImage(f, max, "image/webp", 0.8);

/**
 * A resized copy of a photo (longest side `max` px) as WebP or JPEG, or null if it isn't a
 * photo the browser can read. Share pages use a 2048px WebP and a 1200px JPEG for previews.
 */
export async function makeImage(
  f: Blob,
  max: number,
  type: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(f.type) || f.size > 80 * 1024 * 1024) return null;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d");
    if (ctx && type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, type, quality));
    // Safari without WebP encoding hands back a PNG: not what we asked for.
    return out && out.type === type ? out : null;
  } catch {
    return null;
  }
}

/** A JPEG still from a video (about 1 second in), for a reel's poster. */
export async function videoPoster(f: Blob, max = 1080): Promise<Blob | null> {
  const url = URL.createObjectURL(f);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video"));
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise<void>((res) => (v.onseeked = () => res()));
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.8));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PUT a small blob to a presigned URL; true when stored. */
export async function putBlob(url: string, blob: Blob) {
  try {
    const r = await fetch(url, { method: "PUT", body: blob });
    return r.ok;
  } catch {
    return false;
  }
}
