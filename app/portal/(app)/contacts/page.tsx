import { ContactsManager, type ContactRow } from "@/components/portal/ContactsManager";
import { requireAccount } from "@/lib/portal/auth";
import { isManager } from "@/lib/portal/shell";
import { presign, r2Ready } from "@/lib/r2";

export const metadata = { title: "Contacts" };

/** Saved points of contact for listing pages (§5.6). Everyone adds; authors and admins edit. */
export default async function Contacts() {
  const { db, user, current } = await requireAccount("/portal/contacts");
  const { data } = await db
    .from("contacts")
    .select("id, name, role, whatsapp, email, brn, is_default, created_by, photo_url")
    .eq("account_id", current.account.id)
    .order("is_default", { ascending: false })
    .order("name");
  const rows: ContactRow[] = (data ?? []).map(({ photo_url, ...c }) => ({
    ...c,
    canEdit: isManager(current) || c.created_by === user.id,
    photo: photo_url && r2Ready() ? presign("GET", photo_url, 3600) : null,
  }));
  return <ContactsManager contacts={rows} />;
}
