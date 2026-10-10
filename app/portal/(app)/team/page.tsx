import { TeamManager, type InviteRow, type MemberRow } from "@/components/portal/TeamManager";
import { headers } from "next/headers";
import { requireAccount } from "@/lib/portal/auth";
import { dubaiToday } from "@/lib/portal/billing";
import { originFrom } from "@/lib/portal/invite";
import { isManager } from "@/lib/portal/shell";

export const metadata = { title: "Team" };

/** Team (owner, 10 Oct 2026): invites by email with access, and each member's access. */
export default async function Team() {
  const { db, user, current } = await requireAccount("/portal/team");
  if (!isManager(current))
    return (
      <div className="pt-card">
        <b>Your access doesn’t include managing the team</b>
        <span className="pt-meta">Ask the account owner to invite someone or change access.</span>
      </div>
    );
  const id = current.account.id;
  const [{ data: members }, { data: invites }] = await Promise.all([
    db
      .from("account_members")
      .select("user_id, role, access, created_at")
      .eq("account_id", id)
      .order("created_at"),
    db
      .from("account_invites")
      .select("id, name, email, phone_e164, role, access, created_at, expires_at")
      .eq("account_id", id)
      .is("accepted_at", null)
      .order("created_at"),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("user_id, full_name, email, phone_e164").in("user_id", ids)
    : { data: [] };
  const rows: MemberRow[] = (members ?? [])
    .map((m) => {
      const p = profiles?.find((x) => x.user_id === m.user_id);
      return {
        userId: m.user_id,
        role: m.role,
        access: m.access,
        name: p?.full_name ?? null,
        contact: p?.email ?? p?.phone_e164 ?? null,
        me: m.user_id === user.id,
      };
    })
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));

  return (
    <TeamManager
      account={{ name: current.account.name, type: current.account.type }}
      members={rows}
      invites={((invites ?? []) as Omit<InviteRow, "expired">[]).map((i) => ({
        ...i,
        expired: i.expires_at.slice(0, 10) < dubaiToday(),
      }))}
      origin={originFrom(await headers())}
    />
  );
}
