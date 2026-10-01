/** Dates in the admin, in Dubai time. */
export const dubai = (iso: string, withYear = false) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
