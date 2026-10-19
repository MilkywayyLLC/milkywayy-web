"use client";

import { useSyncExternalStore } from "react";

/**
 * One sound state for every video on the site. Browsers keep videos muted until the visitor has
 * clicked or tapped somewhere on the page (`unlocked`); after that videos play with sound unless
 * the visitor turned it off with a card's speaker button (`on`, saved in localStorage).
 */
type Sound = { unlocked: boolean; on: boolean };

const KEY = "mw-sound";
const SERVER: Sound = { unlocked: false, on: true };
let state: Sound = SERVER;
let ready = false;
const subs = new Set<() => void>();

const set = (next: Sound) => {
  state = next;
  subs.forEach((f) => f());
};

function setup() {
  if (ready) return;
  ready = true;
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== "off";
  } catch {}
  state = { ...state, on };
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    set({ ...state, unlocked: true });
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

const subscribe = (f: () => void) => {
  setup();
  subs.add(f);
  return () => void subs.delete(f);
};

export const useSound = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );

export const setSoundOn = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  set({ ...state, on });
};

/** Whether a speaker button's pointer-down happened before the first-click unlock. */
export const isLocked = () => !state.unlocked;
