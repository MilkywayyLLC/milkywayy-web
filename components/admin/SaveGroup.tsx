"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { cx } from "@/lib/cx";

/**
 * One Save per tab (admin redesign, 27 Oct 2026). Each block keeps its own server action and
 * registers a slot: whether it has unsaved changes, and how to save them. The bar saves the dirty
 * slots in `order`, one after another, then refreshes once. Nothing about what is saved changes.
 */
export type SaveResult = { ok: boolean; error?: string; notice?: string };
type Slot = { label: string; order: number; dirty: boolean; save: () => Promise<SaveResult> };

const Ctx = createContext<{
  set: (id: string, s: Slot | null) => void;
} | null>(null);

export function useSaveSlot(
  id: string,
  label: string,
  order: number,
  dirty: boolean,
  save: () => Promise<SaveResult>,
) {
  const g = useContext(Ctx);
  const ref = useRef(save);
  useEffect(() => {
    ref.current = save;
  });
  useEffect(() => {
    g?.set(id, { label, order, dirty, save: () => ref.current() });
  }, [g, id, label, order, dirty]);
  useEffect(() => () => g?.set(id, null), [g, id]);
  return !!g;
}

export function SaveGroup({ children, label }: { children: React.ReactNode; label: string }) {
  const router = useRouter();
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [msg, setMsg] = useState<SaveResult>();
  const [pending, start] = useTransition();
  const set = useCallback((id: string, s: Slot | null) => {
    setSlots((prev) => {
      const next = { ...prev };
      if (s) next[id] = s;
      else delete next[id];
      return next;
    });
  }, []);
  const ctx = useMemo(() => ({ set }), [set]);
  const dirty = Object.values(slots)
    .filter((s) => s.dirty)
    .sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  const save = () =>
    start(async () => {
      setMsg(undefined);
      const errors: string[] = [];
      for (const s of dirty) {
        const r = await s.save();
        if (!r.ok) errors.push(`${s.label}: ${r.error ?? "not saved"}`);
      }
      setMsg(
        errors.length ? { ok: false, error: errors.join(" · ") } : { ok: true, notice: "Saved." },
      );
      router.refresh();
    });

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className={cx("ad-savebar", dirty.length > 0 && "dirty")} aria-label={`Save ${label}`}>
        <span className={cx("ad-small", msg && !msg.ok && "ad-err")} role="status">
          {pending
            ? "Saving…"
            : msg && !msg.ok
              ? msg.error
              : dirty.length
                ? `Unsaved: ${dirty.map((s) => s.label).join(", ")}`
                : (msg?.notice ?? "All changes saved")}
        </span>
        <button
          type="button"
          className="ad-btn"
          disabled={pending || !dirty.length}
          onClick={save}
          data-testid="save-tab"
        >
          Save {label}
        </button>
      </div>
    </Ctx.Provider>
  );
}
