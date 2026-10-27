import { googleCalendarUrl, icsOne, icsPath, shootHours, type ShootEvent } from "./calendar";
import type { Project } from "./projects";
import { projectStart } from "./when";

/** A shoot's calendar event, Google link and .ics link (client page, admin page, emails). */
export function shootEventOf(
  p: Pick<Project, "id" | "ref" | "title" | "status" | "shoot_date" | "slot" | "meta">,
  origin: string,
) {
  const b = p.meta?.booking;
  const location = b?.location
    ? [b.location.unit, b.location.address].filter(Boolean).join(", ")
    : [p.meta?.building, p.meta?.area].filter(Boolean).join(", ") || null;
  const e: ShootEvent = {
    uid: p.id,
    title: `Milkywayy shoot: ${p.title}`,
    date: (p.shoot_date ?? "").slice(0, 10),
    start: projectStart(p),
    hours: shootHours(p),
    location,
    description: `${p.ref}${b?.location?.access ? `\nAccess: ${b.location.access}` : ""}\n${origin}/portal/p/${encodeURIComponent(p.ref)}`,
    tentative: p.status === "requested",
  };
  const ics = icsPath(p.id);
  return {
    event: e,
    ics: icsOne(e),
    google: googleCalendarUrl(e),
    icsUrl: ics ? `${origin}${ics}` : null,
  };
}
