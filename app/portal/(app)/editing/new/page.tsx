import { redirect } from "next/navigation";

/** "Edit my files" is a modal now (owner, 10 Oct 2026). */
export default function NewBatch() {
  redirect("/portal/editing?new=edit");
}
