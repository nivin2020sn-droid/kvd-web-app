import { useEffect, useRef, useState } from "react";
import type { Task, TaskPhoto } from "../lib/types";
import { uploadPhoto, deletePhoto, listPhotos, queueUpload, listPending, syncPending, type PendingUpload } from "../lib/photos";
import { loadServerConfig } from "../lib/serverConfig";
import { Icon, ICONS } from "./Icons";

interface Props {
  task: Task;
  isAdmin: boolean;
  currentUserName?: string;
  onClose: () => void;
  /** Called when photos change so parent can refresh its local task object. */
  onPhotosChanged?: (photos: TaskPhoto[]) => void;
}

const fmtDE = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })} · ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`;
  } catch { return "—"; }
};

export function MediaModal({ task, isAdmin, currentUserName, onClose, onPhotosChanged }: Props) {
  const [photos, setPhotos] = useState<TaskPhoto[]>(task.photos || []);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [viewer, setViewer] = useState<TaskPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<TaskPhoto | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    try {
      const list = await listPhotos(task.id);
      setPhotos(list);
      onPhotosChanged?.(list);
    } catch {}
    setPending(await listPending().then(all => all.filter(p => p.taskId === task.id)));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [task.id]);

  const hasServer = !!loadServerConfig();

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setErrMsg("");
    setUploading(true);
    const arr = Array.from(files);
    for (const f of arr) {
      try {
        if (!hasServer) throw new Error("offline");
        const { photo } = await uploadPhoto(task.id, f, { uploadedBy: currentUserName || "" });
        setPhotos(prev => [...prev, photo]);
      } catch (e: any) {
        // Queue for retry when we regain connectivity
        try {
          await queueUpload({
            taskId: task.id,
            taskName: task.task_type,
            blob: f,
            caption: "",
            uploadedBy: currentUserName || "",
            filename: f.name || "foto.jpg",
          });
        } catch (qe: any) {
          setErrMsg("Foto konnte nicht gespeichert werden: " + (qe?.message || ""));
        }
      }
    }
    setUploading(false);
    await refresh();
    onPhotosChanged?.(await listPhotos(task.id));
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deletePhoto(task.id, deleteConfirm.id);
      setPhotos(prev => prev.filter(p => p.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      onPhotosChanged?.(photos.filter(p => p.id !== deleteConfirm.id));
    } catch (e: any) {
      setErrMsg("Löschen fehlgeschlagen: " + (e?.message || ""));
    }
  };

  const retrySync = async () => {
    setUploading(true);
    await syncPending();
    setUploading(false);
    await refresh();
  };

  const total = photos.length + pending.length;

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-black/40 backdrop-blur">
        <button onClick={onClose} className="p-2 rounded-lg border border-white/15 bg-white/5">
          <Icon d={ICONS.close} size={20} color="#fff" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm opacity-60 font-bold uppercase tracking-widest">Media</div>
          <div className="text-lg font-black text-white truncate" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>{task.task_type}</div>
          <div className="text-xs opacity-60">{total} {total === 1 ? "Foto" : "Fotos"}{pending.length > 0 ? ` · ${pending.length} wartend` : ""}</div>
        </div>
        {!hasServer && (
          <div className="hidden sm:block px-3 py-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-400 text-xs font-bold">Offline</div>
        )}
      </div>

      {errMsg && (
        <div className="px-4 py-2 bg-red-500/20 border-b border-red-500/30 text-red-200 text-xs">{errMsg}</div>
      )}

      {pending.length > 0 && hasServer && (
        <div className="px-4 py-2.5 bg-orange-500/10 border-b border-orange-500/30 flex items-center gap-2">
          <span className="text-xs flex-1 text-orange-300"><b>{pending.length}</b> Foto(s) warten auf Upload.</span>
          <button onClick={retrySync} disabled={uploading} className="px-3 py-1.5 rounded-md border border-orange-500 bg-orange-500/20 text-orange-300 text-xs font-bold disabled:opacity-40">Jetzt synchronisieren</button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {photos.length === 0 && pending.length === 0 ? (
          <div className="text-center opacity-60 mt-20 text-white px-6">
            <div className="text-4xl mb-2">🖼</div>
            <div className="font-bold text-lg">Keine Fotos vorhanden</div>
            <div className="text-sm mt-1">Tippen Sie auf „Foto hinzufügen", um zu beginnen.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {photos.map(p => (
              <button
                key={p.id}
                onClick={() => setViewer(p)}
                className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5 group"
              >
                <img
                  src={p.thumbnailUrl || p.fullSizeUrl}
                  alt={p.caption || "Foto"}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition group-hover:scale-105"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                  <div className="text-[9px] text-white/90 font-bold truncate">{fmtDE(p.uploadedAt)}</div>
                  {p.uploadedBy ? <div className="text-[8px] text-white/70 truncate">{p.uploadedBy}</div> : null}
                </div>
              </button>
            ))}
            {pending.map(p => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border-2 border-orange-500/50 bg-orange-500/10">
                <img src={URL.createObjectURL(p.blob)} alt="" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="text-center text-orange-300">
                    <div className="text-xl">⏳</div>
                    <div className="text-[9px] font-bold">Wartend</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add buttons */}
      <div className="p-3 border-t border-white/10 bg-black/40 backdrop-blur grid grid-cols-2 gap-2 safe-bottom">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="h-12 rounded-xl border-2 border-brand-blue/60 bg-brand-blue/15 text-brand-blue font-black text-xs tracking-[2px] active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          📷 KAMERA
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-12 rounded-xl border-2 border-brand-green/60 bg-brand-green/15 text-brand-green font-black text-xs tracking-[2px] active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          🖼 GALERIE
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Fullscreen viewer */}
      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex items-center gap-2 p-3 border-b border-white/10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewer(null)} className="p-2 rounded-lg border border-white/15 bg-white/5">
              <Icon d={ICONS.close} size={20} color="#fff" />
            </button>
            <div className="flex-1 min-w-0 text-white">
              <div className="text-xs opacity-60 font-bold uppercase tracking-widest">Foto</div>
              <div className="text-sm truncate">{fmtDE(viewer.uploadedAt)}{viewer.uploadedBy ? ` · ${viewer.uploadedBy}` : ""}</div>
            </div>
            <a
              href={viewer.fullSizeUrl}
              target="_blank"
              rel="noopener"
              download
              className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-xs font-bold"
            >
              Download
            </a>
            {isAdmin && (
              <button onClick={() => setDeleteConfirm(viewer)} className="p-2 rounded-lg border border-red-500/60 bg-red-500/20 text-red-400">
                <Icon d={ICONS.trash} size={18} color="#FF3B30" />
              </button>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center p-2 overflow-auto">
            <img src={viewer.fullSizeUrl} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          </div>
          {viewer.caption && (
            <div className="p-3 border-t border-white/10 text-white text-sm bg-black/40" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
              <span className="opacity-60 text-xs font-bold uppercase tracking-widest mr-2">Kommentar</span>{viewer.caption}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl p-5 space-y-3" style={{ backgroundColor: "rgba(24,24,28,0.98)", border: "2px solid #FF3B30" }}>
            <div className="text-lg font-black text-red-400">Foto löschen?</div>
            <div className="text-sm text-white/80">Möchten Sie dieses Foto wirklich löschen?</div>
            <div className="text-xs text-white/50">Dies kann nicht rückgängig gemacht werden. Das Foto wird vom Server und aus Cloudinary entfernt.</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 h-12 rounded-xl border-2 border-white/15 bg-white/5 text-white font-black tracking-wide">ABBRECHEN</button>
              <button onClick={confirmDelete} className="flex-1 h-12 rounded-xl bg-red-500 text-white font-black tracking-wide">LÖSCHEN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
