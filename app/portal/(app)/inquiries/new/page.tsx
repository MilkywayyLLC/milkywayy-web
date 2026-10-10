import { NewInquiryForm } from "@/components/portal/Inquiry";
import { Back } from "@/components/portal/ui";
import { requireAccount } from "@/lib/portal/auth";
import { r2Ready } from "@/lib/r2";

export const metadata = { title: "New inquiry" };

export default async function NewInquiry() {
  const { db, current } = await requireAccount("/portal/inquiries/new");
  // Their shoots and projects (what they can see), newest first.
  const { data } = await db
    .from("projects")
    .select("id, ref, title")
    .eq("account_id", current.account.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <>
      <Back href="/portal/inquiries" label="Inquiries" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">{current.account.name}</span>
          <h1 className="pt-h1">New inquiry</h1>
        </div>
      </div>
      <NewInquiryForm
        projects={(data ?? []).map((p) => ({ id: p.id, label: `${p.ref} · ${p.title}` }))}
        canAttach={r2Ready()}
      />
    </>
  );
}
