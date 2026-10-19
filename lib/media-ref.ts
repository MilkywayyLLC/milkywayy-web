/**
 * How stored media points at video (lib/media-config re-exports these). A separate, tiny module
 * so client components such as the showreel's play button don't pull in the whole format table.
 */

/** A video file we host in R2 is stored as "r2:<key>"; anything else is a link. */
export const R2_PREFIX = "r2:";
export const isFileVideo = (v?: string | null) => !!v && v.startsWith(R2_PREFIX);
export const fileKey = (v: string) => v.slice(R2_PREFIX.length);
/** Where the site plays a hosted video from (the route signs a short-lived R2 link). */
export const fileVideoUrl = (v: string) =>
  `/media/file/${fileKey(v)
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
/** Where the site plays one of our own Instagram reels from (our server fetches it). */
export const instagramVideoUrl = (id: string) => `/media/ig/${encodeURIComponent(id)}`;
