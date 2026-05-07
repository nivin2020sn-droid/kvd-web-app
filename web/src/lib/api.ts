import { loadServerConfig } from "./serverConfig";
import { localHandler } from "./localStore";

const TOKEN_KEY = "admin_token";
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export interface ApiOptions { method?: string; body?: any; auth?: boolean; timeoutMs?: number; lagerPv?: number; extraHeaders?: Record<string, string>; }

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false, timeoutMs = 5000, lagerPv, extraHeaders } = opts;
  const cfg = loadServerConfig();

  if (!cfg) return localHandler<T>(path, method, body);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["X-API-Key"] = cfg.apiKey;
    if (auth) { const t = getToken(); if (t) headers["Authorization"] = `Bearer ${t}`; }
    if (typeof lagerPv === "number") headers["X-Lager-Pv"] = String(lagerPv);
    if (extraHeaders) Object.assign(headers, extraHeaders);
    const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const err: any = new Error(txt || `HTTP ${res.status}`);
      err.status = res.status;
      try { err.payload = txt ? JSON.parse(txt) : null; } catch {}
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } finally { clearTimeout(timer); }
}

export function getWsUrl(): string | null { return loadServerConfig()?.wsUrl || null; }
