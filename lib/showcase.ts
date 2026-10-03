import type { ShowcaseFeature } from "@/components/blocks/DashboardShowcase";

/** The dashboard showcase per page (site-refine, 3 Oct 2026). Copy mirrors the real portal. */
export const SHOWCASE: Record<"home" | "property" | "post" | "avatars", ShowcaseFeature[]> = {
  home: [
    {
      icon: "track",
      title: "Track every job",
      text: "See where each shoot, edit or video is, from request to delivery. No chasing on WhatsApp.",
      screen: "track-shoot",
    },
    {
      icon: "download",
      title: "Download your files",
      text: "Photos, reels and tours in one place, with Download all. Kept 12 months after completion.",
      screen: "files",
    },
    {
      icon: "revision",
      title: "Request a revision",
      text: "Point to the photo number or the timecode and send it. Two rounds on every delivery.",
      screen: "revision",
    },
    {
      icon: "invoice",
      title: "Invoices in one place",
      text: "Every invoice and what it covered, ready to download as a PDF.",
      screen: "invoices",
    },
  ],
  property: [
    {
      icon: "track",
      title: "Track your shoot",
      text: "Requested, confirmed, shot, delivered: you see each step and get an email when it moves.",
      screen: "track-shoot",
    },
    {
      icon: "download",
      title: "Download your files",
      text: "Edited photos, reels and the 360 tour in one place, with Download all. Kept 12 months.",
      screen: "files",
    },
    {
      icon: "revision",
      title: "Request a revision",
      text: "Point to the photo or the timecode. Two rounds included, tracked in the same place.",
      screen: "revision",
    },
    {
      icon: "invoice",
      title: "Invoices",
      text: "Every shoot's invoice as a PDF, and a running total for the month.",
      screen: "invoices",
    },
  ],
  post: [
    {
      icon: "upload",
      title: "Upload a batch",
      text: "Drop raw files straight in (up to 5 GB each) or paste a link. Uploads resume if you drop.",
      screen: "upload",
    },
    {
      icon: "track",
      title: "Track the edit",
      text: "Submitted, files received, in editing, delivered: every batch shows where it is.",
      screen: "track-edit",
    },
    {
      icon: "download",
      title: "Download your files",
      text: "Each delivery in one place, earlier versions included, with Download all.",
      screen: "files",
    },
    {
      icon: "revision",
      title: "Request a revision",
      text: "Point to the file name or the timecode. Two rounds on every batch.",
      screen: "revision",
    },
  ],
  avatars: [
    {
      icon: "script",
      title: "Approve the script",
      text: "We post the script; you approve it or ask for changes. Nothing is produced until you say go.",
      screen: "script",
    },
    {
      icon: "track",
      title: "Track production",
      text: "Brief received, script ready, in production, delivered: every video shows where it is.",
      screen: "track-avatar",
    },
    {
      icon: "download",
      title: "Download your videos",
      text: "Every video ready to post, captioned and branded, with Download all.",
      screen: "files-video",
    },
    {
      icon: "revision",
      title: "Request a revision",
      text: "Point to the timecode and say what to change. Two rounds on every video.",
      screen: "revision",
    },
  ],
};
