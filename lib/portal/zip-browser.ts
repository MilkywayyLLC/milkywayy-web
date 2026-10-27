/**
 * "Download all" in the browser (phase 1 part 7): delivered files fetched one by one from their
 * signed links and zipped with client-zip, with progress. Shared by the delivery action row and the
 * per-section buttons. Browser only (the file name helper is safe anywhere).
 */
export type ZipItem = { url: string; name: string };

const EXT: Record<string, string> = { photos: "jpg", reel: "mp4", long_form: "mp4" };

/** A file name for the zip: the label, cleaned, with an extension. */
export function zipName(label: string, i: number, kindOrExt: string) {
  const ext = EXT[kindOrExt] ?? kindOrExt;
  const base = label.replace(/[\\/:*?"<>|]+/g, "-").trim() || `file-${i + 1}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
}

export async function zipAndSave(items: ZipItem[], name: string, onStep: (n: number) => void) {
  const { downloadZip } = await import("client-zip");
  async function* files() {
    for (const [i, f] of items.entries()) {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(String(r.status));
      yield { name: f.name, input: r };
      onStep(i + 1);
    }
  }
  const blob = await downloadZip(files()).blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
