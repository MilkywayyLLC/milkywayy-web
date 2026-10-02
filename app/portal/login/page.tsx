import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInMethods } from "@/components/portal/SignInMethods";
import { getPortal, safeNext } from "@/lib/portal/auth";
import { phoneSignIn } from "@/lib/portal/flags";
import { phoneSignInEnabled } from "@/lib/portal/supabase";

export const metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "signed-out": "You’re signed out.",
  confirmed: "Email confirmed. Sign in to continue.",
  expired: "That link has expired or was already used. Sign in, or ask for a new one.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const next = safeNext(q.next);
  if ((await getPortal()).state === "signed-in") redirect(next);
  const notice = q["signed-out"]
    ? NOTICES["signed-out"]
    : q.confirmed
      ? NOTICES.confirmed
      : q.link
        ? NOTICES.expired
        : undefined;
  return (
    <main className="pt-auth" id="main">
      <div className="pt-card">
        <Link href="/" className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </Link>
        <div>
          <span className="pt-eb">Client portal</span>
          <h1 className="pt-h1">Sign in</h1>
        </div>
        {notice && (
          <p className="pt-note" role="status">
            {notice}
          </p>
        )}
        <SignInMethods
          next={next}
          phone={phoneSignIn && (await phoneSignInEnabled())}
          startOn={
            q.method === "password" ? "password" : q.method === "whatsapp" ? "whatsapp" : "code"
          }
        />
      </div>
    </main>
  );
}
