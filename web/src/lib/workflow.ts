// Workflow logic for tasks: prepared → running → paused → running → finished
// Hybrid storage: when server is configured, syncs via REST + WebSocket.
// Falls back to localStorage when offline.

import { api } from "./api";
import { loadServerConfig } from "./serverConfig";

export type WorkflowStatus = "idle" | "prepared" | "running" | "paused" | "deferred" | "finished";
export type EventType =
  | "vorbereiten"
  | "starten"
  | "pause"
  | "fortsetzen"
  | "beenden"
  | "feierabend"
  | "admin_zeitkorrektur"
  | "admin_beenden_rueckgaengig"
  | "timeline";

const USER_EVENT_TYPES: Set<EventType> = new Set([
  "vorbereiten",
  "starten",
  "pause",
  "fortsetzen",
  "beenden",
  "feierabend",
]);

export interface WorkflowEvent {
  type: EventType;
  ts: string; // ISO datetime (for chronological sort)
  note: string;
  status_before: WorkflowStatus;
  status_after: WorkflowStatus;
  task_name: string;
  undone?: boolean;
  undone_at?: string;
  corrections?: Array<{ target_type: EventType; index: number; old_ts: string; new_ts: string; new_display_time?: string; new_display_date?: string }>;
  created_by?: string;
  persons?: string[]; // snapshot of task.person_ids at the time of this event
  // ----- Author attribution (Mitarbeiter who recorded this event) -----
  // Stored as STRUCTURED fields (not embedded in note text) so display
  // is always consistent and can never be lost / mis-parsed.
  author_id?: string;
  author_name?: string;
  // -----
  // Plain-text values for MANUAL entries (Timeline, Admin-Zeitkorrektur). When
  // these are set, the UI/print/PDF MUST use them directly and NEVER convert
  // from `ts` (to avoid any timezone drift between server/client browsers).
  display_time?: string; // "HH:MM" as entered by user
  display_date?: string; // "YYYY-MM-DD" as entered by user
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
  personsSnapshot?: string[],
  author?: { id?: string; name?: string },
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
    case "feierabend": {
      after = "deferred";
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
    persons: personsSnapshot && personsSnapshot.length ? [...personsSnapshot] : undefined,
    author_id: author?.id || undefined,
    author_name: author?.name || undefined,
  });
  saveWorkflow(wf);
  return wf;
}

/** Apply an event. Online → POST to server (server broadcasts via WS). Offline → local only.
 *
 * Author attribution is STRUCTURED:
 *   - The note text stays exactly what the user typed (no name embedded).
 *   - The Mitarbeiter's id+name is added as separate `author_id` / `author_name`
 *     fields on the event so display logic can render them consistently.
 *
 * If a Mitarbeiter is logged in (sessionStorage), `author_id` and `author_name`
 * are filled automatically. If no Mitarbeiter is logged in (e.g. Admin acting
 * directly), the event is recorded without author attribution.
 */
function getCurrentMitarbeiterIdentity(): { id?: string; name?: string } {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("current_mitarbeiter") : null;
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (j && typeof j.id === "string" && typeof j.name === "string") {
      return { id: j.id, name: j.name.trim() };
    }
  } catch {}
  return {};
}

export async function recordEvent(
  task_id: string,
  type: EventType,
  note: string,
  task_name: string,
  personsSnapshot?: string[],
): Promise<TaskWorkflow> {
  const me = getCurrentMitarbeiterIdentity();
  const cleanNote = (note || "").trim();
  // Optimistic local update for instant UI feedback (with structured author)
  const optimistic = applyEventLocal(task_id, type, cleanNote, task_name, personsSnapshot, me);
  if (loadServerConfig()) {
    try {
      const serverWf = await api<TaskWorkflow>(`/workflows/${task_id}/event`, {
        method: "POST",
        body: {
          type,
          note: cleanNote,
          task_name,
          actor: me.name || undefined,
          author_id: me.id || undefined,
          author_name: me.name || undefined,
        },
      });
      // Defensive merge: if backend hasn't been redeployed yet, the latest
      // event in the server response may not yet carry author_id/author_name.
      // We patch it from our optimistic record so the UI always shows the name.
      try {
        if (serverWf?.events?.length) {
          const lastSrv = serverWf.events[serverWf.events.length - 1];
          if (!lastSrv.author_name && me.name) lastSrv.author_name = me.name;
          if (!lastSrv.author_id && me.id) lastSrv.author_id = me.id;
        }
      } catch {}
      saveWorkflow(serverWf);
      return serverWf;
    } catch {
      return optimistic;
    }
  }
  // Offline: on feierabend, also advance the task's task_date locally to tomorrow
  if (type === "feierabend") {
    try {
      const K = "local_tasks_v1";
      const list: any[] = JSON.parse(localStorage.getItem(K) || "[]");
      const t = list.find((x) => x.id === task_id);
      if (t) {
        const base = t.task_date ? new Date(t.task_date + "T00:00:00Z") : new Date();
        base.setUTCDate(base.getUTCDate() + 1);
        t.task_date = base.toISOString().slice(0, 10);
        localStorage.setItem(K, JSON.stringify(list));
      }
    } catch {}
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

/** Total accumulated work time in milliseconds (only running segments, excluding pauses).
 *  Status 'running' with no open segment → use now as dynamic end.
 */
export function totalWorkMs(wf: TaskWorkflow, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  let total = 0;
  for (const seg of wf.segments || []) {
    const start = new Date(seg.start).getTime();
    const end = seg.end ? new Date(seg.end).getTime() : now;
    total += Math.max(0, end - start);
  }
  return total;
}

/**
 * Personenstunden (person-hours) — total HUMAN effort spent on the task.
 *
 *   Personenstunden = Gesamt-Arbeitszeit × Anzahl der Mitarbeiter
 *
 * Rules per user spec:
 *   • If exactly 1 Mitarbeiter → equals Gesamt-Arbeitszeit
 *   • If 0 Mitarbeiter         → multiplier defaults to 1 (treat as solo work)
 *   • Otherwise                → workMs * count
 *
 * NOTE: This is a pure DERIVED value — no persistence, no DB writes, no
 * impact on the existing time logic. It updates automatically whenever
 * either the work time or the person count changes.
 *
 * ⚠️ DEPRECATED for multi-day tasks — use `personHoursMsByDay()` instead.
 * Kept for backwards compatibility / single-day fallback.
 */
export function personHoursMs(workMs: number, personCount: number): number {
  const multiplier = Math.max(1, personCount | 0);
  return Math.max(0, workMs) * multiplier;
}

/** Single line in the per-day Personenstunden breakdown. */
export interface PersonHoursDay {
  date: string;          // YYYY-MM-DD
  workMs: number;        // work time this day (segment overlap with day bounds)
  personCount: number;   // distinct assigned persons that day (from event snapshots)
  personHoursMs: number; // workMs * max(1, personCount)
}

/**
 * Compute Personenstunden CORRECTLY for multi-day tasks.
 *
 *   Personenstunden = Σ (workMs_day × max(1, personCount_day))
 *
 * Where personCount_day comes from the PER-DAY event `persons` snapshot
 * (captured at the moment the user clicked Starten / Pause / etc on that day).
 * This means a task that ran:
 *    Tag 1: 8h × 2 Mitarbeiter = 16h
 *    Tag 2: 6h × 3 Mitarbeiter = 18h
 *    Tag 3: 4h × 1 Mitarbeiter =  4h
 *  → Gesamt-Personenstunden = 38h    (NOT 18h × current_count)
 *
 * Fallback: if a day has no event-level persons snapshot (legacy data),
 * use `fallbackPersonCount` (= the task's current person_ids length).
 *
 * Returns BOTH the per-day breakdown AND the grand total.
 */
export function personHoursMsByDay(
  wf: TaskWorkflow,
  fallbackPersonCount: number,
  nowMs?: number,
): { totalMs: number; days: PersonHoursDay[] } {
  if (!wf) return { totalMs: 0, days: [] };
  const breakdown = buildDailyBreakdown(wf, nowMs);
  // Drop days that contributed no work (e.g. timeline-only events on a day).
  const workingDays = breakdown.filter((d) => d.workMs > 0);
  const fallback = Math.max(0, fallbackPersonCount | 0);
  const days: PersonHoursDay[] = workingDays.map((d) => {
    const count = (d.persons && d.persons.length) ? d.persons.length : fallback;
    const mult = Math.max(1, count);
    return { date: d.date, workMs: d.workMs, personCount: count, personHoursMs: d.workMs * mult };
  });
  const totalMs = days.reduce((acc, x) => acc + x.personHoursMs, 0);
  return { totalMs, days };
}

/** Call server Admin endpoint: edit event timestamps + append audit event. */
export async function adminCorrectTimes(
  task_id: string,
  updates: Array<{ index: number; ts: string; display_time?: string; display_date?: string }>,
  admin_note: string,
  task_name: string,
): Promise<TaskWorkflow> {
  if (loadServerConfig()) {
    const res = await api<TaskWorkflow>(`/workflows/${task_id}/admin-correct-times`, {
      method: "POST",
      auth: true,
      body: { updates, admin_note, task_name },
    });
    saveWorkflow(res);
    return res;
  }
  // Offline: apply locally
  const wf = { ...getWorkflow(task_id) };
  wf.events = [...(wf.events || [])];
  const corrections: NonNullable<WorkflowEvent["corrections"]> = [];
  for (const u of updates) {
    const ev = wf.events[u.index];
    if (!ev || !USER_EVENT_TYPES.has(ev.type)) continue;
    const old_ts = ev.ts;
    ev.ts = new Date(u.ts).toISOString();
    if (u.display_time) ev.display_time = u.display_time;
    if (u.display_date) ev.display_date = u.display_date;
    corrections.push({
      target_type: ev.type,
      index: u.index,
      old_ts,
      new_ts: ev.ts,
      new_display_time: u.display_time,
      new_display_date: u.display_date,
    });
  }
  wf.events.push({
    type: "admin_zeitkorrektur",
    ts: new Date().toISOString(),
    note: admin_note,
    status_before: wf.status,
    status_after: wf.status,
    task_name,
    corrections,
  });
  const recomputed = recomputeLocal(wf);
  recomputed.events[recomputed.events.length - 1].status_after = recomputed.status;
  saveWorkflow(recomputed);
  return recomputed;
}

/** Call server Admin endpoint: undo a 'beenden' event. */
export async function adminUndoFinish(
  task_id: string,
  admin_note: string,
  task_name: string,
): Promise<TaskWorkflow> {
  if (loadServerConfig()) {
    const res = await api<TaskWorkflow>(`/workflows/${task_id}/admin-undo-finish`, {
      method: "POST",
      auth: true,
      body: { admin_note, task_name },
    });
    saveWorkflow(res);
    return res;
  }
  // Offline
  const wf = { ...getWorkflow(task_id) };
  if (wf.status !== "finished") throw new Error("Nur beendete Aufgaben können rückgängig gemacht werden");
  wf.events = [...(wf.events || [])];
  for (let i = wf.events.length - 1; i >= 0; i--) {
    if (wf.events[i].type === "beenden" && !wf.events[i].undone) {
      wf.events[i] = { ...wf.events[i], undone: true, undone_at: new Date().toISOString() };
      break;
    }
  }
  const statusBefore = wf.status;
  const recomputed = recomputeLocal(wf);
  recomputed.events.push({
    type: "admin_beenden_rueckgaengig",
    ts: new Date().toISOString(),
    note: admin_note,
    status_before: statusBefore,
    status_after: recomputed.status,
    task_name,
  });
  saveWorkflow(recomputed);
  return recomputed;
}

/** Add a Timeline entry (employee-only, neutral informational).
 *  Does NOT change state/segments/Arbeitszeit.
 *
 *  Author attribution is STRUCTURED (separate fields, never embedded in text):
 *    - `author_id` / `author_name` are auto-filled from the logged-in
 *       Mitarbeiter session.
 *    - `note` stays exactly the user's text (no name prefix).
 *    - `created_by` is set to the Mitarbeiter name for legacy compatibility.
 */
export async function addTimelineEntry(
  task_id: string,
  time: string,        // "HH:MM"
  note: string,
  task_name: string,
  createdByOverride?: string,
): Promise<TaskWorkflow> {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error("time muss HH:MM sein");
  const me = getCurrentMitarbeiterIdentity();
  const cleanNote = (note || "").trim();
  const created_by = createdByOverride || me.name || "Mitarbeiter";
  // Today's date in Europe/Berlin as YYYY-MM-DD (independent of viewer's TZ)
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  if (loadServerConfig()) {
    const res = await api<TaskWorkflow>(`/workflows/${task_id}/timeline`, {
      method: "POST",
      body: {
        time,
        date: todayISO,
        note: cleanNote,
        task_name,
        created_by,
        author_id: me.id || undefined,
        author_name: me.name || undefined,
      },
    });
    // Defensive merge for older (un-redeployed) backends.
    try {
      if (res?.events?.length) {
        const lastSrv = res.events[res.events.length - 1];
        if (!lastSrv.author_name && me.name) lastSrv.author_name = me.name;
        if (!lastSrv.author_id && me.id) lastSrv.author_id = me.id;
      }
    } catch {}
    saveWorkflow(res);
    return res;
  }
  // Offline: append locally. Store PLAIN-TEXT time+date (no TZ conversion).
  const wf = { ...getWorkflow(task_id) };
  wf.events = [...(wf.events || [])];
  // Build a `ts` that ONLY serves for chronological sort — marked as UTC to
  // preserve order within the day. Display code MUST use display_time/_date.
  const ts = `${todayISO}T${time}:00.000Z`;
  wf.events.push({
    type: "timeline",
    ts,
    note: cleanNote,
    status_before: wf.status,
    status_after: wf.status,
    task_name,
    created_by,
    author_id: me.id || undefined,
    author_name: me.name || undefined,
    display_time: time,      // <— plain-text, as entered
    display_date: todayISO,  // <— plain-text YYYY-MM-DD
  });
  saveWorkflow(wf);
  return wf;
}

/** Offline mirror of the server recomputeWorkflow. */
function recomputeLocal(wf: TaskWorkflow): TaskWorkflow {
  const events = wf.events || [];
  const active = events
    .filter((e) => !e.undone && USER_EVENT_TYPES.has(e.type))
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  let status: WorkflowStatus = "idle";
  const segments: TaskWorkflow["segments"] = [];
  let prepared_at: string | null = null;
  let started_at: string | null = null;
  let paused_at: string | null = null;
  let finished_at: string | null = null;
  for (const ev of active) {
    switch (ev.type) {
      case "vorbereiten":
        status = "prepared";
        prepared_at = ev.ts;
        break;
      case "starten": {
        status = "running";
        if (!started_at) started_at = ev.ts;
        paused_at = null;
        // BUGFIX: auto-close orphan segments (missed Feierabend / Pause) so a
        // multi-day open segment cannot inflate totalWorkMs to NOW.
        const prev = segments[segments.length - 1];
        if (prev && !prev.end) prev.end = ev.ts;
        segments.push({ start: ev.ts, end: null });
        break;
      }
      case "pause": {
        status = "paused";
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        paused_at = ev.ts;
        break;
      }
      case "fortsetzen": {
        status = "running";
        const prev = segments[segments.length - 1];
        if (prev && !prev.end) prev.end = ev.ts;
        segments.push({ start: ev.ts, end: null });
        paused_at = null;
        break;
      }
      case "beenden": {
        status = "finished";
        finished_at = ev.ts;
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        break;
      }
      case "feierabend": {
        status = "deferred";
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        paused_at = null;
        break;
      }
    }
  }
  const lastUser = active[active.length - 1];
  return {
    ...wf,
    status,
    segments,
    prepared_at,
    started_at,
    paused_at: status === "paused" ? paused_at : null,
    finished_at,
    last_note: lastUser ? lastUser.note || "" : wf.last_note || "",
    last_event_type: lastUser ? lastUser.type : wf.last_event_type || undefined,
  };
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
    // LOCK display to Europe/Berlin so values are identical regardless of
    // which device/TZ the viewer is on (fixes 10:00 → 12:00 on UTC servers).
    return new Date(iso).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Berlin",
    });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });
    return `${date} · ${time}`;
  } catch {
    return "—";
  }
}

/** German-formatted date string. Always interpreted in Europe/Berlin. */
export function formatDateDE(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  } catch { return "—"; }
}

/**
 * Get the user-facing TIME string for an event.
 *  - For MANUAL entries (Timeline, Admin-Zeitkorrektur) the user-entered text
 *    is stored in `display_time` and returned AS-IS — no timezone math.
 *  - For automatic events (Starten/Pause/Fortsetzen/Beenden/Feierabend …) we
 *    format the ISO timestamp in Europe/Berlin so all devices agree.
 */
export function eventDisplayTime(ev: WorkflowEvent, opts?: { withSeconds?: boolean }): string {
  if (ev.display_time && /^\d{2}:\d{2}/.test(ev.display_time)) return ev.display_time;
  if (!ev.ts) return "—";
  try {
    return new Date(ev.ts).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      ...(opts?.withSeconds ? { second: "2-digit" } : {}),
      hour12: false,
      timeZone: "Europe/Berlin",
    });
  } catch { return "—"; }
}

/** Get the user-facing DATE string for an event (DD.MM.YYYY). */
export function eventDisplayDate(ev: WorkflowEvent): string {
  if (ev.display_date && /^\d{4}-\d{2}-\d{2}$/.test(ev.display_date)) {
    const [y, mo, d] = ev.display_date.split("-");
    return `${d}.${mo}.${y}`;
  }
  if (!ev.ts) return "—";
  try {
    return new Date(ev.ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  } catch { return "—"; }
}

/** Total time spent paused (sum of gaps between segment ends and next segment starts). */
export function totalPauseMs(wf: TaskWorkflow, nowMs?: number): number {
  if (!wf.segments || wf.segments.length === 0) return 0;
  const now = nowMs ?? Date.now();
  let total = 0;
  // Build a quick set of timestamps that represent *Feierabend* segment-ends.
  // Those gaps (Feierabend → next-day Fortsetzen) must NOT count as pause.
  const feierabendTs = new Set<string>();
  for (const ev of wf.events || []) {
    if (ev.type === "feierabend") feierabendTs.add(ev.ts);
  }
  for (let i = 0; i < wf.segments.length - 1; i++) {
    const cur = wf.segments[i];
    const nxt = wf.segments[i + 1];
    if (!cur.end || !nxt.start) continue;
    // Skip Feierabend gaps: not working-day pauses, but overnight/off-day gaps.
    if (feierabendTs.has(cur.end)) continue;
    total += new Date(nxt.start).getTime() - new Date(cur.end).getTime();
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
  feierabend: "Feierabend",
  admin_zeitkorrektur: "Admin · Zeitkorrektur",
  admin_beenden_rueckgaengig: "Admin · Beenden rückgängig",
  timeline: "Timeline",
};

const STATUS_EVENT_TYPES: Set<EventType> = new Set([
  "vorbereiten", "starten", "pause", "fortsetzen", "beenden", "feierabend",
]);

/** Pure-display: format the user-facing note for an event.
 *  Combines the structured `author_name` with the raw `note` so the UI/print
 *  always shows "Bahaa: <text>" (or the localized "hat den Status auf X
 *  geändert" for status events). Old events that lack `author_name` fall
 *  back to whatever was originally stored in `note`. */
export function formatEventNote(ev: WorkflowEvent): string {
  const note = (ev?.note || "").trim();
  const author = (ev?.author_name || "").trim();
  if (!ev) return "";

  // ----- Old data without structured author: keep as-is. -----
  if (!author) return note;

  // ----- Status-changing events (Vorbereiten / Starten / Pause / Fortsetzen
  //       / Beenden / Feierabend) -----
  if (STATUS_EVENT_TYPES.has(ev.type)) {
    const statusLabel = STATUS_LABEL_DE[ev.status_after] || EVENT_LABEL[ev.type];
    const base = `${author} hat den Status auf „${statusLabel}" geändert`;
    return note ? `${base} — ${note}` : base;
  }

  // ----- Timeline / everything else: "Bahaa: <text>" or just "Bahaa" -----
  return note ? `${author}: ${note}` : author;
}

export const EVENT_COLOR: Record<EventType, string> = {
  vorbereiten: "#A855F7", // lila
  starten: "#3B82F6",     // blau
  pause: "#FF9500",       // orange
  fortsetzen: "#3B82F6",  // blau
  beenden: "#00E676",     // grün
  feierabend: "#6366F1",  // indigo (Ende des Tages · wird fortgesetzt)
  admin_zeitkorrektur: "#FFD600",
  admin_beenden_rueckgaengig: "#FFD600",
  timeline: "#C084FC",
};

export const STATUS_LABEL_DE: Record<WorkflowStatus, string> = {
  idle: "Bereit",
  prepared: "Vorbereitet",
  running: "In Arbeit",
  paused: "Pausiert",
  deferred: "Wird morgen fortgesetzt",
  finished: "Beendet",
};

export const STATUS_COLOR: Record<WorkflowStatus, string> = {
  idle: "#9CA3AF",
  prepared: "#A855F7",
  running: "#3B82F6",
  paused: "#FF9500",
  deferred: "#6366F1",
  finished: "#00E676",
};

/** Returns which buttons are enabled for the current workflow status. */
export function allowedActions(status: WorkflowStatus): Record<"vorbereiten" | "starten" | "pause" | "fortsetzen" | "beenden" | "feierabend", boolean> {
  return {
    vorbereiten: status === "idle",
    // Starten allowed also from 'deferred' so the next day can begin a new segment
    starten: status === "idle" || status === "prepared" || status === "deferred",
    pause: status === "running",
    // Fortsetzen allowed after Pause AND after Feierabend (next day resume)
    fortsetzen: status === "paused" || status === "deferred",
    beenden: status === "running" || status === "paused" || status === "deferred",
    // Feierabend only while actively working or paused within the same day
    feierabend: status === "running" || status === "paused",
  };
}

// ============ Daily breakdown (dailyWorkLog) ============
export interface DaySection {
  date: string;            // YYYY-MM-DD
  persons: string[];       // union of person snapshots from events on this day
  events: WorkflowEvent[]; // events that occurred on this day (all types)
  workMs: number;          // work time attributable to this day (segments trimmed to day bounds)
  pauseMs: number;         // pause time within this day (gaps within same-day segments)
  started_at: string | null;
  feierabend_at: string | null;
  finished_at: string | null;
}

function dayKey(iso: string): string { return (iso || "").slice(0, 10); }
function startOfDayMs(key: string): number { return new Date(key + "T00:00:00").getTime(); }
function endOfDayMs(key: string): number { return new Date(key + "T23:59:59.999").getTime(); }

export function buildDailyBreakdown(wf: TaskWorkflow, nowMs?: number): DaySection[] {
  const events = wf?.events || [];
  const segs = wf?.segments || [];
  const now = nowMs ?? Date.now();

  // Collect all relevant day keys (from events AND segments)
  const days = new Set<string>();
  for (const ev of events) {
    if (ev.ts) days.add(dayKey(ev.ts));
  }
  for (const s of segs) {
    if (s.start) days.add(dayKey(s.start));
    if (s.end) days.add(dayKey(s.end));
    else days.add(dayKey(new Date(now).toISOString()));
  }
  const sortedDays = [...days].sort();

  // Also pre-build sorted running-segment events to derive pause within day
  return sortedDays.map((date) => {
    const dayStart = startOfDayMs(date);
    const dayEnd = endOfDayMs(date);
    const eventsOfDay = events
      .filter((e) => dayKey(e.ts) === date)
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // Work time: sum segment overlap with [dayStart, dayEnd]
    let workMs = 0;
    const daySegs: Array<{ start: number; end: number }> = [];
    for (const s of segs) {
      const segStart = new Date(s.start).getTime();
      const segEnd = s.end ? new Date(s.end).getTime() : now;
      const a = Math.max(segStart, dayStart);
      const b = Math.min(segEnd, dayEnd);
      if (b > a) { workMs += b - a; daySegs.push({ start: a, end: b }); }
    }

    // Pause time: gaps between daySegs (only within the day, exclude pre-first and post-last)
    let pauseMs = 0;
    daySegs.sort((x, y) => x.start - y.start);
    for (let i = 0; i < daySegs.length - 1; i++) {
      pauseMs += Math.max(0, daySegs[i + 1].start - daySegs[i].end);
    }

    // Persons: union of all event.persons snapshots on this day
    const personSet = new Set<string>();
    for (const ev of eventsOfDay) {
      if (Array.isArray(ev.persons)) ev.persons.forEach((p) => personSet.add(p));
    }

    const startedEv = eventsOfDay.find((e) => e.type === "starten" || e.type === "fortsetzen");
    const feierabendEv = [...eventsOfDay].reverse().find((e) => e.type === "feierabend");
    const finishedEv = [...eventsOfDay].reverse().find((e) => e.type === "beenden");

    return {
      date,
      persons: [...personSet],
      events: eventsOfDay,
      workMs,
      pauseMs,
      started_at: startedEv?.ts || null,
      feierabend_at: feierabendEv?.ts || null,
      finished_at: finishedEv?.ts || null,
    };
  });
}
