import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterAdminList } from "@/components/admin/CharacterAdmin";
import { portalAdminPage, type ClientDetail } from "@/lib/portal/admin";
import { withSrc, type Character } from "@/lib/portal/characters";

export const metadata = { title: "AI characters" };

/** Clients → [client] → AI characters (17 Oct 2026): briefs, rounds, approval, pack files. */
export default async function ClientCharacters({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rpc = await portalAdminPage();
  const [c, list] = await Promise.all([
    rpc<ClientDetail | null>("portal_admin_client", { p_id: id, p_view_as: false }),
    rpc<Character[]>("portal_admin_ai_characters", { p_account: id }),
  ]);
  if (!c) notFound();
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <Link className="ad-eb" href={`/admin/accounts/${id}`} prefetch={false}>
            ← {c.account.name}
          </Link>
          <h1 className="ad-h1">AI characters</h1>
          <span className="ad-small ad-muted">
            Upload three variations a round and send them. Approving logs “AI character creation” on
            this month’s draft invoice.
          </span>
        </div>
      </div>
      <CharacterAdminList
        characters={(list ?? []).map((x) => ({ ...x, files: x.files.map(withSrc) }))}
      />
    </div>
  );
}
