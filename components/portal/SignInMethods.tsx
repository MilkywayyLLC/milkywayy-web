"use client";

import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { PhoneLogin } from "./PhoneLogin";

/**
 * Email is the way in (owner, 3 Oct 2026). WhatsApp/SMS codes stay built but only show when the
 * phone sign-in switch is on and the portal's Supabase project has a phone provider.
 */
export function SignInMethods({
  next,
  phone,
  startOn,
}: {
  next: string;
  phone: boolean;
  startOn: "code" | "password" | "whatsapp";
}) {
  const [method, setMethod] = useState<"email" | "whatsapp">(
    phone && startOn === "whatsapp" ? "whatsapp" : "email",
  );
  return (
    <div className="pt-form">
      {phone && (
        <div
          className="pt-seg"
          role="group"
          aria-label="Sign in with"
          style={{ width: "100%", gridAutoColumns: "1fr" }}
        >
          <button
            type="button"
            aria-pressed={method === "email"}
            onClick={() => setMethod("email")}
          >
            Email
          </button>
          <button
            type="button"
            aria-pressed={method === "whatsapp"}
            onClick={() => setMethod("whatsapp")}
          >
            WhatsApp
          </button>
        </div>
      )}
      {method === "whatsapp" ? (
        <PhoneLogin next={next} />
      ) : (
        <LoginForm next={next} startOn={startOn === "password" ? "password" : "code"} />
      )}
      <p className="pt-meta" style={{ margin: 0 }}>
        New here? Signing in creates your account. Bookings you made on the website with the same
        {phone ? " number or email" : " email"} show up automatically.
      </p>
    </div>
  );
}
