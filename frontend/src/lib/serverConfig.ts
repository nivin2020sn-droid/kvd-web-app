import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "server_config_v1";

export interface ServerConfig {
  baseUrl: string;
  apiBaseUrl: string;
  wsUrl: string;
  apiKey?: string;
}

let cached: ServerConfig | null = null;
let loaded = false;

function derive(base: string, apiKey?: string): ServerConfig {
  const trimmed = base.trim().replace(/\/+$/, "");
  const apiBase = `${trimmed}/api`;
  const wsUrl = apiBase.replace(/^http/, "ws") + "/ws";
  return { baseUrl: trimmed, apiBaseUrl: apiBase, wsUrl, apiKey: apiKey?.trim() || undefined };
}

export async function loadServerConfig(): Promise<ServerConfig | null> {
  if (loaded) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

export function getServerConfigSync(): ServerConfig | null {
  return cached;
}

export async function saveServerConfig(baseUrl: string, apiKey?: string): Promise<ServerConfig | null> {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    await clearServerConfig();
    return null;
  }
  const cfg = derive(trimmed, apiKey);
  await AsyncStorage.setItem(KEY, JSON.stringify(cfg));
  cached = cfg;
  loaded = true;
  return cfg;
}

export async function clearServerConfig(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  cached = null;
  loaded = true;
}

export function isOnlineMode(): boolean {
  return cached !== null && !!cached.baseUrl;
}

// Subscription for UI updates
type Listener = (cfg: ServerConfig | null) => void;
const listeners = new Set<Listener>();

export function subscribeServerConfig(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyServerConfigChanged() {
  listeners.forEach((l) => l(cached));
}
