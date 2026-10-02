/** Project status pipelines (CLIENT_PORTAL_GUIDE §4.1). */
export const SHOOT_STEPS = [
  "Requested",
  "Confirmed",
  "Shot",
  "Editing",
  "Delivered",
  "Completed",
] as const;
export const EDIT_STEPS = [
  "Submitted",
  "Files received",
  "In editing",
  "Delivered",
  "Completed",
] as const;
export const AVATAR_STEPS = [
  "Brief received",
  "Script ready",
  "In production",
  "Delivered",
  "Completed",
] as const;
