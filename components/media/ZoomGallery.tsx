"use client";

/* eslint-disable @next/next/no-img-element -- full-size photos and thumbnails in the viewer */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  domAnimation,
  LazyMotion,
  m,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { EASE, EXIT, HOME, TOGGLE, useLightbox, VEIL } from "@/components/interior/lightbox";

export type ZoomPhoto = { src: string; alt: string; thumb?: string };

type Landing = { dx: number; dy: number; s: number; o: number };
const SWIPE = 50;

/**
 * The photo viewer (13 Oct 2026): interior.dev's zoom lightbox (components/interior/lightbox) as a
 * gallery in the Viewfinder look. The photo flies out of the thumbnail that opened it and back on
 * close; wheel, trackpad pinch or two fingers zoom toward the pointer, double-click toggles 2.5x,
 * drag pans when zoomed. Never crops (contain). Counter, thumbnail strip, arrows and swipe move
 * between photos; ← → too when not zoomed. Escape resets the zoom, then closes. Focus is trapped,
 * the page doesn't scroll, and focus returns to the thumbnail. `action` adds a control for the
 * current photo (the portal's "Request revision"). Reduced motion: a plain fade.
 * Load it with next/dynamic on the first click so pages don't ship Motion up front.
 */
export function ZoomGallery(props: {
  photos: ZoomPhoto[];
  start?: number;
  title: string;
  onClose: () => void;
  /** The element a photo flies from and back to (its thumbnail on the page), if it's showing. */
  originFor?: (i: number) => HTMLElement | null | undefined;
  action?: (i: number) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  // Client only: it's loaded with next/dynamic (ssr: false) when someone opens a photo.
  if (typeof document === "undefined") return null;
  return createPortal(
    <LazyMotion features={domAnimation}>
      <AnimatePresence onExitComplete={props.onClose}>
        {open ? <Stage key="zg" {...props} close={() => setOpen(false)} /> : null}
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}

function Stage({
  photos,
  start = 0,
  title,
  originFor,
  action,
  close,
}: Parameters<typeof ZoomGallery>[0] & { close: () => void }) {
  const reduced = useReducedMotion();
  const n = photos.length;
  const [i, setI] = useState(() => Math.min(Math.max(0, start), n - 1));
  const shell = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const at = useRef(i);
  useLayoutEffect(() => {
    at.current = i;
  });

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fo = useMotionValue(0);

  const { frameRef, contentRef, bind, scale, x, y, zoomed, reset, zoomAt } = useLightbox({
    maxScale: 4,
    onDismiss: close,
  });
  const { onKeyDown: zoomKeys, ...pointer } = bind;

  const go = useCallback(
    (d: number) => {
      if (n < 2) return;
      reset();
      setI((v) => (v + d + n) % n);
    },
    [n, reset],
  );

  // Where the current photo would sit on the page (its thumbnail), relative to the stage.
  const landing = useCallback((): Landing => {
    const frame = frameRef.current;
    const content = contentRef.current;
    const origin = originFor?.(at.current);
    if (frame && content && origin && content.offsetWidth > 0) {
      const o = origin.getBoundingClientRect();
      const visible = o.width > 0 && o.bottom > 0 && o.top < innerHeight;
      if (visible) {
        const r = frame.getBoundingClientRect();
        return {
          dx: o.left + o.width / 2 - (r.left + r.width / 2),
          dy: o.top + o.height / 2 - (r.top + r.height / 2),
          s: o.width / content.offsetWidth,
          o: 1,
        };
      }
    }
    return { dx: 0, dy: 10, s: 0.97, o: 0 };
  }, [contentRef, frameRef, originFor]);

  // Fly out of the thumbnail once the first photo has its size.
  const flown = useRef(false);
  const flyIn = useCallback(() => {
    if (flown.current) return;
    flown.current = true;
    if (reduced) {
      fo.set(1);
      return;
    }
    const d = landing();
    fx.set(d.dx);
    fy.set(d.dy);
    fs.set(d.s);
    fo.set(d.o);
    animate(fx, 0, HOME);
    animate(fy, 0, HOME);
    animate(fs, 1, HOME);
    animate(fo, 1, HOME);
  }, [fo, fs, fx, fy, landing, reduced]);
  useLayoutEffect(() => {
    if (contentRef.current?.complete) flyIn();
  }, [contentRef, flyIn]);

  const away = useCallback(() => {
    if (reduced) return { opacity: 0, transition: { duration: 0.12 } };
    const d = landing();
    return { x: d.dx, y: d.dy, scale: d.s, opacity: d.o, filter: "blur(4px)", transition: HOME };
  }, [landing, reduced]);
  const unwind = useCallback(
    () => ({ x: 0, y: 0, scale: 1, transition: reduced ? { duration: 0 } : HOME }),
    [reduced],
  );

  // Scroll lock and focus: into the stage on open, back to the thumbnail on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    const gap = innerWidth - document.documentElement.clientWidth;
    const base = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${base + gap}px`;
    frameRef.current?.focus({ preventScroll: true });
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = padding;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [frameRef]);

  // Neighbours load ahead; the active thumbnail stays in view.
  useEffect(() => {
    if (n < 2) return;
    for (const j of new Set([(i + 1) % n, (i - 1 + n) % n])) new Image().src = photos[j].src;
    strip.current
      ?.querySelector<HTMLElement>(`[data-i="${i}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [i, n, photos]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
    if (typing && e.key !== "Escape" && e.key !== "Tab") return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (zoomed) reset();
      else close();
      return;
    }
    if (!zoomed && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (e.key === "Tab") {
      const nodes = Array.from(
        shell.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, textarea, [data-zg-focus="1"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
      if (!nodes.length) return;
      const here = nodes.indexOf(document.activeElement as HTMLElement);
      const last = nodes.length - 1;
      if (e.shiftKey && here <= 0) {
        e.preventDefault();
        nodes[last].focus();
      } else if (!e.shiftKey && (here === -1 || here === last)) {
        e.preventDefault();
        nodes[0].focus();
      }
      return;
    }
    zoomKeys(e);
  };

  // Keys work wherever focus is while the viewer is open, and focus can't leave it.
  const keys = useRef(onKeyDown);
  useLayoutEffect(() => {
    keys.current = onKeyDown;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e as unknown as React.KeyboardEvent);
    const onFocus = (e: FocusEvent) => {
      if (shell.current && !shell.current.contains(e.target as Node))
        frameRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [frameRef]);

  // Swipe between photos and two-finger pinch, on top of the hook's pan and tap-to-close.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const handlers = {
    ...pointer,
    onPointerDown: (e: React.PointerEvent) => {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        pinch.current = { d: spread(), s: scale.get() };
        swipe.current = null;
        return;
      }
      swipe.current = { x: e.clientX, y: e.clientY };
      pointer.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (touches.current.has(e.pointerId))
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      if (p && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        zoomAt((p.s * spread()) / p.d, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
        return;
      }
      pointer.onPointerMove(e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size === 0) pinch.current = null;
        pointer.onPointerCancel(e);
        return;
      }
      const s = swipe.current;
      swipe.current = null;
      const dx = s ? e.clientX - s.x : 0;
      const dy = s ? e.clientY - s.y : 0;
      if (s && scale.get() <= 1.02 && Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
        pointer.onPointerCancel(e);
        go(dx < 0 ? 1 : -1);
        return;
      }
      pointer.onPointerUp(e);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      touches.current.delete(e.pointerId);
      pinch.current = null;
      pointer.onPointerCancel(e);
    },
  };

  const p = photos[i];
  const fade = reduced ? { duration: 0 } : VEIL;
  return (
    <div
      ref={shell}
      className="zg"
      data-tone="dark"
      role="dialog"
      aria-modal="true"
      aria-label={`${title}: photos`}
    >
      <m.div
        className="zg-veil"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{
          opacity: 0,
          transition: reduced ? { duration: 0.1 } : { duration: 0.3, ease: EASE },
        }}
        transition={fade}
      />
      <m.div
        className="zg-bar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: reduced ? { duration: 0 } : EXIT }}
        transition={fade}
      >
        <span className="zg-title">{title}</span>
        <span className="zg-count" aria-live="polite">
          {i + 1} / {n}
        </span>
        <span className="zg-tools">
          <button
            type="button"
            className="zg-btn"
            aria-label={zoomed ? "Zoom out" : "Zoom in"}
            onClick={() => {
              const r = frameRef.current?.getBoundingClientRect();
              if (!r) return;
              if (zoomed) reset();
              else zoomAt(TOGGLE, r.left + r.width / 2, r.top + r.height / 2, true);
            }}
          >
            {zoomed ? "−" : "+"}
          </button>
          <button type="button" className="zg-btn" aria-label="Close" onClick={close}>
            ×
          </button>
        </span>
      </m.div>

      <div
        ref={frameRef}
        className="zg-frame"
        data-zoomed={zoomed || undefined}
        data-zg-focus="1"
        tabIndex={-1}
        role="group"
        aria-label={`Photo ${i + 1} of ${n}. Scroll or pinch to zoom, double-click for a close-up, drag to pan.`}
        style={{ touchAction: "none", WebkitTouchCallout: "none" }}
        {...handlers}
      >
        <m.div
          className="zg-fly"
          style={{ x: fx, y: fy, scale: fs, opacity: fo }}
          variants={{ away }}
          exit="away"
        >
          <m.img
            key={i}
            ref={contentRef}
            src={p.src}
            alt={p.alt}
            draggable={false}
            onLoad={flyIn}
            style={{ x, y, scale }}
            variants={{ away: unwind }}
            exit="away"
          />
        </m.div>
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            className="zg-nav prev"
            aria-label="Previous photo"
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="zg-nav next"
            aria-label="Next photo"
            onClick={() => go(1)}
          >
            ›
          </button>
        </>
      )}

      <m.div
        className="zg-foot"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: reduced ? { duration: 0 } : EXIT }}
        transition={fade}
      >
        {action && <div className="zg-action">{action(i)}</div>}
        {n > 1 && (
          <div className="zg-strip" ref={strip} role="group" aria-label="All photos">
            {photos.map((t, j) => (
              <button
                type="button"
                key={t.src + j}
                data-i={j}
                aria-label={`Photo ${j + 1} of ${n}`}
                aria-current={j === i ? "true" : undefined}
                onClick={() => {
                  reset();
                  setI(j);
                }}
              >
                <img src={t.thumb ?? t.src} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}
      </m.div>
    </div>
  );
}
