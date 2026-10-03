import { NewProjectForm } from "@/components/portal/NewProjectForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { maxUploadGb } from "@/lib/r2";

export const metadata = { title: "New avatar video" };

export default async function NewAvatarVideo() {
  await requireAccount("/portal/avatars/new");
  return (
    <>
      <Back href="/portal/avatars" label="Avatars" />
      <h1 className="pt-h1">New avatar video</h1>
      <NewProjectForm type="avatar" maxGb={maxUploadGb()} />
    </>
  );
}
