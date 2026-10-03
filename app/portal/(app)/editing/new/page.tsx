import { NewProjectForm } from "@/components/portal/NewProjectForm";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { maxUploadGb } from "@/lib/r2";

export const metadata = { title: "New batch" };

export default async function NewBatch() {
  await requireAccount("/portal/editing/new");
  return (
    <>
      <Back href="/portal/editing" label="Editing" />
      <h1 className="pt-h1">New batch</h1>
      <NewProjectForm type="edit" maxGb={maxUploadGb()} />
    </>
  );
}
