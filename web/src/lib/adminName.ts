// Local-only admin display name (e.g. "Admin", "Chef", "Bahaa").
// Stored in localStorage. Reactive via useAdminName() hook.

import { useEffect, useState } from "react";

const KEY = "admin_name_v1";
const DEFAULT_NAME = "Admin";

let cached: string | null = null;
let initialized = false;

type Listener = (name: string) => void;
const listeners = new Set<Listener>();

function ensureLoaded() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cached = raw;
  } catch {
    cached = null;
  }
}

export function getAdminName(): string {
  ensureLoaded();
  return cached || DEFAULT_NAME;
}

export function setAdminName(name: string): string {
  const clean = (name || "").trim().slice(0, 20) || DEFAULT_NAME;
  cached = clean;
  initialized = true;
  try {
    localStorage.setItem(KEY, clean);
  } catch {}
  listeners.forEach((l) => l(clean));
  return clean;
}

export function subscribeAdminName(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Reactive React hook – auto re-renders when admin name changes. */
export function useAdminName(): string {
  const [name, setName] = useState<string>(() => getAdminName());
  useEffect(() => subscribeAdminName(setName), []);
  return name;
}
