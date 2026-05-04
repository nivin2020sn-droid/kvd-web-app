// Admin UI theme: dark / light / custom color. Stored in localStorage.

import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "custom";
export interface AdminTheme {
  mode: ThemeMode;
  color: string; // used when mode === "custom"
}

const KEY = "admin_theme_v1";
const DEFAULT: AdminTheme = { mode: "dark", color: "#1E1E24" };

let cached: AdminTheme | null = null;
let initialized = false;

type Listener = (t: AdminTheme) => void;
const listeners = new Set<Listener>();

function ensureLoaded() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mode) cached = { mode: parsed.mode, color: parsed.color || DEFAULT.color };
    }
  } catch {}
}

export function getAdminTheme(): AdminTheme {
  ensureLoaded();
  return cached || DEFAULT;
}

export function setAdminTheme(t: AdminTheme) {
  cached = { mode: t.mode, color: (t.color || DEFAULT.color).trim() };
  initialized = true;
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch {}
  listeners.forEach((l) => l(cached!));
}

export function subscribeAdminTheme(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useAdminTheme(): AdminTheme {
  const [t, setT] = useState<AdminTheme>(() => getAdminTheme());
  useEffect(() => subscribeAdminTheme(setT), []);
  return t;
}

/** Resolve the actual background color for a given theme. */
export function resolveBg(t: AdminTheme): string {
  if (t.mode === "dark") return "#0F0F0F";
  if (t.mode === "light") return "#F6F7F9";
  return t.color || DEFAULT.color;
}

/** True if the background is dark (use white text). */
export function isDark(hex: string): boolean {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 140;
  } catch { return true; }
}
