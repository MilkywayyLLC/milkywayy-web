"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/phone";
import { COUNTRIES } from "@/lib/phone/countries";
import { safeNext } from "./auth";
import { portalDb, portalKey, portalUrl } from "./supabase";
import { syncAfterSignIn } from "./sync";

/**
 * WhatsApp sign-in (CLIENT_PORTAL_GUIDE §3.3, D4): a 6-digit code over WhatsApp, with "Send by
 * SMS instead" as the fallback. Supabase phone auth with Twilio Verify sends and checks the code;
 * Twilio owns its length, expiry (10 minutes) and wording. A correct code also verifies the
 * number, so earlier bookings and invites made with it attach (§3.5).
 */
export type Channel = "whatsapp" | "sms";
export type PhoneState =
  | {
      step: "phone" | "code";
      phone?: string;
      channel?: Channel;
      sentAt?: number;
      error?: string;
      notice?: string;
      /** When this answer was made, so the screen shows the latest of send/verify. */
      at: number;
    }
  | undefined;

const SECONDS = /after (\d+) seconds?/;

function sendError(e: { code?: string; message: string }, channel: Channel): string {
  if (e.code === "over_sms_send_rate_limit") {
    const s = SECONDS.exec(e.message)?.[1];
    return s
      ? `Wait ${s} seconds, then ask for a new code.`
      : "Wait a minute, then ask for a new code.";
  }
  if (e.code === "over_request_rate_limit" || /rate|too many/i.test(e.message))
    return "Too many codes asked for. Wait a few minutes and try again.";
  if (e.code === "phone_provider_disabled" || e.code === "sms_send_failed") {
    console.error("[portal] phone code not sent:", channel, e.code, e.message);
    return channel === "whatsapp"
      ? "We couldn’t send it on WhatsApp. Try “Send by SMS instead”, or sign in with email."
      : "We couldn’t send the SMS. Check the number, or sign in with email.";
  }
  if (e.code === "validation_failed" || /phone/i.test(e.message))
    return "That number doesn’t look right. Check it and the country code.";
  console.error("[portal] phone sign-in error:", e.code, e.message);
  return "Something went wrong on our side. Try again in a minute.";
}

/**
 * Codes go out through Supabase's Send SMS hook (supabase/functions/send-sms), which sends them
 * in English via Twilio Verify. The hook isn't told WhatsApp or SMS, so record the choice first.
 * Without PORTAL_HOOK_SECRET (or if this fails) the hook defaults to WhatsApp.
 */
async function recordChannel(phone: string, channel: Channel) {
  if (!process.env.PORTAL_HOOK_SECRET) return;
  const r = await fetch(`${portalUrl}/rest/v1/rpc/portal_otp_intent`, {
    method: "POST",
    headers: { apikey: portalKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_secret: process.env.PORTAL_HOOK_SECRET,
      p_phone: phone,
      p_channel: channel,
    }),
  }).catch((e: Error) => e);
  if (r instanceof Error || !r.ok)
    console.error(
      "[portal] couldn't record the code channel",
      r instanceof Error ? r.message : r.status,
    );
}

/** Tells Twilio the code was used (required for Verify custom codes); never blocks sign-in. */
async function reportCodeUsed(phone: string) {
  if (!process.env.PORTAL_HOOK_SECRET) return;
  await fetch(`${portalUrl}/functions/v1/otp-feedback`, {
    method: "POST",
    headers: {
      "x-portal-hook-secret": process.env.PORTAL_HOOK_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone }),
  }).catch((e: Error) => console.error("[portal] otp feedback failed", e.message));
}

export async function sendPhoneCode(prev: PhoneState, form: FormData): Promise<PhoneState> {
  const db = await portalDb();
  const at = Date.now();
  if (!db) return { step: "phone", error: "The portal isn’t configured.", at };
  const channel: Channel = form.get("channel") === "sms" ? "sms" : "whatsapp";
  // Resending reuses the number already confirmed on screen; a first send reads the field.
  let phone = String(form.get("e164") ?? "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    const country = COUNTRIES.find((c) => c.iso === form.get("phone_country")) ?? DEFAULT_COUNTRY;
    phone = toE164(String(form.get("phone") ?? ""), country) ?? "";
  }
  if (!phone)
    return { step: "phone", error: "Enter your WhatsApp number, with the right country code.", at };
  await recordChannel(phone, channel);
  const { error } = await db.auth.signInWithOtp({ phone, options: { channel } });
  if (error)
    return {
      ...prev,
      step: prev?.step ?? "phone",
      phone,
      channel,
      error: sendError(error, channel),
      notice: undefined,
      at,
    };
  return {
    step: "code",
    phone,
    channel,
    sentAt: at,
    at,
    notice:
      prev?.step === "code"
        ? `New code sent by ${channel === "sms" ? "SMS" : "WhatsApp"}.`
        : undefined,
  };
}

export async function verifyPhoneCode(_: PhoneState, form: FormData): Promise<PhoneState> {
  const db = await portalDb();
  const at = Date.now();
  const phone = String(form.get("e164") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!db || !/^\+[1-9]\d{7,14}$/.test(phone))
    return { step: "phone", error: "Enter your number again.", at };
  if (code.length !== 6) return { step: "code", error: "Enter the 6-digit code.", at };
  const { error } = await db.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error) {
    if (/rate|too many/i.test(error.message) || error.code === "over_request_rate_limit")
      return {
        step: "code",
        error: "Too many tries. Wait a few minutes, then ask for a new code.",
        at,
      };
    return {
      step: "code",
      error: "That code isn’t right or has expired. Check it, or ask for a new one.",
      at,
    };
  }
  after(() => reportCodeUsed(phone));
  const claimed = await syncAfterSignIn(db);
  const next = safeNext(form.get("next"));
  redirect(claimed ? `${next}${next.includes("?") ? "&" : "?"}claimed=${claimed}` : next);
}
