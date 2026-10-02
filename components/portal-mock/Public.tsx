"use client";

import { Icon } from "@/components/portal/Icon";
import { useToast } from "@/components/portal/ui";
import { CONTACTS } from "@/lib/portal-mock/data";

/** Agent contact block + sticky bar on public pages. Mockup: buttons don't dial the (fake) numbers. */
export function AgentContact({
  title,
  url,
  ids = ["c1"],
}: {
  title: string;
  url: string;
  ids?: string[];
}) {
  const [toast, say] = useToast();
  const agents = CONTACTS.filter((c) => ids.includes(c.id));
  const wa = (name: string) =>
    say(`Opens WhatsApp to ${name}: “Hi, I’m interested in ${title} (${url})”`);
  return (
    <>
      <section className="pt-card" aria-labelledby="agent">
        <span id="agent" className="pt-eb">
          Ask about this home
        </span>
        {agents.map((a) => (
          <div key={a.id} className="pt-row">
            <span className="pt-pill" style={{ border: 0, padding: 0, cursor: "default" }}>
              <span className="pt-pill-face">{a.initials}</span>
              <span>
                {a.name}
                <small>
                  {a.role} · Harbourline Properties · {a.brn}
                </small>
              </span>
            </span>
          </div>
        ))}
      </section>
      <div className="pt-cta-bar">
        <button type="button" className="btn btn-p" onClick={() => wa(agents[0].name)}>
          WhatsApp
        </button>
        <button type="button" className="btn btn-g" onClick={() => say(`Calls ${agents[0].name}`)}>
          <Icon name="phone" size={18} /> Call
        </button>
      </div>
      {toast}
    </>
  );
}

export function Byline() {
  return (
    <footer className="pt-byline">
      <span>Media &amp; page by Milkywayy</span>
      <a href="/property-shoots">Get yours →</a>
    </footer>
  );
}
