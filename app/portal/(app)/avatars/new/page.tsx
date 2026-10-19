import { redirect } from "next/navigation";

/** "AI avatar video" is a modal now (owner, 10 Oct 2026). */
export default function NewAvatarVideo() {
  redirect("/portal/avatars?new=avatar");
}
