"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendLead } from "@/lib/leads/client";
import {
  checkLead,
  formMessage,
  type LeadErrors,
  type LeadType,
  type LeadValues,
} from "@/lib/leads/rules";
import { whatsappLink } from "@/lib/whatsapp";

export type Sent = { ref: string; eventId: string; waUrl?: string; values: LeadValues };
type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done"; sent: Sent };

/**
 * Shared by every lead form: inline errors (same rules as the server), time-to-submit, the POST,
 * and the WhatsApp hand-off. WhatsApp opens in a tab reserved during the tap (so pop-up blockers
 * allow it) and is pointed at the message once the server has issued the ref.
 */
export function useLeadForm(type: LeadType, whatsappNumber: string) {
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  /** Clear a field's error as soon as it's edited. Phone, email and reply method depend on
   *  each other, so editing any of them clears all three. */
  const onInput = (e: FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    const linked = ["phone", "email", "pref", "preferred_reply"];
    const clear = linked.includes(name) ? linked : [name === "use" ? "use_other" : name, name];
    if (clear.some((k) => errors[k]))
      setErrors((cur) =>
        Object.fromEntries(Object.entries(cur).filter(([k]) => !clear.includes(k))),
      );
  };

  async function send(
    form: HTMLFormElement,
    values: LeadValues,
    hp: string,
    opts: { whatsapp?: boolean; booking?: unknown; skipCheck?: boolean } = {},
  ): Promise<Sent | null> {
    const found = opts.skipCheck ? {} : checkLead(type, values);
    if (Object.keys(found).length) {
      setErrors(found);
      const first = Object.keys(found)[0];
      form
        .querySelector<HTMLElement>(`[name="${first === "preferred_reply" ? "pref" : first}"]`)
        ?.focus();
      return null;
    }
    setErrors({});
    const tab = opts.whatsapp ? window.open("", "_blank") : null;
    setStatus({ kind: "sending" });
    const r = await sendLead(type, values, {
      hp,
      elapsed: Date.now() - started.current,
      booking: opts.booking,
    });
    if (!r.ok) {
      tab?.close();
      if (r.errors) setErrors(r.errors);
      setStatus({ kind: "error", message: r.error });
      return null;
    }
    const waUrl = opts.whatsapp
      ? whatsappLink(r.message ?? formMessage(type, r.ref, values), whatsappNumber)
      : undefined;
    if (tab && waUrl) tab.location.href = waUrl;
    const sent = { ref: r.ref, eventId: r.eventId, waUrl, values };
    setStatus({ kind: "done", sent });
    return sent;
  }

  return { errors, status, send, onInput, reset: () => setStatus({ kind: "idle" }) };
}
