import { redirect } from "next/navigation";
import { finishCardSetup } from "@/lib/portal/pay-actions";

/** Back from saving a card (phase 1): checked with Stripe, stored, then on to Billing. */
export default async function CardSaved({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const card = await finishCardSetup(session_id ?? "").catch(() => null);
  redirect(card ? "/portal/billing?card=saved" : "/portal/billing");
}
