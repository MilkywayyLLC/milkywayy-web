"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { finishPayment } from "@/lib/portal/pay-actions";

/**
 * "Confirming payment…" (owner, 27 Oct 2026): Stripe's webhook records the payment, so the page checks
 * again every few seconds. If the webhook still hasn't landed after 45 s, the server asks Stripe
 * itself and records it (never the browser's word).
 */
export function ConfirmingPayment({
  invoiceId,
  sessionId,
}: {
  invoiceId: string;
  sessionId: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 4000);
    const fallback = setTimeout(async () => {
      await finishPayment(invoiceId, sessionId, true).catch(() => null);
      router.refresh();
    }, 45000);
    return () => {
      clearInterval(poll);
      clearTimeout(fallback);
    };
  }, [invoiceId, sessionId, router]);
  return null;
}
