import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadServerConfig, getServerConfigSync, isOnlineMode } from "./serverConfig";
import { localHandler } from "./localStore";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("admin_token");
}

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem("admin_token", t);
  else await AsyncStorage.removeItem("admin_token");
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface ApiOptions {
  method?: string;
  body?: any;
  auth?: boolean;
  timeoutMs?: number;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false, timeoutMs = 5000 } = options;

  // Make sure we loaded config once
  await loadServerConfig();
  const cfg = getServerConfigSync();

  // ---------- Offline branch ----------
  if (!cfg) {
    return (await localHandler<T>(path, method, body)) as T;
  }

  // ---------- Online branch ----------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["X-API-Key"] = cfg.apiKey;
    if (auth) Object.assign(headers, await authHeaders());

    const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err: any = new Error(text || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function getWsUrl(): string | null {
  const cfg = getServerConfigSync();
  return cfg ? cfg.wsUrl : null;
}

// ---------- Types ----------
export interface SimpleItem {
  id: string;
  name: string;
}

export type TaskStatus =
  | "pending"
  | "accepted"
  | "finished"
  | "cannot_accept"
  | "not_finished"
  | "not_done";

export interface Task {
  id: string;
  task_type: string;
  haus: string;
  station: string;
  description: string;
  person_ids: string[];
  time_from: string;
  time_to: string;
  status: TaskStatus;
  accept_reason?: string | null;
  not_finished_reason?: string | null;
  not_done_reason?: string | null;
  accepted_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  archived: boolean;
  archive_date?: string | null;
  task_date: string;
}

export interface AppSettings {
  logo_base64?: string | null;
  background_type: "preset" | "color" | "image";
  background_value: string;
}

export { isOnlineMode };
