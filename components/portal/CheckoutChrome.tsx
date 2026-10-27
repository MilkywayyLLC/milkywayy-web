"use client";

import { useState, type ReactNode } from "react";
import { discardDraft } from "@/lib/portal/pay-actions";
import { ChoiceDialog, useNavIntercept } from "./forms";
import { Icon } from "./Icon";
import { Sheet } from "./ui";

/**
 * Leaving checkout before paying (owner, 27 Oct 2026): a nav link, the logo or Back asks "Leave
 * checkout?" first; closing or reloading the tab gets the browser's own question. A booking draft can
 * be kept (it waits 7 days) or discarded there and then.
 */
export function CheckoutGuard({
  back,
  draftProject,
}: {
  back: string;
  /** The booking held for this payment, when it's still a draft. */
  draftProject: string | null;
}) {
  const { to, stay, go } = useNavIntercept(true, { history: true, unload: true, back });
  const [busy, setBusy] = useState(false);
  if (!to) return null;
  return (
    <ChoiceDialog
      title="Leave checkout?"
      body={
        draftProject
          ? "Your booking is only sent to Milkywayy once it’s paid. Pay later keeps it as a draft for 7 days."
          : "This invoice is still unpaid. You can pay it later from Billing."
      }
      onDismiss={stay}
      choices={[
        { label: "Stay and pay", primary: true, onClick: stay },
        { label: "Pay later", onClick: () => go(to) },
        ...(draftProject
          ? [
              {
                label: busy ? "Discarding…" : "Discard booking",
                danger: true,
                onClick: () => {
                  if (busy) return;
                  setBusy(true);
                  void discardDraft(draftProject).finally(() => go("/portal/shoots"));
                },
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * Phones: the summary as a bar pinned to the bottom ("INV-1010 · Deposit AED 225 ⌃") that opens a
 * sheet with all of it, so the payment form sits right under the title. Desktop keeps the side card.
 */
export function PaySummaryBar({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pt-paybar">
        <button
          type="button"
          className="pt-paybar-btn"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span>{label}</span>
          <span className="pt-paybar-up" aria-hidden="true">
            <Icon name="chevron" size={18} />
          </span>
        </button>
      </div>
      {open && (
        <Sheet title="Summary" onClose={() => setOpen(false)}>
          <div className="pt-pay-sum pt-paybar-sheet">{children}</div>
        </Sheet>
      )}
    </>
  );
}
