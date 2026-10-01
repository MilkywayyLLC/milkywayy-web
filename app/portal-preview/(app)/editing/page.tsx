"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/portal-mock/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Badge, NotFor, Sheet, Stepper, useToast } from "@/components/portal-mock/ui";
import { BATCHES, COMPLETED_BATCHES, EDIT_STEPS } from "@/lib/portal-mock/data";

const B = "/portal-preview";

export default function Editing() {
  const { account } = usePersona();
  const [tab, setTab] = useState<"active" | "done">("active");
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<string | null>(null);
  const [toast, say] = useToast();
  if (!account.services.includes("editing")) return <NotFor what="post-production" />;
  const done = COMPLETED_BATCHES.filter((b) =>
    `${b.ref} ${b.title} ${b.kind}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Post-production</span>
          <h1 className="pt-h1">Editing</h1>
        </div>
        <Link href={`${B}/editing/new`} className="btn btn-p btn-s">
          <Icon name="plus" size={16} /> New batch
        </Link>
      </div>

      <div className="pt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
        >
          Active ({BATCHES.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "done"}
          onClick={() => setTab("done")}
        >
          Completed
        </button>
      </div>

      {tab === "active" ? (
        <div className="pt-grid2">
          {BATCHES.map((b) => (
            <Link key={b.ref} href={`${B}/editing/${b.ref}`} className="pt-card pt-card-link">
              <div className="pt-row">
                <span className="pt-eb">
                  {b.ref} · {b.kind}
                </span>
                <Badge
                  tone={
                    b.status === "On hold" ? "warn" : b.status === "Delivered" ? "gold" : undefined
                  }
                >
                  {b.revision.state ?? b.status}
                </Badge>
              </div>
              <b className="pt-title">{b.title}</b>
              {b.status === "On hold" ? (
                <div className="pt-hold">
                  <b style={{ color: "#b42318" }}>On hold</b>
                  <span className="pt-small">{b.hold}</span>
                </div>
              ) : (
                <Stepper steps={EDIT_STEPS} now={b.status} />
              )}
              <span className="pt-meta">
                {b.count} · submitted {b.submitted}
                {b.latest && ` · ${b.latest}`}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          <input
            type="search"
            placeholder="Search past projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search past projects"
          />
          <div className="pt-list">
            {done.map((b) => (
              <div key={b.ref} style={{ display: "grid", gap: 10 }}>
                <div>
                  <b className="pt-title">{b.title}</b>
                  <div className="pt-meta">
                    {b.ref} · {b.kind} · {b.count} · completed {b.done}
                  </div>
                </div>
                <div className="pt-btns">
                  <button
                    type="button"
                    className="btn btn-g btn-s pt-btn-sm"
                    onClick={() => say(`${b.ref}.zip download started (mockup)`)}
                  >
                    <Icon name="download" size={16} /> Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-g btn-s pt-btn-sm"
                    onClick={() => setAsk(b.ref)}
                  >
                    Ask about this project
                  </button>
                </div>
              </div>
            ))}
            {done.length === 0 && <p className="pt-meta">Nothing matches “{q}”.</p>}
          </div>
        </>
      )}

      {ask && (
        <Sheet title={`Ask about ${ask}`} onClose={() => setAsk(null)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setAsk(null);
              say("Sent. We’ll reply in this project’s thread (mockup)");
            }}
          >
            <label className="pt-field">
              Your request
              <textarea required placeholder="e.g. Need 5 more photos in square format" />
            </label>
            <button type="submit" className="btn btn-p">
              Send
            </button>
          </form>
        </Sheet>
      )}
      {toast}
    </>
  );
}
