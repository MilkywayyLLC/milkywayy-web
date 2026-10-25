"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { RequestConfig } from "@/lib/portal/requests";
import { BookingFlow, STEPS, type BookingEdit, type ShootKind, type StepId } from "./BookingFlow";
import { BookStep, ServiceCard } from "./BookFrame";
import { ProjectRequestModal } from "./NewProjectForm";
import { money } from "@/lib/portal/billing";
import { lowestShootPrice } from "@/lib/pricing";
import { Back } from "./ui";

type Choice = ShootKind | "edit";
/** "What are you booking?" (owner, 18 Oct 2026), by the account's enabled services. */
const CHOICES: {
  k: Choice;
  icon: string;
  title: string;
  line: string;
  list: string[];
  /** The rate card key for "from" (property: the lowest photo price). */
  from: string | null;
  perm: "shoots" | "editing";
}[] = [
  {
    k: "property",
    icon: "building",
    title: "Property shoot",
    line: "Photos, 360° tour and video for a listing",
    list: ["Photography & twilight", "360° virtual tour", "Walkthrough video"],
    from: null,
    perm: "shoots",
  },
  {
    k: "content",
    icon: "video",
    title: "Content shoot",
    line: "Reels and YouTube for social media",
    list: ["Social media reels", "YouTube videos", "Edited or raw"],
    from: "content_2h",
    perm: "shoots",
  },
  {
    k: "edit",
    icon: "editing",
    title: "Edit only",
    line: "You send the files, we edit",
    list: ["Reels", "Long-form", "Listing photo edits"],
    from: "reel",
    perm: "editing",
  },
];

/**
 * Book media as a page in the client dashboard (owner, 18 Oct 2026; was a modal): "What are you
 * booking?" (skipped with one choice), then the chosen flow. Where you are is in the URL
 * (`kind`, `step`), so the browser's back button steps back. `?only=shoot` offers the two shoots
 * (the Shoots tab), `?kind=…` opens a flow, `?draft=1` restores its draft at its step, `?edit=REF`
 * (with `edit` loaded on the server) changes a Requested or Confirmed shoot, opening at the Summary.
 */
export function BookPage({
  cfg,
  edit,
  only,
}: {
  cfg: RequestConfig;
  edit?: BookingEdit & { kind: ShootKind };
  only?: "shoot";
}) {
  const params = useSearchParams();
  const choices = CHOICES.filter((c) => cfg[c.perm] && (only !== "shoot" || c.k !== "edit"));
  const asked = params.get("kind") as Choice | null;
  const draft = params.get("draft") === "1";
  const kind: Choice | "pick" = edit
    ? edit.kind
    : asked && choices.some((c) => c.k === asked)
      ? asked
      : choices.length === 1
        ? choices[0].k
        : draft
          ? "property"
          : "pick";
  const asStep = params.get("step") as StepId | null;
  const step: StepId = asStep && STEPS.includes(asStep) ? asStep : edit ? "review" : "services";
  const [run, setRun] = useState(0);
  /** Flows left with a saved draft this visit: picking them again restores it silently. */
  const [left, setLeft] = useState<Choice[]>([]);

  /** Change the URL without a server round trip (the back button follows it). */
  const go = (patch: Record<string, string | null>, replace = false) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    const url = `${location.pathname}${q.size ? `?${q}` : ""}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  };
  const toPick =
    choices.length > 1 && !edit
      ? (from: Choice) => () => {
          setLeft((l) => [...l, from]);
          go({ kind: null, step: null, draft: null });
        }
      : undefined;
  const another = () => {
    setLeft([]);
    setRun((r) => r + 1);
    go({ kind: choices.length > 1 ? null : kind, step: null, draft: null });
  };
  const resume = draft || (kind !== "pick" && left.includes(kind));

  /** "from AED 450" (price access only). */
  const fromPrice = (c: (typeof CHOICES)[number]) => {
    const r = cfg.price.rates;
    if (!r) return null;
    const n = c.k === "property" ? lowestShootPrice(cfg.pricing) : c.from ? r[c.from] : null;
    return n == null || !Number.isFinite(Number(n)) ? null : (
      <span className="bkp-price">from {money(cfg.price.currency, Number(n))}</span>
    );
  };
  const title = edit
    ? edit.status === "confirmed"
      ? "Request a change"
      : "Edit details"
    : "Book media";
  return (
    <div className="bkp">
      {/* Phones: "Back to dashboard" only on "What are you booking?"; later steps have "Back". */}
      <div className="bkp-top" data-sub={kind !== "pick" && !edit ? "" : undefined}>
        {edit ? (
          <Back href={`/portal/shoots/${encodeURIComponent(edit.ref)}`} label="Back to shoot" />
        ) : (
          <Back href="/portal" label="Back to dashboard" />
        )}
        <h1 className="pt-h1">{title}</h1>
      </div>
      {kind === "pick" && (
        <BookStep heading="What are you booking?" eyebrow="Book media" wide>
          <div className="bkp-cards bkp-cards-3" role="group" aria-label="What are you booking?">
            {choices.map((c) => (
              <ServiceCard
                key={c.k}
                icon={c.icon}
                title={c.title}
                line={c.line}
                list={c.list}
                price={fromPrice(c)}
                on={false}
                tick={false}
                onToggle={() => go({ kind: c.k, step: null })}
              />
            ))}
          </div>
          {cfg.avatars && (
            <p className="bkp-avatar-link">
              Need an AI avatar? <Link href="/portal/avatars/new">Start here</Link>
            </p>
          )}
        </BookStep>
      )}
      {(kind === "property" || kind === "content") && (
        <BookingFlow
          key={run}
          cfg={cfg}
          kind={kind}
          onKind={(k) => go({ kind: k }, true)}
          lockKind={!!asked}
          step={step}
          onStep={(s, replace) => go({ step: s === "services" ? null : s }, replace)}
          resume={resume}
          edit={edit}
          onBack={toPick?.(kind)}
          onAnother={another}
        />
      )}
      {kind === "edit" && (
        <ProjectRequestModal
          key={run}
          type="edit"
          cfg={cfg}
          resume={resume}
          onBack={toPick?.("edit")}
          onAnother={another}
        />
      )}
    </div>
  );
}
