"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const B = "/portal-preview";

export default function Login() {
  const router = useRouter();
  const [via, setVia] = useState<"whatsapp" | "email">("whatsapp");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("55 214 7390");
  const [channel, setChannel] = useState<"WhatsApp" | "SMS">("WhatsApp");
  const [wait, setWait] = useState(30);
  const [reset, setReset] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "code" || wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [step, wait]);

  const send = (c: "WhatsApp" | "SMS") => {
    setChannel(c);
    setStep("code");
    setWait(30);
    setTimeout(() => boxes.current[0]?.focus(), 50);
  };

  return (
    <main className="pt-auth" id="main">
      <div className="pt-card">
        <span className="pt-logo">
          <i className="rec-dot" aria-hidden="true" /> MILKYWAYY
        </span>
        <div>
          <span className="pt-eb">Client portal</span>
          <h1 className="pt-h1">Sign in</h1>
        </div>

        <div
          className="pt-seg"
          role="group"
          aria-label="Sign in with"
          style={{ width: "100%", gridAutoColumns: "1fr" }}
        >
          <button
            type="button"
            aria-pressed={via === "whatsapp"}
            onClick={() => setVia("whatsapp")}
          >
            WhatsApp
          </button>
          <button type="button" aria-pressed={via === "email"} onClick={() => setVia("email")}>
            Email
          </button>
        </div>

        {via === "whatsapp" && step === "phone" && (
          <form className="pt-form" onSubmit={(e) => (e.preventDefault(), send("WhatsApp"))}>
            <div className="pt-field">
              Your WhatsApp number
              <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 8 }}>
                <select aria-label="Country code" defaultValue="+971">
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+966">🇸🇦 +966</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+91">🇮🇳 +91</option>
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-label="Phone number"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-p">
              Send code on WhatsApp
            </button>
          </form>
        )}

        {via === "whatsapp" && step === "code" && (
          <form
            className="pt-form"
            onSubmit={(e) => (e.preventDefault(), router.push(`${B}/welcome`))}
          >
            <p style={{ margin: 0 }}>
              Enter the 6-digit code we sent by {channel} to <b>+971 {phone}</b>.{" "}
              <button type="button" className="lnk" onClick={() => setStep("phone")}>
                Change
              </button>
            </p>
            <div className="pt-otp">
              {Array.from({ length: 6 }, (_, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  aria-label={`Digit ${i + 1}`}
                  onChange={(e) => {
                    if (e.target.value && i < 5) boxes.current[i + 1]?.focus();
                  }}
                />
              ))}
            </div>
            <button type="submit" className="btn btn-p">
              Verify and sign in
            </button>
            <div className="pt-small pt-muted">
              {wait > 0 ? (
                <>Didn’t get it? You can resend in 0:{String(wait).padStart(2, "0")}.</>
              ) : (
                <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <button type="button" className="lnk" onClick={() => send("WhatsApp")}>
                    Resend on WhatsApp
                  </button>
                  <button type="button" className="lnk" onClick={() => send("SMS")}>
                    Send by SMS instead
                  </button>
                </span>
              )}
            </div>
            <span className="pt-meta">
              Mockup: any code works. First sign-in goes to the welcome screen.
            </span>
          </form>
        )}

        {via === "email" && (
          <form
            className="pt-form"
            onSubmit={(e) => (e.preventDefault(), router.push(`${B}/home`))}
          >
            <label className="pt-field">
              Email
              <input type="email" autoComplete="email" defaultValue="jenna@northlake.example" />
            </label>
            <label className="pt-field">
              Password
              <input type="password" autoComplete="current-password" defaultValue="mockup-only" />
            </label>
            <button type="submit" className="btn btn-p">
              Sign in
            </button>
            {reset ? (
              <span className="pt-meta">
                If that email has an account, a reset link is on its way.
              </span>
            ) : (
              <button
                type="button"
                className="lnk pt-small"
                style={{ justifySelf: "start" }}
                onClick={() => setReset(true)}
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        <label className="pt-check pt-small">
          <input type="checkbox" defaultChecked /> Keep me signed in on this device (30 days)
        </label>
        <p className="pt-meta" style={{ margin: 0 }}>
          New here? Signing in creates your account. Bookings you made on the website with this
          number or email show up automatically.{" "}
          <Link href="/" className="lnk">
            milkywayy.com
          </Link>
        </p>
      </div>
    </main>
  );
}
