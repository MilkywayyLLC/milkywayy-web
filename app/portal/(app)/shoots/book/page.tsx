import { redirect } from "next/navigation";

/** Booking is a modal now (owner, 10 Oct 2026): Home opens it. */
export default function BookShootPage() {
  redirect("/portal?new=booking");
}
