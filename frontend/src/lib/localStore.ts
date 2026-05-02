import AsyncStorage from "@react-native-async-storage/async-storage";
import { SimpleItem, Task, AppSettings, TaskStatus } from "./api";

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
  "task-types": K.taskTypes,
  "houses": K.houses,
  "stations": K.stations,
  "persons": K.persons,
};

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function setList<T>(key: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export async function initLocalStore(): Promise<void> {
  const seed = {
    [K.taskTypes]: ["Grundreiniger", "Glasreiniger", "Baureiniger", "Endbaureiniger"],
    [K.houses]: ["A", "B", "C"],
    [K.stations]: ["10", "11", "12"],
  };
  for (const [key, names] of Object.entries(seed)) {
    const existing = await getList<SimpleItem>(key);
    if (existing.length === 0) {
      const items = (names as string[]).map((name) => ({ id: uuid(), name }));
      await setList(key, items);
    }
  }
}

function defaultSettings(): AppSettings {
  return { logo_base64: null, background_type: "preset", background_value: "dark" };
}

async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(K.settings);
  if (!raw) return defaultSettings();
  try {
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cur = await getSettings();
  const merged = { ...cur, ...patch };
  await AsyncStorage.setItem(K.settings, JSON.stringify(merged));
  return merged;
}

async function getLocalPassword(): Promise<string> {
  const v = await AsyncStorage.getItem(K.password);
  return v || "admin123";
}

async function setLocalPassword(p: string): Promise<void> {
  await AsyncStorage.setItem(K.password, p);
}

// Public local handler — routes URLs identical to backend
// Returns the same shape as the backend would have returned.
export async function localHandler<T = any>(
  path: string,
  method: string,
  body?: any
): Promise<T> {
  // Strip query string for path matching
  const [pathOnly, qs] = path.split("?");
  const query = new URLSearchParams(qs || "");

  // ---- Simple item collections ----
  const kindMatch = pathOnly.match(/^\/(task-types|houses|stations|persons)(\/([^/]+))?$/);
  if (kindMatch) {
    const kind = kindMatch[1];
    const id = kindMatch[3];
    const key = KIND_KEY[kind];
    if (method === "GET" && !id) {
      return (await getList<SimpleItem>(key)) as any;
    }
    if (method === "POST" && !id) {
      const list = await getList<SimpleItem>(key);
      const item: SimpleItem = { id: uuid(), name: (body?.name || "").trim() };
      if (!item.name) throw new Error("Name required");
      list.push(item);
      await setList(key, list);
      return item as any;
    }
    if (method === "DELETE" && id) {
      const list = await getList<SimpleItem>(key);
      await setList(
        key,
        list.filter((i) => i.id !== id)
      );
      return { ok: true } as any;
    }
  }

  // ---- Tasks ----
  if (pathOnly === "/tasks/today" && method === "GET") {
    const tasks = await getList<Task>(K.tasks);
    const today = todayStr();
    return tasks.filter((t) => !t.archived && t.task_date === today) as any;
  }

  if (pathOnly === "/tasks" && method === "POST") {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuid(),
      task_type: body?.task_type || "",
      haus: body?.haus || "",
      station: body?.station || "",
      description: body?.description || "",
      person_ids: body?.person_ids || [],
      time_from: body?.time_from || "",
      time_to: body?.time_to || "",
      status: "pending",
      accept_reason: null,
      not_finished_reason: null,
      not_done_reason: null,
      accepted_at: null,
      finished_at: null,
      created_at: now,
      archived: false,
      archive_date: null,
      task_date: todayStr(),
    };
    const tasks = await getList<Task>(K.tasks);
    tasks.push(task);
    await setList(K.tasks, tasks);
    return task as any;
  }

  const statusMatch = pathOnly.match(/^\/tasks\/([^/]+)\/status$/);
  if (statusMatch && method === "PATCH") {
    const id = statusMatch[1];
    const tasks = await getList<Task>(K.tasks);
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new Error("Task not found");
    const status: TaskStatus = body?.status;
    const reason: string = body?.reason || "";
    t.status = status;
    const now = new Date().toISOString();
    if (status === "accepted") t.accepted_at = now;
    else if (status === "finished") t.finished_at = now;
    else if (status === "cannot_accept") t.accept_reason = reason;
    else if (status === "not_finished") t.not_finished_reason = reason;
    else if (status === "not_done") t.not_done_reason = reason;
    await setList(K.tasks, tasks);
    return { ok: true } as any;
  }

  const taskIdMatch = pathOnly.match(/^\/tasks\/([^/]+)$/);
  if (taskIdMatch && method === "DELETE") {
    const id = taskIdMatch[1];
    const tasks = await getList<Task>(K.tasks);
    const t = tasks.find((x) => x.id === id);
    if (t) {
      t.archived = true;
      t.archive_date = todayStr();
    }
    await setList(K.tasks, tasks);
    return { ok: true } as any;
  }

  if (pathOnly === "/tasks/archive-now" && method === "POST") {
    const tasks = await getList<Task>(K.tasks);
    let n = 0;
    const today = todayStr();
    tasks.forEach((t) => {
      if (!t.archived) {
        t.archived = true;
        t.archive_date = today;
        n++;
      }
    });
    await setList(K.tasks, tasks);
    return { archived: n } as any;
  }

  if (pathOnly === "/tasks/archive" && method === "GET") {
    const tasks = await getList<Task>(K.tasks);
    const date = query.get("date");
    if (date) {
      return {
        date,
        tasks: tasks.filter((t) => t.archived && t.archive_date === date),
      } as any;
    }
    const dates = Array.from(
      new Set(tasks.filter((t) => t.archived && t.archive_date).map((t) => t.archive_date as string))
    ).sort().reverse();
    return { dates, tasks: [] } as any;
  }

  // ---- Settings ----
  if (pathOnly === "/settings" && method === "GET") {
    return (await getSettings()) as any;
  }

  if (pathOnly === "/settings" && method === "PUT") {
    const patch = { ...body };
    if (patch.password !== undefined) {
      await setLocalPassword(patch.password);
      delete patch.password;
    }
    return (await setSettings(patch)) as any;
  }

  // ---- Admin login ----
  if (pathOnly === "/admin/login" && method === "POST") {
    const p = await getLocalPassword();
    if (body?.password === p) {
      return { token: "offline-admin-token" } as any;
    }
    const err: any = new Error("Falsches Passwort");
    err.status = 401;
    throw err;
  }

  // ---- Update info ----
  if (pathOnly === "/update-info" && method === "GET") {
    return {
      latest_version: "1.0.0",
      download_url: "",
      changelog: "",
      mandatory: false,
    } as any;
  }

  throw new Error(`Offline handler: ${method} ${path} not implemented`);
}
