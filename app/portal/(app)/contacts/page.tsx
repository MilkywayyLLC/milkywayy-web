import { redirect } from "next/navigation";

/** Merged into People (owner, 25 Oct 2026). */
export default function Moved() {
  redirect("/portal/people");
}
