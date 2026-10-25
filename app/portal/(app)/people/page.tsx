import { headers } from "next/headers";
import { ContactsManager, type ContactRow } from "@/components/portal/ContactsManager";
import { TeamManager, type InviteRow, type MemberRow } from "@/components/portal/TeamManager";
import { can } from "@/lib/portal/access";
import { requireAccount } from "@/lib/portal/auth";
import { dubaiToday } from "@/lib/portal/billing";
import { originFrom } from "@/lib/portal/invite";
import { isManager } from "@/lib/portal/shell";
import { presign, r2Ready } from "@/lib/r2";

export const metadata = { title: "People" };

/**
 * People (owner, 25 Oct 2026): Team (logins, roles, invites) and Listing contacts on one page.
 * Team for those who manage it; contacts for those with listings.
 */
export default async function People() {
  const { db, user, current } = await requireAccount("/portal/people");
  const team = isManager(current);
  const listings = can(current, "listings");
  if (!team && !listings)
    return (
      <div className="pt-card">
        <b>Your access doesn’t include People</b>
        <span className="pt-meta">Ask the account owner if you need it.</span>
      </div>
    );
  const id = current.account.id;
  const none = Promise.resolve({ data: null });
  const [{ data: members }, { data: invites }, { data: linked }, { data: contactRows }] =
    await Promise.all([
      team
        ? db
            .from("account_members")
            .select("user_id, role, access, created_at")
            .eq("account_id", id)
            .order("created_at")
        : none,
      team
        ? db
            .from("account_invites")
            .select("id, name, email, phone_e164, role, access, created_at, expires_at")
            .eq("account_id", id)
            .is("accepted_at", null)
            .order("created_at")
        : none,
      team
        ? db
            .from("contacts")
            .select("name, member_id")
            .eq("account_id", id)
            .not("member_id", "is", null)
        : none,
      listings
        ? db
            .from("contacts")
            .select(
              "id, name, role, whatsapp, email, brn, is_default, created_by, member_id, photo_url",
            )
            .eq("account_id", id)
            .order("is_default", { ascending: false })
            .order("name")
        : none,
    ]);
  const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("user_id, full_name, email, phone_e164").in("user_id", ids)
    : { data: [] };
  const rows: MemberRow[] = (
    (members ?? []) as { user_id: string; role: MemberRow["role"]; access: MemberRow["access"] }[]
  )
    .map((m) => {
      const p = profiles?.find((x) => x.user_id === m.user_id);
      return {
        userId: m.user_id,
        role: m.role,
        access: m.access,
        name: p?.full_name ?? null,
        contact: p?.email ?? p?.phone_e164 ?? null,
        me: m.user_id === user.id,
        linkedContact:
          (linked as { name: string; member_id: string }[] | null)?.find(
            (c) => c.member_id === m.user_id,
          )?.name ?? null,
      };
    })
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
  type Raw = Omit<ContactRow, "canEdit" | "photo" | "hasLogin"> & {
    created_by: string | null;
    member_id: string | null;
    photo_url: string | null;
  };
  const contacts: ContactRow[] = ((contactRows ?? []) as Raw[]).map(
    ({ photo_url, member_id, created_by, ...c }) => ({
      ...c,
      hasLogin: !!member_id,
      // Matches RLS: admins, the author, or the teammate whose own card it is.
      canEdit: team || created_by === user.id || member_id === user.id,
      photo: photo_url && r2Ready() ? presign("GET", photo_url, 3600) : null,
    }),
  );

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">{current.account.name}</span>
          <h1 className="pt-h1">People</h1>
        </div>
      </div>
      {team && (
        <TeamManager
          account={{
            name: current.account.name,
            type: current.account.type,
            industry: current.account.industry,
          }}
          members={rows}
          invites={((invites ?? []) as Omit<InviteRow, "expired">[]).map((i) => ({
            ...i,
            expired: i.expires_at.slice(0, 10) < dubaiToday(),
          }))}
          origin={originFrom(await headers())}
        />
      )}
      {listings && <ContactsManager contacts={contacts} company={current.account.name} />}
    </>
  );
}
