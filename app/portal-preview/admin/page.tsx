"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/portal-mock/Icon";
import { Badge, Sheet, useToast } from "@/components/portal-mock/ui";
import { BOARD, BOARD_COLUMNS } from "@/lib/portal-mock/data";

type Item = (typeof BOARD)[number];
const NEXT: Record<string, string[]> = {
  Shoot: ["Requested", "Confirmed", "Shot", "In editing", "Delivered", "Revision"],
  Edit: ["Requested", "In editing", "Delivered", "Revision", "On hold"],
  Avatar: ["Requested", "In editing", "Delivered", "Revision"],
};
const MESSAGE: Record<string, (i: Item) => string> = {
  Confirmed: (i) =>
    `Your shoot ${i.ref} is confirmed for Mon 5 Oct, morning. Details: milkywayy.com/portal/shoots/${i.ref}`,
  Delivered: (i) => `Your files for ${i.ref} are ready. Download: milkywayy.com/portal/${i.ref}`,
  "On hold": (i) =>
    `${i.ref} is on hold: we need something from you. See milkywayy.com/portal/${i.ref}`,
};

export default function AdminBoard() {
  const [items, setItems] = useState(BOARD.map((b) => ({ ...b })));
  const [view, setView] = useState<"board" | "list">("board");
  const [svc, setSvc] = useState("All");
  const [move, setMove] = useState<{ item: Item; to: string } | null>(null);
  const [toast, say] = useToast();
  const shown = items.filter((i) => svc === "All" || i.type === svc);

  const apply = (notify: boolean) => {
    if (!move) return;
    setItems(items.map((i) => (i.ref === move.item.ref ? { ...i, status: move.to } : i)));
    say(`${move.item.ref} → ${move.to}${notify ? " · client notified (mockup)" : ""}`);
    setMove(null);
  };

  const ticket = (i: Item) => (
    <button
      key={i.ref}
      type="button"
      className="pt-ticket"
      style={{ textAlign: "left", cursor: "pointer", color: "var(--fg)" }}
      onClick={() =>
        setMove({
          item: i,
          to: NEXT[i.type][Math.min(NEXT[i.type].indexOf(i.status) + 1, NEXT[i.type].length - 1)],
        })
      }
    >
      <span className="pt-eb">
        {i.ref} · {i.type}
      </span>
      <b>{i.title}</b>
      <span className="pt-meta">{i.client}</span>
      <span className="pt-meta pt-mono">{i.when}</span>
    </button>
  );

  return (
    <div className="pt-content" style={{ maxWidth: 1600 }}>
      <div className="pt-head">
        <div>
          <span className="pt-eb">Admin · mockup of /admin/projects</span>
          <h1 className="pt-h1">Projects</h1>
        </div>
        <Link href="/portal-preview" className="btn btn-g btn-s">
          <Icon name="back" size={16} /> Screens
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="pt-seg" role="group" aria-label="Service">
          {["All", "Shoot", "Edit", "Avatar"].map((s) => (
            <button key={s} type="button" aria-pressed={svc === s} onClick={() => setSvc(s)}>
              {s}
            </button>
          ))}
        </div>
        <select aria-label="Client" defaultValue="" style={{ width: "auto", minHeight: 42 }}>
          <option value="">All clients</option>
          <option>Harbourline Properties</option>
          <option>Northlake Media Co.</option>
          <option>Omar Siddiqui</option>
        </select>
        <div className="pt-seg pt-board-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>
            Board
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            List
          </button>
        </div>
      </div>

      {view === "board" && (
        <div className="pt-board">
          {BOARD_COLUMNS.map((c) => {
            const col = shown.filter((i) => i.status === c);
            return (
              <section key={c} className="pt-col" aria-label={c}>
                <div className="pt-col-head">
                  <b className="pt-eb" style={{ color: "var(--fg)" }}>
                    {c}
                  </b>
                  <span className="pt-eb">{col.length}</span>
                </div>
                {col.map(ticket)}
              </section>
            );
          })}
        </div>
      )}

      {/* Phone (and desktop List view): one row per project with one-tap status buttons. */}
      <div className={`pt-stack ${view === "board" ? "pt-board-phone" : ""}`}>
        {shown.map((i) => (
          <article key={i.ref} className="pt-card" style={{ gap: 10 }}>
            <div className="pt-row">
              <span className="pt-eb">
                {i.ref} · {i.type}
              </span>
              <Badge
                tone={
                  i.status === "On hold" ? "warn" : i.status === "Requested" ? "gold" : undefined
                }
              >
                {i.status}
              </Badge>
            </div>
            <div>
              <b>{i.title}</b>
              <div className="pt-meta">
                {i.client} · {i.when}
              </div>
            </div>
            <div className="pt-status-btns" role="group" aria-label={`Set status for ${i.ref}`}>
              {NEXT[i.type].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={i.status === s}
                  onClick={() => i.status !== s && setMove({ item: i, to: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      {move && (
        <Sheet title={`${move.item.ref} → ${move.to}`} onClose={() => setMove(null)}>
          <span className="pt-meta">
            {move.item.title} · {move.item.client}
          </span>
          {move.to === "Confirmed" && (
            <div className="pt-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="pt-field">
                Date
                <input type="date" defaultValue="2026-10-05" />
              </label>
              <label className="pt-field">
                Slot
                <select defaultValue="Morning">
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Evening</option>
                </select>
              </label>
            </div>
          )}
          {move.to === "On hold" && (
            <label className="pt-field">
              Reason the client sees
              <input type="text" defaultValue="Waiting on client: " />
            </label>
          )}
          <div className="pt-field">
            Notify client?
            <label className="pt-check">
              <input type="checkbox" defaultChecked /> WhatsApp (from the notifications number)
            </label>
            <label className="pt-check">
              <input type="checkbox" defaultChecked /> Email
            </label>
          </div>
          <div className="pt-script pt-small">
            {(
              MESSAGE[move.to] ??
              ((i: Item) => `Update on ${i.ref}: now ${move.to}. milkywayy.com/portal/${i.ref}`)
            )(move.item)}
          </div>
          <div className="pt-btns">
            <button type="button" className="btn btn-p btn-s" onClick={() => apply(true)}>
              Save and notify
            </button>
            <button type="button" className="btn btn-g btn-s" onClick={() => apply(false)}>
              Save without notifying
            </button>
          </div>
        </Sheet>
      )}
      {toast}
    </div>
  );
}
