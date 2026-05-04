// Photo upload helper. Sends multipart/form-data to the backend which signs
// and forwards to Cloudinary (server-side API secret, never exposed to client).
//
// Adds an offline queue backed by IndexedDB: if the upload fails (no internet /
// backend down), the blob is persisted locally and re-attempted later.

import type { Task, TaskPhoto } from "./types";
import { loadServerConfig } from "./serverConfig";

// ---------- API ----------
function serverBase(): string | null {
  const cfg = loadServerConfig();
  return cfg?.apiBaseUrl || null;
}

/**
 * Upload a single photo for a task.
 *  - Goes straight to backend (multipart)
 *  - Backend returns the full Task + photo metadata
 */
export async function uploadPhoto(
  taskId: string,
  file: File | Blob,
  opts: { caption?: string; uploadedBy?: string; filename?: string } = {},
): Promise<{ photo: TaskPhoto; task: Task }> {
  const base = serverBase();
  if (!base) throw new Error("Kein Server konfiguriert. Foto kann nicht hochgeladen werden.");
  const fd = new FormData();
  const fname = opts.filename || (file instanceof File ? file.name : "foto.jpg");
  fd.append("file", file, fname);
  if (opts.caption) fd.append("caption", opts.caption);
  if (opts.uploadedBy) fd.append("uploadedBy", opts.uploadedBy);
  const url = `${base}/tasks/${taskId}/photos`;
  // eslint-disable-next-line no-console
  console.log("[photos] POST", url, "size=", (file as any).size, "name=", fname);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e: any) {
    // Network-level failure (offline / DNS / CORS preflight blocked)
    throw new Error(`Netzwerkfehler: ${e?.message || "Server nicht erreichbar"}`);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try { const j = await res.json(); if (j?.detail) detail = `${res.status} – ${j.detail}`; } catch {}
    throw new Error(`Upload fehlgeschlagen (${detail})`);
  }
  return res.json();
}

/** Fetch all photos for a task. */
export async function listPhotos(taskId: string): Promise<TaskPhoto[]> {
  const base = serverBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/tasks/${taskId}/photos`);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.photos) ? j.photos : [];
  } catch { return []; }
}

/** Admin-only delete. Backend removes from Cloudinary first, then Mongo. */
export async function deletePhoto(taskId: string, photoId: string): Promise<void> {
  const base = serverBase();
  if (!base) throw new Error("Kein Server konfiguriert.");
  const token = localStorage.getItem("admin_token") || "admin-session-token";
  const res = await fetch(`${base}/tasks/${taskId}/photos/${photoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Löschen fehlgeschlagen (${res.status})`);
}

// ---------- Offline queue (IndexedDB) ----------
const DB_NAME = "reinigung_photos";
const STORE = "pending";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PendingUpload {
  id: string;          // uuid-ish
  taskId: string;
  taskName?: string;
  blob: Blob;
  caption: string;
  uploadedBy: string;
  createdAt: string;   // ISO
  filename: string;
  attempts: number;
  lastError?: string;
}

export async function queueUpload(up: Omit<PendingUpload, "id" | "attempts" | "createdAt"> & Partial<Pick<PendingUpload, "id">>): Promise<PendingUpload> {
  const rec: PendingUpload = {
    id: up.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: up.taskId,
    taskName: up.taskName,
    blob: up.blob,
    caption: up.caption || "",
    uploadedBy: up.uploadedBy || "",
    filename: up.filename || "foto.jpg",
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return rec;
}

export async function listPending(): Promise<PendingUpload[]> {
  try {
    const db = await openDb();
    return await new Promise<PendingUpload[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function removePending(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updatePending(rec: PendingUpload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Called on app startup + every X seconds + on 'online' event. */
let syncInFlight = false;
export interface SyncResult {
  uploaded: number;
  failed: number;
  skipped?: boolean;     // true if another sync was already running
  total: number;
  lastError?: string;    // message of the last failure (if any)
}
export async function syncPending(onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  if (syncInFlight) {
    // eslint-disable-next-line no-console
    console.log("[photos] syncPending skipped — another sync already in flight");
    const items = await listPending();
    return { uploaded: 0, failed: 0, skipped: true, total: items.length };
  }
  syncInFlight = true;
  try {
    const items = await listPending();
    // eslint-disable-next-line no-console
    console.log(`[photos] syncPending start — ${items.length} pending`);
    let uploaded = 0, failed = 0, lastError: string | undefined;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        await uploadPhoto(it.taskId, it.blob, { caption: it.caption, uploadedBy: it.uploadedBy, filename: it.filename });
        await removePending(it.id);
        uploaded++;
      } catch (e: any) {
        it.attempts += 1;
        it.lastError = e?.message || "Unbekannter Fehler";
        lastError = it.lastError;
        await updatePending(it);
        failed++;
        // eslint-disable-next-line no-console
        console.warn(`[photos] sync item failed (attempts=${it.attempts}):`, it.lastError);
      }
      onProgress?.(i + 1, items.length);
    }
    // eslint-disable-next-line no-console
    console.log(`[photos] syncPending end — uploaded=${uploaded} failed=${failed}`);
    return { uploaded, failed, total: items.length, lastError };
  } finally {
    syncInFlight = false;
  }
}

// Auto-retry hook. Call once per app startup.
export function installOfflineSync(onUpdate?: () => void) {
  const trigger = () => { syncPending().then(() => onUpdate?.()).catch(() => {}); };
  window.addEventListener("online", trigger);
  // Also attempt right now and every 2 min
  trigger();
  const h = window.setInterval(trigger, 2 * 60 * 1000);
  return () => {
    window.removeEventListener("online", trigger);
    window.clearInterval(h);
  };
}
