/**
 * Turn a stored video link into an embeddable player URL that autoplays after the click.
 * Accepts YouTube and Vimeo links, Bunny Stream (embed/play links or "bunny:<library>/<video>")
 * and Mux (stream.mux.com or player.mux.com links, or a bare playback id as "mux:<id>").
 * Returns null for anything else; the admin rejects links this can't play.
 */
export function embedUrl(video: string): string | null {
  const v = video.trim();
  const yt = v.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1`;
  const vimeo = v.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&dnt=1`;
  const bunny =
    v.match(/^bunny:(\d+)\/([\w-]+)$/) ??
    v.match(
      /^https:\/\/(?:iframe\.mediadelivery\.net|video\.bunnycdn\.com)\/(?:embed|play)\/(\d+)\/([\w-]+)/,
    );
  if (bunny) return `https://iframe.mediadelivery.net/embed/${bunny[1]}/${bunny[2]}?autoplay=true`;
  const mux =
    v.match(/^mux:([\w]+)$/) ?? v.match(/^https:\/\/(?:stream|player)\.mux\.com\/([\w]+)/);
  if (mux) return `https://player.mux.com/${mux[1]}?autoplay=true`;
  return null;
}

/** What the admin asks for. Bunny and Mux links still play, but aren't offered any more. */
export const VIDEO_HINT = "YouTube or Vimeo link (unlisted is fine)";
export const VIDEO_REFUSED = "Link not recognised. Use a YouTube or Vimeo link.";

/** Hosts the site may frame for video (next.config.ts frame-src). */
export const VIDEO_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://iframe.mediadelivery.net",
  "https://player.mux.com",
];
