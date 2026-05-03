import type { SimpleItem, Task, AppSettings, TaskStatus } from "./types";

const K = {
  tasks: "local_tasks_v1",
  taskTypes: "local_task_types_v1",
  houses: "local_houses_v1",
  stations: "local_stations_v1",
  persons: "local_persons_v1",
  settings: "local_settings_v1",
  password: "local_password_v1",
};

const KIND_KEY: Record<string, string> = {
  "task-types": K.taskTypes, "houses": K.houses, "stations": K.stations, "persons": K.persons,
};

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function getList<T>(key: string): T[] { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
function setList<T>(key: string, items: T[]) { localStorage.setItem(key, JSON.stringify(items)); }

export function initLocalStore(): void {
  const seed: Record<string, string[]> = {
    [K.taskTypes]: ["Grundreiniger", "Glasreiniger", "Baureiniger", "Endbaureiniger"],
    [K.houses]: ["A", "B", "C"],
    [K.stations]: ["10", "11", "12"],
  };
  for (const [key, names] of Object.entries(seed)) {
    if (getList<SimpleItem>(key).length === 0) {
      setList(key, names.map((name) => ({ id: uuid(), name })));
    }
  }
}

function defaultSettings(): AppSettings { return { logo_base64: null, background_type: "preset", background_value: "dark" }; }
function getSettings(): AppSettings { const raw = localStorage.getItem(K.settings); if (!raw) return defaultSettings(); try { return { ...defaultSettings(), ...JSON.parse(raw) }; } catch { return defaultSettings(); } }
function setSettings(patch: Partial<AppSettings>): AppSettings { const merged = { ...getSettings(), ...patch }; localStorage.setItem(K.settings, JSON.stringify(merged)); return merged; }

export async function localHandler<T = any>(path: string, method: string, body?: any): Promise<T> {
  const [pathOnly, qs] = path.split("?");
  const query = new URLSearchParams(qs || "");

  const kindMatch = pathOnly.match(/^\/(task-types|houses|stations|persons)(\/([^/]+))?$/);
  if (kindMatch) {
    const kind = kindMatch[1]; const id = kindMatch[3]; const key = KIND_KEY[kind];
    if (method === "GET" && !id) return getList<SimpleItem>(key) as any;
    if (method === "POST" && !id) {
      const name = (body?.name || "").trim(); if (!name) throw new Error("Name required");
      const list = getList<SimpleItem>(key); const item = { id: uuid(), name }; list.push(item); setList(key, list);
      return item as any;
    }
    if (method === "DELETE" && id) {
      setList(key, getList<SimpleItem>(key).filter((i) => i.id !== id)); return { ok: true } as any;
    }
  }

  if (pathOnly === "/tasks/today" && method === "GET") {
    const today = todayStr();
    return getList<Task>(K.tasks).filter((t) => !t.archived && t.task_date === today) as any;
  }
  if (pathOnly === "/tasks" && method === "POST") {
    const t: Task = {
      id: uuid(), task_type: body?.task_type || "", haus: body?.haus || "", station: body?.station || "",
      description: body?.description || "", person_ids: body?.person_ids || [],
      time_from: body?.time_from || "", time_to: body?.time_to || "",
      status: "pending", accept_reason: null, not_finished_reason: null, not_done_reason: null,
      accepted_at: null, finished_at: null, created_at: new Date().toISOString(),
      archived: false, archive_date: null, task_date: todayStr(),
    };
    const list = getList<Task>(K.tasks); list.push(t); setList(K.tasks, list); return t as any;
  }
  const statusMatch = pathOnly.match(/^\/tasks\/([^/]+)\/status$/);
  if (statusMatch && method === "PATCH") {
    const list = getList<Task>(K.tasks); const t = list.find((x) => x.id === statusMatch[1]);
    if (!t) throw new Error("Task not found");
    const status = body?.status as TaskStatus; const reason = body?.reason || "";
    t.status = status; const now = new Date().toISOString();
    if (status === "accepted") t.accepted_at = now;
    else if (status === "finished") t.finished_at = now;
    else if (status === "cannot_accept") t.accept_reason = reason;
    else if (status === "not_finished") t.not_finished_reason = reason;
    else if (status === "not_done") t.not_done_reason = reason;
    setList(K.tasks, list); return { ok: true } as any;
  }
  const taskIdMatch = pathOnly.match(/^\/tasks\/([^/]+)$/);
  if (taskIdMatch && method === "DELETE") {
    const list = getList<Task>(K.tasks); const t = list.find((x) => x.id === taskIdMatch[1]);
    if (t) { t.archived = true; t.archive_date = todayStr(); }
    setList(K.tasks, list); return { ok: true } as any;
  }
  if (pathOnly === "/tasks/archive-now" && method === "POST") {
    const list = getList<Task>(K.tasks); let n = 0; const today = todayStr();
    list.forEach((t) => { if (!t.archived) { t.archived = true; t.archive_date = today; n++; } });
    setList(K.tasks, list); return { archived: n } as any;
  }
  if (pathOnly === "/tasks/archive" && method === "GET") {
    const list = getList<Task>(K.tasks); const date = query.get("date");
    if (date) return { date, tasks: list.filter((t) => t.archived && t.archive_date === date) } as any;
    const dates = Array.from(new Set(list.filter((t) => t.archived && t.archive_date).map((t) => t.archive_date as string))).sort().reverse();
    return { dates, tasks: [] } as any;
  }
  if (pathOnly === "/settings" && method === "GET") return getSettings() as any;
  if (pathOnly === "/settings" && method === "PUT") {
    const patch = { ...body };
    if (patch.password !== undefined) { localStorage.setItem(K.password, patch.password); delete patch.password; }
    return setSettings(patch) as any;
  }
  if (pathOnly === "/admin/login" && method === "POST") {
    const p = localStorage.getItem(K.password) || "admin123";
    if (body?.password === p) return { token: "offline-admin-token" } as any;
    const e: any = new Error("Falsches Passwort"); e.status = 401; throw e;
  }
  if (pathOnly === "/update-info" && method === "GET") {
    return { latest_version: "1.0.0", download_url: "", changelog: "", mandatory: false } as any;
  }
  throw new Error(`Offline: ${method} ${path} nicht unterstützt`);
}
