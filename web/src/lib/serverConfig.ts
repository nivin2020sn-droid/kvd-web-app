const KEY = "server_config_v1";

export interface ServerConfig {
  baseUrl: string;
  apiBaseUrl: string;
  wsUrl: string;
  apiKey?: string;
}

// Default server preset as requested by user
export const DEFAULT_SERVER = {
  baseUrl: "https://kvd-backend.onrender.com",
  apiBaseUrl: "https://kvd-backend.onrender.com/api",
  wsUrl: "wss://kvd-backend.onrender.com/api/ws",
};

let cached: ServerConfig | null = null;

function derive(base: string, apiKey?: string): ServerConfig {
  const trimmed = base.trim().replace(/\/+$/, "");
  const apiBase = `${trimmed}/api`;
  const wsUrl = apiBase.replace(/^http/, "ws") + "/ws";
  return { baseUrl: trimmed, apiBaseUrl: apiBase, wsUrl, apiKey: apiKey?.trim() || undefined };
}

export function loadServerConfig(): ServerConfig | null {
  if (cached !== null) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cached = JSON.parse(raw);
  } catch { cached = null; }
  return cached;
}

export function getServerConfigSync(): ServerConfig | null { return cached; }

export function saveServerConfig(baseUrl: string, apiKey?: string): ServerConfig | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) { clearServerConfig(); return null; }
  const cfg = derive(trimmed, apiKey);
  localStorage.setItem(KEY, JSON.stringify(cfg));
  cached = cfg;
  notify();
  return cfg;
}

export function clearServerConfig(): void {
  localStorage.removeItem(KEY);
  cached = null;
  notify();
}

type Listener = (c: ServerConfig | null) => void;
const listeners = new Set<Listener>();
export function subscribeServerConfig(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach((l) => l(cached)); }
