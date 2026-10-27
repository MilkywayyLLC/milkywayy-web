"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stripe Embedded Checkout on our own page (phase 1, 27 Oct 2026). `start` asks the server for a
 * session: with a client secret it mounts Stripe's form here (card details never touch our servers);
 * without one (no publishable key set) it sends the browser to Stripe's hosted page instead.
 * Stripe.js comes from js.stripe.com, as Stripe requires.
 */
type Start = () => Promise<{
  ok: boolean;
  error?: string;
  clientSecret?: string | null;
  url?: string | null;
  pk?: string | null;
}>;
type EmbeddedCheckout = { mount: (el: HTMLElement) => void; destroy: () => void };
type StripeJs = {
  initEmbeddedCheckout: (o: {
    fetchClientSecret: () => Promise<string>;
  }) => Promise<EmbeddedCheckout>;
};
declare global {
  interface Window {
    Stripe?: (pk: string) => StripeJs;
  }
}

let loading: Promise<void> | null = null;
function loadStripe() {
  if (typeof window !== "undefined" && window.Stripe) return Promise.resolve();
  loading ??= new Promise<void>((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      loading = null;
      fail(new Error("Stripe didn’t load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function StripeEmbed({ start, label = "Payment form" }: { start: Start; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "away">("loading");
  useEffect(() => {
    let live = true;
    let checkout: EmbeddedCheckout | null = null;
    (async () => {
      const r = await start();
      if (!live) return;
      if (!r.ok) return setErr(r.error ?? "Couldn’t open the payment form.");
      if (!r.clientSecret || !r.pk) {
        if (r.url) {
          setState("away");
          window.location.assign(r.url);
        } else setErr("Couldn’t open the payment form.");
        return;
      }
      try {
        await loadStripe();
        if (!live || !window.Stripe || !box.current) return;
        const secret = r.clientSecret;
        checkout = await window.Stripe(r.pk).initEmbeddedCheckout({
          fetchClientSecret: async () => secret,
        });
        if (!live) return checkout.destroy();
        checkout.mount(box.current);
        setState("ready");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn’t open the payment form.");
      }
    })();
    return () => {
      live = false;
      checkout?.destroy();
    };
  }, [start]);
  return (
    <div className="pt-stripe" aria-label={label} aria-busy={state === "loading"}>
      {err ? (
        <p className="pt-error" role="alert">
          {err}
        </p>
      ) : state !== "ready" ? (
        <p className="pt-meta" role="status">
          {state === "away"
            ? "Opening the secure payment page…"
            : "Loading the secure payment form…"}
        </p>
      ) : null}
      <div ref={box} />
    </div>
  );
}
