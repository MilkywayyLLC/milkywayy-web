import Link from "next/link";
import { CharacterAdminList } from "@/components/admin/CharacterAdmin";
import { portalAdminPage } from "@/lib/portal/admin";
import { withSrc, type Character } from "@/lib/portal/characters";

export const metadata = { title: "AI characters" };

/** The global queue (17 Oct 2026): every client's characters, waiting on us first. */
export default async function CharacterQueue({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { all } = await searchParams;
  const rpc = await portalAdminPage();
  const list = ((await rpc<Character[]>("portal_admin_ai_characters", { p_account: null })) ?? [])
    .map((x) => ({ ...x, files: x.files.map(withSrc) }))
    .filter((x) => all || x.status !== "approved");
  // On us: a new brief, a revision or a pick to approve. With the client: variations sent.
  const rank = (s: Character["status"]) =>
    s === "variations_ready" ? 1 : s === "approved" ? 2 : 0;
  list.sort((a, b) => rank(a.status) - rank(b.status));
  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <h1 className="ad-h1">AI characters</h1>
          <span className="ad-small ad-muted">
            Waiting on us first: new briefs, revision requests and picks to approve.
          </span>
        </div>
        <div className="ad-btns">
          <Link
            className="ad-btn ghost"
            href={all ? "/admin/characters" : "/admin/characters?all=1"}
            prefetch={false}
          >
            {all ? "Hide approved" : "Show approved"}
          </Link>
        </div>
      </div>
      <CharacterAdminList characters={list} showClient />
    </div>
  );
}
