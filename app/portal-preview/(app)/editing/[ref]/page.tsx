"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/portal/Icon";
import { usePersona } from "@/components/portal-mock/persona";
import { Back, Badge, NotFor, Sheet, Stepper, useToast } from "@/components/portal/ui";
import { BATCHES, EDIT_STEPS } from "@/lib/portal-mock/data";

export default function BatchPage() {
  const { ref } = useParams<{ ref: string }>();
  const { account } = usePersona();
  const b = BATCHES.find((x) => x.ref === ref) ?? BATCHES[0];
  const [sheet, setSheet] = useState<null | "revision" | "file">(null);
  const [toast, say] = useToast();
  if (!account.services.includes("editing")) return <NotFor what="post-production" />;
  const hasDelivery = b.deliveries.length > 0;
  const nextRound = b.revision.used + 1;

  return (
    <>
      <Back href="/portal-preview/editing" label="Editing" />
      <div className="pt-head">
        <div>
          <span className="pt-eb">
            {b.ref} · {b.kind} · {b.count}
          </span>
          <h1 className="pt-h1" style={{ fontSize: 26 }}>
            {b.title}
          </h1>
        </div>
        <Badge
          tone={b.status === "On hold" ? "warn" : b.status === "Delivered" ? "gold" : undefined}
        >
          {b.status}
        </Badge>
      </div>

      {b.status === "On hold" ? (
        <div className="pt-hold">
          <b style={{ color: "#b42318" }}>On hold: waiting on you</b>
          <span>{b.hold}</span>
          <button
            type="button"
            className="btn btn-p btn-s"
            style={{ justifySelf: "start", marginTop: 6 }}
            onClick={() => setSheet("file")}
          >
            Add the file
          </button>
        </div>
      ) : (
        <Stepper steps={EDIT_STEPS} now={b.status} />
      )}

      {b.revision.state && (
        <div className="pt-row pt-card" style={{ padding: "12px 16px" }}>
          <span>
            <b>{b.revision.state}</b> · round {b.revision.used} of {b.revision.of}
          </span>
          <Badge tone="gold">New</Badge>
        </div>
      )}

      {hasDelivery && (
        <div className="pt-btns">
          <button
            type="button"
            className="btn btn-p"
            onClick={() => say("Download started (mockup)")}
          >
            <Icon name="download" size={18} /> Download latest
          </button>
          <button
            type="button"
            className="btn btn-g"
            disabled={nextRound > b.revision.of}
            onClick={() => setSheet("revision")}
          >
            {nextRound > b.revision.of
              ? "No revision rounds left"
              : `Request revision (${nextRound} of ${b.revision.of})`}
          </button>
          <button
            type="button"
            className="btn btn-g"
            onClick={() => say("Approved (mockup: nothing saved)")}
          >
            <Icon name="check" size={18} /> Approve
          </button>
        </div>
      )}

      <div className="pt-grid2">
        <section className="pt-card">
          <h2 className="pt-h2">Deliveries</h2>
          {hasDelivery ? (
            <div className="pt-list">
              {[...b.deliveries].reverse().map((d) => (
                <div key={d.name} className="pt-file">
                  <div>
                    <b>{d.name}</b>
                    <div className="pt-meta">
                      {d.at} · {d.files}
                    </div>
                    {d.note && <div className="pt-small">{d.note}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-g btn-s pt-btn-sm"
                    onClick={() => say(`${d.name} download started (mockup)`)}
                  >
                    <Icon name="download" size={16} title={`Download ${d.name}`} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-meta" style={{ margin: 0 }}>
              Nothing delivered yet. {b.latest}
            </p>
          )}
        </section>

        <section className="pt-card">
          <h2 className="pt-h2">Files in</h2>
          <div className="pt-list">
            {b.files.map((f) => (
              <div key={f.label}>
                <b>{f.label}</b>
                <div className="pt-meta pt-mono" style={{ overflowWrap: "anywhere" }}>
                  {f.url}
                </div>
              </div>
            ))}
          </div>
          {b.notes && (
            <>
              <span className="pt-eb">Your notes</span>
              <p style={{ margin: 0 }}>{b.notes}</p>
            </>
          )}
          <button
            type="button"
            className="lnk pt-small"
            style={{ justifySelf: "start" }}
            onClick={() => setSheet("file")}
          >
            + Add files
          </button>
        </section>
      </div>

      <section className="pt-card">
        <h2 className="pt-h2">Messages</h2>
        {b.thread.length === 0 && (
          <p className="pt-meta" style={{ margin: 0 }}>
            No messages yet.
          </p>
        )}
        {b.thread.map((m) => (
          <div key={m.at} className={`pt-msg ${m.admin ? "admin" : ""}`}>
            <span className="pt-eb">
              {m.who} · {m.at}
            </span>
            {m.body}
          </div>
        ))}
        <form
          className="pt-form"
          onSubmit={(e) => (e.preventDefault(), say("Message sent (mockup)"))}
        >
          <textarea placeholder="Write a message" aria-label="Message" />
          <button type="submit" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
            Send
          </button>
        </form>
      </section>

      {sheet === "revision" && (
        <Sheet title={`Revision ${nextRound} of ${b.revision.of}`} onClose={() => setSheet(null)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSheet(null);
              say("Revision requested (mockup)");
            }}
          >
            <label className="pt-field">
              What should change? *
              <textarea
                required
                placeholder="Point to file names or timecodes, e.g. IMG_3340: sky too blue. Reel 2 at 0:12: cut the pause."
              />
            </label>
            <button type="button" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
              Attach screenshots
            </button>
            <p className="pt-meta" style={{ margin: 0 }}>
              {b.revision.of - b.revision.used} round
              {b.revision.of - b.revision.used === 1 ? "" : "s"} left on this batch. Need more? Ask
              in Messages.
            </p>
            <button type="submit" className="btn btn-p">
              Send revision request
            </button>
          </form>
        </Sheet>
      )}
      {sheet === "file" && (
        <Sheet title="Add files" onClose={() => setSheet(null)}>
          <form
            className="pt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSheet(null);
              say("File added. We’ll pick it up (mockup)");
            }}
          >
            <label className="pt-field">
              Label
              <input
                type="text"
                defaultValue={b.status === "On hold" ? "Music licence" : "More files"}
              />
            </label>
            <label className="pt-field">
              Link
              <input type="url" placeholder="Paste a link" />
            </label>
            <button type="button" className="btn btn-g btn-s" style={{ justifySelf: "start" }}>
              Or upload a file (up to 5 GB)
            </button>
            <button type="submit" className="btn btn-p">
              Add
            </button>
          </form>
        </Sheet>
      )}
      {toast}
    </>
  );
}
