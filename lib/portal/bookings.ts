import type { SupabaseClient } from "@supabase/supabase-js";

/** A website booking attached to the account (account_bookings(): no prices for Members). */
export type Booking = {
  ref: string;
  booked_at: string;
  claimed_at: string;
  properties: {
    line: number;
    type: string;
    size: string;
    services: string[];
    lighting?: string;
    area: string;
    building: string;
    unit?: string;
    date: string;
    slot: string;
    subtotal?: number;
  }[];
};

export async function accountBookings(db: SupabaseClient, accountId: string) {
  const { data, error } = await db.rpc("account_bookings", { p_account: accountId });
  if (error) console.error("[portal] account_bookings:", error.message);
  return (data ?? []) as Booking[];
}

export const SHOOT_SERVICES: Record<string, string> = {
  photo: "Photography",
  short: "Short-form video",
  long: "Long-form video",
  tour: "360 tour",
};
const TYPES: Record<string, string> = {
  apartment: "Apartment",
  villa: "Villa",
  commercial: "Commercial",
};

export const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
export const propertyTitle = (p: Booking["properties"][number]) =>
  `${p.size} ${(TYPES[p.type] ?? p.type).toLowerCase()}, ${p.building}`;
