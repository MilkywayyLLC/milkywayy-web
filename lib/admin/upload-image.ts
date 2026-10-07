/**
 * Browser side of admin image uploads: shrink the photo so phone photos fit the request limit,
 * then POST it to /admin/upload, which makes the WebP (lib/admin/store-image.ts).
 */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const PRE_EDGE = 2560;

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PRE_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
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

export async function uploadImage(file: File, onProgress: (p: number | "shrink") => void) {
  onProgress("shrink");
  const blob = await shrink(file);
  onProgress(0);
  return post(blob, onProgress);
}
