/**
 * What clients are told, by email (Resend) and in the ready-written WhatsApp the owner sends by
 * hand from the admin (owner, 3 Oct 2026: no WhatsApp templates). One place for the wording.
 */
export type ProjectInfo = {
  ref: string;
  title: string;
  shoot_date?: string | null;
  slot?: string | null;
  meta?: { area?: string; building?: string; unit?: string } | null;
};
export type MessageEvent =
  | "booking_confirmed"
  | "shoot_done"
  | "delivered"
  | "revision_delivered"
  | "new_message"
  | "files_expiring";

const day = (d?: string | null) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";
const place = (p: ProjectInfo) =>
  [p.meta?.unit && `Unit ${p.meta.unit}`, p.meta?.building, p.meta?.area]
    .filter(Boolean)
    .join(", ");
const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "there";

export const projectLink = (origin: string, ref: string) =>
  `${origin}/portal/p/${encodeURIComponent(ref)}`;

/** Email: subject, the lines of the message, and the button. */
export function emailFor(
  event: MessageEvent,
  p: ProjectInfo,
  o: { name?: string | null; link: string; label?: string; text?: string; expires?: string },
) {
  const hi = `Hi ${firstName(o.name)},`;
  const when = [day(p.shoot_date), p.slot?.toLowerCase()].filter(Boolean).join(", ");
  switch (event) {
    case "booking_confirmed":
      return {
        subject: `Confirmed: your shoot${when ? ` on ${day(p.shoot_date)}` : ""} (${p.ref})`,
        lines: [
          hi,
          `Your shoot is confirmed.`,
          `${p.title}${place(p) ? `\n${place(p)}` : ""}${when ? `\n${when}` : ""}`,
          "We’ll see you there. Need to change anything? Reply to this email or WhatsApp us.",
        ],
        button: "View in your portal",
      };
    case "shoot_done":
      return {
        subject: `Shoot done, editing started (${p.ref})`,
        lines: [
          hi,
          `We’ve finished shooting ${p.title} and editing has started. We’ll let you know as soon as your files are ready.`,
        ],
        button: "View in your portal",
      };
    case "delivered":
      return {
        subject: `Your files are ready: ${p.title} (${p.ref})`,
        lines: [
          hi,
          `${o.label ?? "Your delivery"} for ${p.title} is ready to download.`,
          "Take a look, then approve it or ask for a revision. Two revision rounds are included.",
        ],
        button: "Download your files",
      };
    case "revision_delivered":
      return {
        subject: `Revision ready: ${p.title} (${p.ref})`,
        lines: [
          hi,
          `${o.label ?? "Your revision"} for ${p.title} is ready.`,
          "Take a look and approve it, or tell us what still needs changing.",
        ],
        button: "See the revision",
      };
    case "new_message":
      return {
        subject: `New message about ${p.ref}`,
        lines: [
          hi,
          `There’s a new message from Milkywayy about ${p.title}:`,
          `“${(o.text ?? "").slice(0, 600)}”`,
          "Reply in your portal so everything stays in one place.",
        ],
        button: "Reply in your portal",
      };
    case "files_expiring":
      return {
        subject: `Your files for ${p.ref} will be deleted on ${o.expires}`,
        lines: [
          hi,
          `The files for ${p.title} are kept until ${o.expires} and then deleted. Download anything you want to keep before then.`,
          "Need them longer? Reply to this email.",
        ],
        button: "Download your files",
      };
  }
}

/** The ready-written WhatsApp for the owner to send from his own phone. */
export function whatsappFor(
  event: MessageEvent | "status",
  p: ProjectInfo,
  o: { name?: string | null; link: string; label?: string; status?: string },
) {
  const hi = `Hi ${firstName(o.name)},`;
  const when = [day(p.shoot_date), p.slot?.toLowerCase()].filter(Boolean).join(", ");
  switch (event) {
    case "booking_confirmed":
      return `${hi} your shoot ${p.ref} is confirmed${when ? ` for ${when}` : ""}: ${p.title}${place(p) ? `, ${place(p)}` : ""}. Everything’s in your portal: ${o.link}`;
    case "shoot_done":
      return `${hi} we’ve finished shooting ${p.title} (${p.ref}) and editing has started. We’ll send your files soon: ${o.link}`;
    case "delivered":
      return `${hi} your files for ${p.title} (${p.ref}) are ready to download: ${o.link}`;
    case "revision_delivered":
      return `${hi} the revision for ${p.title} (${p.ref}) is ready: ${o.link}`;
    case "new_message":
      return `${hi} I’ve replied about ${p.ref} in your portal: ${o.link}`;
    case "files_expiring":
      return `${hi} a reminder that the files for ${p.ref} will be deleted soon. Download them here: ${o.link}`;
    default:
      return `${hi} an update on ${p.title} (${p.ref})${o.status ? `: ${o.status}` : ""}. ${o.link}`;
  }
}

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
