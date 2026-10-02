"use client";

import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { PhoneLogin } from "./PhoneLogin";

/** WhatsApp first (Dubai clients live on it), email for overseas clients (guide D4). */
export function SignInMethods({
  next,
  phone,
  startOn,
  emailMode,
}: {
  next: string;
  phone: boolean;
  startOn: "whatsapp" | "email";
  emailMode: "signin" | "signup";
}) {
  const [method, setMethod] = useState(phone ? startOn : "email");
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
            aria-pressed={method === "whatsapp"}
            onClick={() => setMethod("whatsapp")}
          >
            WhatsApp
          </button>
          <button
            type="button"
            aria-pressed={method === "email"}
            onClick={() => setMethod("email")}
          >
            Email
          </button>
        </div>
      )}
      {method === "whatsapp" ? (
        <PhoneLogin next={next} />
      ) : (
        <LoginForm next={next} startOn={emailMode} />
      )}
      <p className="pt-meta" style={{ margin: 0 }}>
        New here? Signing in creates your account. Bookings you made on the website with the same
        {phone ? " number or email" : " email"} show up automatically.
      </p>
    </div>
  );
}
