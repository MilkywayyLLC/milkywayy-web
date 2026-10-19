import { expect, test } from "@playwright/test";
import { portalReadyEmail } from "@/lib/portal/messages";

/** "Your Milkywayy portal is ready" (owner, 4 Oct 2026). */
test("the invite email: subject, the account, how to sign in", () => {
  const owner = portalReadyEmail({
    name: "Bea Boss",
    account: "Harbourline Homes",
    role: "owner",
    link: "https://milkywayy.com/portal/login?email=bea%40harbourline.ae",
  });
  expect(owner.subject).toBe("Your Milkywayy portal is ready");
  expect(owner.lines[0]).toBe("Hi Bea,");
  expect(owner.lines[1]).toContain("Your Milkywayy client portal for Harbourline Homes is ready.");
  expect(owner.lines.join(" ")).toContain("6-digit code");
  expect(owner.button).toBe("Sign in to your portal");
  const member = portalReadyEmail({
    name: null,
    account: "Harbourline Homes",
    role: "member",
    link: "x",
  });
  expect(member.lines[1]).toContain("and you've been added to it");
});
