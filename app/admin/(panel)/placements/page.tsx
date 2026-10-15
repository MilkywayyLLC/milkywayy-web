import { redirect } from "next/navigation";

/** Placements became Pages (Admin → Content → Pages). */
export default function PlacementsRedirect() {
  redirect("/admin/pages");
}
