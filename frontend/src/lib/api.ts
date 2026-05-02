import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const API_BASE = `${BASE}/api`;

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

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = false } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) Object.assign(headers, await authHeaders());

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// WebSocket URL (replace http(s) with ws(s))
export function getWsUrl(): string {
  const url = `${BASE}/api/ws`;
  return url.replace(/^http/, "ws");
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
