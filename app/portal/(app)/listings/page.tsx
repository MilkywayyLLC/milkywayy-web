import { redirect } from "next/navigation";

/** Hidden until it's built (owner QA, 3 Oct 2026): the tab isn't shown; old links go Home. */
export default function Hidden() {
  redirect("/portal");
}
