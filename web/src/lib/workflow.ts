// Workflow logic for tasks: prepared → running → paused → running → finished
// Hybrid storage: when server is configured, syncs via REST + WebSocket.
// Falls back to localStorage when offline.

import { api } from "./api";
import { loadServerConfig } from "./serverConfig";

export type WorkflowStatus = "idle" | "prepared" | "running" | "paused" | "finished";
export type EventType = "vorbereiten" | "starten" | "pause" | "fortsetzen" | "beenden";

export interface WorkflowEvent {
  type: EventType;
  ts: string; // ISO datetime
  note: string;
  status_before: WorkflowStatus;
  status_after: WorkflowStatus;
  task_name: string;
}

export interface TaskWorkflow {
  task_id: string;
  status: WorkflowStatus;
  events: WorkflowEvent[];
  segments: Array<{ start: string; end: string | null }>;
  prepared_at?: string | null;
  started_at?: string | null;
  paused_at?: string | null;   // start time of CURRENT pause (if paused)
  finished_at?: string | null;
  last_note?: string;
  last_event_type?: EventType;
}

const STORAGE_KEY = "task_workflow_v1";

function loadAll(): Record<string, TaskWorkflow> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, TaskWorkflow>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getWorkflow(task_id: string): TaskWorkflow {
  const all = loadAll();
  return (
    all[task_id] || {
      task_id,
      status: "idle",
      events: [],
      segments: [],
    }
  );
}

export function saveWorkflow(wf: TaskWorkflow) {
  const all = loadAll();
  all[wf.task_id] = wf;
  saveAll(all);
}

export function deleteWorkflow(task_id: string) {
  const all = loadAll();
  delete all[task_id];
  saveAll(all);
}

/** Apply an event locally to the workflow. Returns updated workflow. */
function applyEventLocal(
  task_id: string,
  type: EventType,
  note: string,
  task_name: string,
): TaskWorkflow {
  const wf = getWorkflow(task_id);
  const before = wf.status;
  const now = new Date().toISOString();
  let after: WorkflowStatus = before;

  switch (type) {
    case "vorbereiten":
      after = "prepared";
      wf.prepared_at = now;
      break;
    case "starten": {
      after = "running";
      if (!wf.started_at) wf.started_at = now;
      wf.paused_at = null;
      wf.segments.push({ start: now, end: null });
      break;
    }
    case "pause": {
      after = "paused";
      const last = wf.segments[wf.segments.length - 1];
      if (last && !last.end) last.end = now;
      wf.paused_at = now;
      break;
    }
    case "fortsetzen": {
      after = "running";
      wf.segments.push({ start: now, end: null });
      wf.paused_at = null;
      break;
    }
    case "beenden": {
      after = "finished";
      wf.finished_at = now;
      const last = wf.segments[wf.segments.length - 1];
      if (last && !last.end) last.end = now;
      wf.paused_at = null;
      break;
    }
  }

  wf.status = after;
  wf.last_note = note;
  wf.last_event_type = type;
  wf.events.push({
    type,
    ts: now,
    note,
    status_before: before,
    status_after: after,
    task_name,
  });
  saveWorkflow(wf);
  return wf;
}

/** Apply an event. Online → POST to server (server broadcasts via WS). Offline → local only. */
export async function recordEvent(
  task_id: string,
  type: EventType,
  note: string,
  task_name: string,
): Promise<TaskWorkflow> {
  // Optimistic local update for instant UI feedback
  const optimistic = applyEventLocal(task_id, type, note, task_name);
  if (loadServerConfig()) {
    try {
      const serverWf = await api<TaskWorkflow>(`/workflows/${task_id}/event`, {
        method: "POST",
        body: { type, note, task_name },
      });
      // Server is source of truth – save its result, replacing optimistic state
      saveWorkflow(serverWf);
      return serverWf;
    } catch {
      // Network error – keep optimistic local state (works offline)
      return optimistic;
    }
  }
  return optimistic;
}

/** Fetch all workflows from server (when online), else from localStorage. */
export async function fetchAllWorkflows(): Promise<Record<string, TaskWorkflow>> {
  if (loadServerConfig()) {
    try {
      const list = await api<TaskWorkflow[]>("/workflows");
      const map: Record<string, TaskWorkflow> = {};
      for (const wf of list || []) {
        if (wf?.task_id) map[wf.task_id] = wf;
      }
      saveAll(map);
      return map;
    } catch {
      // fallback to local cache
    }
  }
  return loadAll();
}

/** Total accumulated work time in milliseconds (only running segments, excluding pauses). */
export function totalWorkMs(wf: TaskWorkflow, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  let total = 0;
  for (const seg of wf.segments) {
    const start = new Date(seg.start).getTime();
    const end = seg.end ? new Date(seg.end).getTime() : now;
    total += Math.max(0, end - start);
  }
  return total;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${date} · ${time}`;
  } catch {
    return "—";
  }
}

/** Total time spent paused (sum of gaps between segment ends and next segment starts). */
export function totalPauseMs(wf: TaskWorkflow, nowMs?: number): number {
  if (!wf.segments || wf.segments.length === 0) return 0;
  const now = nowMs ?? Date.now();
  let total = 0;
  for (let i = 0; i < wf.segments.length - 1; i++) {
    const cur = wf.segments[i];
    const nxt = wf.segments[i + 1];
    if (cur.end && nxt.start) total += new Date(nxt.start).getTime() - new Date(cur.end).getTime();
  }
  // currently paused → add open pause duration
  if (wf.status === "paused" && wf.paused_at) {
    total += Math.max(0, now - new Date(wf.paused_at).getTime());
  }
  return total;
}

// ---------- UI helpers ----------
export const EVENT_LABEL: Record<EventType, string> = {
  vorbereiten: "Vorbereiten",
  starten: "Starten",
  pause: "Pause",
  fortsetzen: "Fortsetzen",
  beenden: "Beenden",
};

export const EVENT_COLOR: Record<EventType, string> = {
  vorbereiten: "#A855F7", // lila
  starten: "#3B82F6",     // blau
  pause: "#FF9500",       // orange
  fortsetzen: "#3B82F6",  // blau
  beenden: "#00E676",     // grün
};

export const STATUS_LABEL_DE: Record<WorkflowStatus, string> = {
  idle: "Bereit",
  prepared: "Vorbereitet",
  running: "In Arbeit",
  paused: "Pausiert",
  finished: "Beendet",
};

export const STATUS_COLOR: Record<WorkflowStatus, string> = {
  idle: "#9CA3AF",
  prepared: "#A855F7",
  running: "#3B82F6",
  paused: "#FF9500",
  finished: "#00E676",
};

/** Returns which buttons are enabled for the current workflow status. */
export function allowedActions(status: WorkflowStatus): Record<EventType, boolean> {
  return {
    vorbereiten: status === "idle",
    starten: status === "idle" || status === "prepared",
    pause: status === "running",
    fortsetzen: status === "paused",
    beenden: status === "running" || status === "paused",
  };
}
