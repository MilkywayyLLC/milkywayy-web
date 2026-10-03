/**
 * What clients are told, by email (Resend) and in the ready-written WhatsApp the owner sends by
 * hand from the admin (owner, 3 Oct 2026: no WhatsApp templates). One place for the wording.
 */
export type ProjectInfo = {
  ref: string;
  title: string;
  type?: "shoot" | "edit" | "avatar";
  status?: string;
  status_note?: string | null;
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
  | "files_expiring"
  | "batch_received"
  | "script_ready"
  | "status_update";

const STATUS_TEXT: Record<string, string> = {
  requested: "requested",
  confirmed: "confirmed",
  shot: "shot",
  editing: "in editing",
  submitted: "submitted",
  files_received: "files received, editing starts soon",
  in_editing: "in editing",
  brief_received: "brief received",
  script_ready: "script ready for your approval",
  in_production: "in production",
  on_hold: "on hold",
  delivered: "delivered",
  completed: "completed",
};
const what = (p: ProjectInfo) =>
  p.type === "edit" ? "batch" : p.type === "avatar" ? "avatar video" : "shoot";

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
    case "batch_received":
      return {
        subject: `Received: ${p.title} (${p.ref})`,
        lines: [
          hi,
          p.type === "avatar"
            ? `We’ve got your brief for ${p.title}. We’ll be in touch with the script for your approval.`
            : `We’ve got your batch ${p.title}. We’ll check the files and let you know when editing starts.`,
          "Add files or notes any time from the project page.",
        ],
        button: "Open the project",
      };
    case "script_ready":
      return {
        subject: `Script ready for your approval: ${p.title} (${p.ref})`,
        lines: [
          hi,
          `The script for ${p.title} is ready. Approve it, or tell us what to change. Production starts once you approve.`,
        ],
        button: "Review the script",
      };
    case "status_update":
      return {
        subject:
          p.status === "on_hold"
            ? `On hold, waiting on you: ${p.title} (${p.ref})`
            : `Update: ${p.title} is ${STATUS_TEXT[p.status ?? ""] ?? p.status} (${p.ref})`,
        lines: [
          hi,
          p.status === "on_hold"
            ? `Your ${what(p)} ${p.title} is on hold until we hear from you:\n${p.status_note ?? ""}`
            : `Your ${what(p)} ${p.title} is now ${STATUS_TEXT[p.status ?? ""] ?? p.status}.`,
        ],
        button: "Open the project",
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
    case "batch_received":
      return `${hi} we’ve got ${p.title} (${p.ref}). We’ll keep you posted here: ${o.link}`;
    case "script_ready":
      return `${hi} the script for ${p.title} (${p.ref}) is ready for your approval: ${o.link}`;
    case "status_update":
      return p.status === "on_hold"
        ? `${hi} ${p.title} (${p.ref}) is on hold until we hear from you: ${p.status_note ?? ""} ${o.link}`
        : `${hi} ${p.title} (${p.ref}) is now ${STATUS_TEXT[p.status ?? ""] ?? p.status}: ${o.link}`;
    case "files_expiring":
      return `${hi} a reminder that the files for ${p.ref} will be deleted soon. Download them here: ${o.link}`;
    default:
      return p.status === "on_hold"
        ? `${hi} ${p.title} (${p.ref}) is on hold until we hear from you: ${p.status_note ?? ""} ${o.link}`
        : `${hi} an update on ${p.title} (${p.ref})${o.status ? `: ${o.status.toLowerCase()}` : ""}. ${o.link}`;
  }
}

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
