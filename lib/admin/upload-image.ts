/**
 * Browser side of admin image uploads: shrink the photo so phone photos fit the request limit,
 * then POST it to /admin/upload, which makes the WebP (lib/admin/store-image.ts).
 */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const PRE_EDGE = 2560;

/** With `ratio` (width / height) the image is first cropped, centred, to that ratio. */
async function shrink(file: File, ratio?: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    let sx = 0;
    let sy = 0;
    let sw = bmp.width;
    let sh = bmp.height;
    if (ratio && Math.abs(sw / sh / ratio - 1) > 0.01) {
      if (sw / sh > ratio) {
        sw = Math.round(sh * ratio);
        sx = Math.round((bmp.width - sw) / 2);
      } else {
        sh = Math.round(sw / ratio);
        sy = Math.round((bmp.height - sh) / 2);
      }
    }
    const scale = Math.min(1, PRE_EDGE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (blob) return blob;
  } catch {}
  return file; // the server can still read it (e.g. a format the browser can't draw)
}

function post(blob: Blob, onProgress: (p: number) => void) {
  return new Promise<{ src: string; width: number; height: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status === 200
        ? resolve(xhr.response)
        : reject(new Error(xhr.response?.error ?? `Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    const form = new FormData();
    form.append("file", blob, "upload.jpg");
    xhr.send(form);
  });
}

/** A problem with the file before uploading, or null. */
export function imageProblem(file: File) {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name))
    return "Choose an image file.";
  if (file.size > IMAGE_MAX_BYTES) return `${file.name} is over 15 MB. Choose a smaller one.`;
  return null;
}

/** Any shape is accepted; with `ratio` it is auto-cropped to it (the focal point can adjust). */
export async function uploadImage(
  file: File,
  onProgress: (p: number | "shrink") => void,
  ratio?: number,
) {
  onProgress("shrink");
  const blob = await shrink(file, ratio);
  onProgress(0);
  return post(blob, onProgress);
}
