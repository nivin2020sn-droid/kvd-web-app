// =====================================================================
// LAGER (Inventory) — independent PIN-gated tree of folders & products
//
// Routes: this entire module is mounted at /lager via <LagerGate />.
// Internal navigation uses React state for the tree path (no separate
// react-router routes) — keeps everything inside the existing layout
// without changing the global Navigation.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ICONS } from "./Icons";
import { api } from "../lib/api";
import { loadServerConfig } from "../lib/serverConfig";
import { WARN_SYMBOLS, WarnIcon, getWarnSymbol } from "./WarnSymbols";

// ---------- Types ----------
interface LagerFolder { id: string; parent_id: string | null; name: string; sort_order?: number; created_at: string }
interface LagerProduct {
  id: string;
  folder_id: string;
  name: string;
  image_url?: string | null;
  image_thumbnail?: string | null;
  image_public_id?: string | null;
  menge: number;
  einheit: string;
  inhalt_pro_stueck?: number | null;
  zweite_einheit?: string | null;
  info_text?: string;
  warn_symbols?: string[];
  created_at: string;
}

const PIN_KEY = "lager_session_v1";

// ---------- Session helpers ----------
function readSession(): { pin_version: number } | null {
  try {
    const raw = sessionStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j.pin_version === "number") return j;
  } catch {}
  return null;
}
function writeSession(s: { pin_version: number } | null) {
  try {
    if (s) sessionStorage.setItem(PIN_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(PIN_KEY);
  } catch {}
  try { window.dispatchEvent(new CustomEvent("lager-session-changed", { detail: s })); } catch {}
}

// Wrapper around api() that auto-attaches the pin_version header AND
// auto-clears the session when server replies 409 pin_changed.
async function lagerApi<T = any>(path: string, opts: any = {}): Promise<T> {
  const sess = readSession();
  try {
    return await api<T>(path, { ...opts, lagerPv: sess?.pin_version });
  } catch (e: any) {
    if (e?.status === 409 && /pin_changed/i.test(e?.message || "")) {
      writeSession(null);
    }
    throw e;
  }
}

// =====================================================================
// LagerGate — top-level wrapper. Decides between PIN-prompt and the actual
// LagerHome tree. Subscribes to session changes so PIN-revocation flips
// the UI back to the prompt instantly.
// =====================================================================
export function LagerGate() {
  const [sess, setSess] = useState(readSession);
  useEffect(() => {
    const onChange = () => setSess(readSession());
    window.addEventListener("lager-session-changed", onChange);
    window.addEventListener("storage", onChange);
    // Re-validate session on mount in case the PIN was changed elsewhere.
    (async () => {
      try {
        const r = await api<{ pin_version: number }>("/lager/pin-version");
        const cur = readSession();
        if (cur && cur.pin_version !== r.pin_version) writeSession(null);
      } catch {}
    })();
    return () => {
      window.removeEventListener("lager-session-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  if (!sess) return <LagerPinScreen />;
  return <LagerHome />;
}

// =====================================================================
// PIN screen — 4 to 6 digits. Auto-submits on 4 digits, but lets the user
// continue typing up to 6 (only confirms on Enter / button if longer).
// =====================================================================
function LagerPinScreen() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (code: string) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ ok: true; pin_version: number }>("/lager/verify-pin", {
        method: "POST", body: { pin: code },
      });
      writeSession({ pin_version: r.pin_version });
    } catch (e: any) {
      setErr(e?.payload?.detail || "Falscher PIN");
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full p-5 flex flex-col">
      <div className="mt-6 mb-6">
        <h1 className="text-3xl font-black tracking-[2px]" style={{ color: "#A78BFA" }}>LAGER</h1>
        <p className="text-white/50 text-xs tracking-[3px] mt-2 uppercase">Bestände · Material</p>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm rounded-3xl p-6 border" style={{ borderColor: "#A78BFA33", backgroundColor: "#A78BFA0F" }}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: "#A78BFA22" }}>
              <Icon d={ICONS.lock} size={32} color="#A78BFA" />
            </div>
            <div className="text-base font-black tracking-wider">PIN EINGEBEN</div>
            <div className="text-[11px] opacity-60 mt-1">4 bis 6 Ziffern</div>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(v);
              setErr("");
              // Auto-submit when user has typed exactly 4 digits AND there's a
              // small idle pause. To stay simple we only auto-submit when we
              // hit length 4 once (user can still backspace + type 5/6).
              // Submit explicitly via button for >=5 digit PINs.
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.length >= 4) submit(pin);
            }}
            className="w-full text-center text-3xl tracking-[16px] font-black bg-black/30 border-2 rounded-xl py-4 outline-none"
            style={{ borderColor: err ? "#FF6B6B" : "#A78BFA66", color: "#fff" }}
            placeholder="••••"
            autoComplete="off"
          />
          {err ? (
            <div className="mt-3 text-center text-[12px] font-bold" style={{ color: "#FF6B6B" }}>{err}</div>
          ) : null}
          <button
            disabled={pin.length < 4 || busy}
            onClick={() => submit(pin)}
            className="w-full mt-5 py-3 rounded-xl font-black tracking-widest disabled:opacity-30"
            style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}
          >{busy ? "PRÜFE…" : "ANMELDEN"}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// LagerHome — the actual tree view (folders + products). Internal state
// holds `path` (array of folders from root → current). No router routes.
// =====================================================================
function LagerHome() {
  const [path, setPath] = useState<LagerFolder[]>([]);
  const currentId = path.length ? path[path.length - 1].id : null;
  const [folders, setFolders] = useState<LagerFolder[]>([]);
  const [products, setProducts] = useState<LagerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState<null | "folder" | "product" | "menu">(null);
  const [editProduct, setEditProduct] = useState<LagerProduct | null>(null);
  const [viewProduct, setViewProduct] = useState<LagerProduct | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ kind: "folder"; item: LagerFolder } | { kind: "product"; item: LagerProduct } | null>(null);
  const [renameFolder, setRenameFolder] = useState<LagerFolder | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [fs, ps] = await Promise.all([
        lagerApi<LagerFolder[]>(`/lager/folders?parent_id=${currentId || "root"}`),
        currentId
          ? lagerApi<LagerProduct[]>(`/lager/products?folder_id=${currentId}`)
          : Promise.resolve([] as LagerProduct[]),
      ]);
      setFolders(fs); setProducts(ps);
    } catch (e: any) {
      // 409 is handled by lagerApi (auto-clears session). Other errors show empty.
      setFolders([]); setProducts([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentId]);

  const openFolder = (f: LagerFolder) => setPath([...path, f]);
  const navigateTo = (idx: number) => setPath(path.slice(0, idx));

  return (
    <div className="min-h-full">
      {/* Header (kept inside the existing app Layout — no separate header bar) */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-[3px] opacity-60">LAGER</div>
          <Breadcrumb path={path} onJump={navigateTo} />
        </div>
        <button
          onClick={() => { writeSession(null); }}
          className="text-[11px] font-bold opacity-60 active:opacity-100 px-3 py-1.5 rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.2)" }}
          title="Lager-Sitzung beenden"
        >Sperren</button>
      </div>

      {/* Tree contents */}
      <div className="px-5 pb-28">
        {loading ? (
          <div className="text-center opacity-60 mt-10 text-sm">Lade…</div>
        ) : folders.length === 0 && products.length === 0 ? (
          <div className="text-center opacity-50 mt-12 text-sm">
            {currentId ? "Dieser Ordner ist leer." : "Noch keine Ordner. Tippe + um zu beginnen."}
          </div>
        ) : (
          <div className="space-y-3">
            {folders.length > 0 && (
              <div>
                <div className="text-[10px] font-black tracking-[3px] opacity-50 mb-2">ORDNER</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {folders.map((f) => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={() => openFolder(f)}
                      onRename={() => setRenameFolder(f)}
                      onDelete={() => setConfirmDel({ kind: "folder", item: f })}
                    />
                  ))}
                </div>
              </div>
            )}
            {products.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-black tracking-[3px] opacity-50 mb-2">PRODUKTE</div>
                <div className="space-y-2.5">
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onChange={(np) => setProducts(products.map((x) => x.id === np.id ? np : x))}
                      onOpen={() => setViewProduct(p)}
                      onEdit={() => setEditProduct(p)}
                      onDelete={() => setConfirmDel({ kind: "product", item: p })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating + button */}
      <button
        onClick={() => setShowAdd("menu")}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-30 active:scale-95 transition"
        style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}
        aria-label="Neu hinzufügen"
      ><Icon d={ICONS.plus} size={28} color="#0F0F0F" /></button>

      {/* "Neu hinzufügen" menu */}
      {showAdd === "menu" && (
        <Modal onClose={() => setShowAdd(null)} title="Neu hinzufügen">
          <button
            onClick={() => setShowAdd("folder")}
            className="w-full py-4 rounded-xl mb-2 font-bold flex items-center gap-3 px-4"
            style={{ backgroundColor: "#A78BFA1A", color: "#A78BFA", border: "1px solid #A78BFA44" }}
          >
            <Icon d={ICONS.folder} size={22} color="#A78BFA" />
            Neuer Ordner
          </button>
          <button
            onClick={() => setShowAdd("product")}
            disabled={!currentId}
            className="w-full py-4 rounded-xl font-bold flex items-center gap-3 px-4 disabled:opacity-30"
            style={{ backgroundColor: "#00E6761A", color: "#00E676", border: "1px solid #00E67644" }}
          >
            <Icon d={ICONS.box} size={22} color="#00E676" />
            Neues Produkt
          </button>
          {!currentId && (
            <div className="mt-3 text-[11px] opacity-60 text-center">
              Produkte können nur innerhalb eines Ordners angelegt werden.
            </div>
          )}
        </Modal>
      )}

      {showAdd === "folder" && (
        <FolderEditModal
          parent_id={currentId}
          existing={null}
          onClose={() => setShowAdd(null)}
          onSaved={() => { setShowAdd(null); load(); }}
        />
      )}
      {renameFolder && (
        <FolderEditModal
          parent_id={currentId}
          existing={renameFolder}
          onClose={() => setRenameFolder(null)}
          onSaved={() => { setRenameFolder(null); load(); }}
        />
      )}
      {showAdd === "product" && currentId && (
        <ProductEditModal
          folder_id={currentId}
          existing={null}
          onClose={() => setShowAdd(null)}
          onSaved={() => { setShowAdd(null); load(); }}
        />
      )}
      {editProduct && (
        <ProductEditModal
          folder_id={editProduct.folder_id}
          existing={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); load(); }}
        />
      )}
      {viewProduct && (
        <ProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onEdit={() => { setEditProduct(viewProduct); setViewProduct(null); }}
        />
      )}
      {confirmDel && (
        <ConfirmDeleteModal
          target={confirmDel}
          onClose={() => setConfirmDel(null)}
          onDeleted={() => { setConfirmDel(null); load(); }}
        />
      )}
    </div>
  );
}

// ---------- Breadcrumb ----------
function Breadcrumb({ path, onJump }: { path: LagerFolder[]; onJump: (idx: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-base font-black mt-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <button onClick={() => onJump(0)} className="active:scale-95 px-1" style={{ color: path.length === 0 ? "#A78BFA" : "#fff" }}>Lager</button>
      {path.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1 min-w-0">
          <span className="opacity-40 px-0.5">›</span>
          <button
            onClick={() => onJump(i + 1)}
            className="active:scale-95 px-1 truncate max-w-[120px]"
            style={{ color: i === path.length - 1 ? "#A78BFA" : "#fff" }}
          >{f.name}</button>
        </span>
      ))}
    </div>
  );
}

// ---------- Folder Card ----------
function FolderCard({ folder, onOpen, onRename, onDelete }: {
  folder: LagerFolder; onOpen: () => void; onRename: () => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={onOpen}
        className="w-full text-left rounded-xl p-3 border active:scale-[0.98] transition"
        style={{ borderColor: "#A78BFA33", backgroundColor: "#A78BFA0F" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#A78BFA22" }}>
            <Icon d={ICONS.folder} size={22} color="#A78BFA" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm leading-tight truncate">{folder.name}</div>
            <div className="text-[10px] opacity-50 mt-0.5">Ordner</div>
          </div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}
        className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ color: "rgba(255,255,255,0.5)" }}
        aria-label="Menü"
      >⋯</button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute top-8 right-1 z-20 bg-neutral-900 border border-white/15 rounded-xl shadow-2xl py-1 w-36">
            <button onClick={() => { setMenu(false); onRename(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5">Umbenennen</button>
            <button onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5" style={{ color: "#FF6B6B" }}>Löschen</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Product Card with quick quantity edit ----------
function ProductCard({ product, onChange, onOpen, onEdit, onDelete }: {
  product: LagerProduct;
  onChange: (p: LagerProduct) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const adjust = async (delta: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await lagerApi<LagerProduct>(`/lager/products/${product.id}/menge`, { method: "PATCH", body: { delta } });
      onChange(r);
    } catch {} finally { setBusy(false); }
  };
  const setExact = async (val: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await lagerApi<LagerProduct>(`/lager/products/${product.id}/menge`, { method: "PATCH", body: { set: val } });
      onChange(r);
    } catch {} finally { setBusy(false); setEditingQty(false); }
  };

  const total = product.inhalt_pro_stueck && product.zweite_einheit
    ? `${product.menge * product.inhalt_pro_stueck} ${product.zweite_einheit}`
    : null;

  return (
    <div className="relative rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" }}>
      <div className="flex gap-3">
        {/* Image */}
        <button onClick={onOpen} className="shrink-0">
          {product.image_thumbnail || product.image_url ? (
            <img src={product.image_thumbnail || product.image_url || ""} alt="" className="w-16 h-16 rounded-lg object-cover bg-black/30" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <Icon d={ICONS.box} size={24} color="rgba(255,255,255,0.3)" />
            </div>
          )}
        </button>
        {/* Body */}
        <div className="flex-1 min-w-0">
          <button onClick={onOpen} className="text-left w-full">
            <div className="font-black text-sm leading-tight truncate">{product.name}</div>
          </button>
          {/* Warning icons row */}
          {product.warn_symbols && product.warn_symbols.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {product.warn_symbols.map((id) => <WarnIcon key={id} id={id} size={22} />)}
            </div>
          )}
          {/* Quick qty edit */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => adjust(-1)}
              disabled={busy || product.menge <= 0}
              className="w-8 h-8 rounded-lg font-black text-base flex items-center justify-center disabled:opacity-30 active:scale-95"
              style={{ backgroundColor: "rgba(255,107,107,0.15)", color: "#FF6B6B" }}
              aria-label="weniger"
            >−</button>
            {editingQty ? (
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(qtyDraft);
                  if (!isNaN(v) && v >= 0) setExact(v);
                  else setEditingQty(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                  if (e.key === "Escape") { setEditingQty(false); }
                }}
                className="w-16 text-center text-base font-black bg-black/40 border border-white/20 rounded-lg py-1"
              />
            ) : (
              <button
                onClick={() => { setQtyDraft(String(product.menge)); setEditingQty(true); }}
                className="min-w-[60px] text-center font-black text-base px-2 py-1 rounded-lg active:bg-white/10"
              >{product.menge}</button>
            )}
            <button
              onClick={() => adjust(1)}
              disabled={busy}
              className="w-8 h-8 rounded-lg font-black text-base flex items-center justify-center disabled:opacity-30 active:scale-95"
              style={{ backgroundColor: "rgba(0,230,118,0.15)", color: "#00E676" }}
              aria-label="mehr"
            >+</button>
            <span className="text-[12px] opacity-70 truncate ml-0.5">{product.einheit}</span>
            {total && <span className="text-[10px] opacity-45 ml-1">≈ {total}</span>}
          </div>
        </div>
        {/* ⋯ menu */}
        <button onClick={() => setMenu(!menu)} className="w-7 h-7 -mr-1 -mt-1 self-start rounded-full" style={{ color: "rgba(255,255,255,0.5)" }}>⋯</button>
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute top-9 right-2 z-20 bg-neutral-900 border border-white/15 rounded-xl shadow-2xl py-1 w-36">
            <button onClick={() => { setMenu(false); onEdit(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5">Bearbeiten</button>
            <button onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5" style={{ color: "#FF6B6B" }}>Löschen</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Folder Edit Modal ----------
function FolderEditModal({ parent_id, existing, onClose, onSaved }: {
  parent_id: string | null; existing: LagerFolder | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    if (!name.trim()) { setErr("Name fehlt"); return; }
    setBusy(true); setErr("");
    try {
      if (existing) {
        await lagerApi(`/lager/folders/${existing.id}`, { method: "PATCH", body: { name: name.trim() } });
      } else {
        await lagerApi(`/lager/folders`, { method: "POST", body: { name: name.trim(), parent_id } });
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.payload?.detail || "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Ordner umbenennen" : "Neuer Ordner"}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ordnername"
        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-base outline-none"
      />
      {err && <div className="text-xs mt-2" style={{ color: "#FF6B6B" }}>{err}</div>}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
        <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl font-black disabled:opacity-50" style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}>{busy ? "…" : "Speichern"}</button>
      </div>
    </Modal>
  );
}

// ---------- Product Edit Modal ----------
function ProductEditModal({ folder_id, existing, onClose, onSaved }: {
  folder_id: string; existing: LagerProduct | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]               = useState(existing?.name || "");
  const [menge, setMenge]             = useState<string>(existing ? String(existing.menge) : "0");
  const [einheit, setEinheit]         = useState(existing?.einheit || "Stück");
  const [hasSecondary, setHasSecondary] = useState(!!(existing?.inhalt_pro_stueck && existing?.zweite_einheit));
  const [inhalt, setInhalt]           = useState<string>(existing?.inhalt_pro_stueck != null ? String(existing.inhalt_pro_stueck) : "");
  const [zweite, setZweite]           = useState(existing?.zweite_einheit || "");
  const [info, setInfo]               = useState(existing?.info_text || "");
  const [warnIds, setWarnIds]         = useState<string[]>(existing?.warn_symbols || []);
  const [imageUrl, setImageUrl]       = useState(existing?.image_url || "");
  const [imageThumb, setImageThumb]   = useState(existing?.image_thumbnail || "");
  const [imagePid, setImagePid]       = useState(existing?.image_public_id || "");
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState("");
  const [uploading, setUploading]     = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickImage = async (file: File) => {
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const cfg = loadServerConfig();
      const base = (cfg?.apiBaseUrl || "/api").replace(/\/$/, "");
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`${base}/lager/products/upload-image`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || "Upload fehlgeschlagen");
      setImageUrl(j.url); setImageThumb(j.thumbnail); setImagePid(j.public_id);
    } catch (e: any) {
      setErr(e?.message || "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim()) { setErr("Name fehlt"); return; }
    setBusy(true); setErr("");
    const body: any = {
      folder_id, name: name.trim(),
      menge: Number(menge) || 0,
      einheit: einheit.trim() || "Stück",
      info_text: info,
      warn_symbols: warnIds,
      image_url: imageUrl || null,
      image_thumbnail: imageThumb || null,
      image_public_id: imagePid || null,
      inhalt_pro_stueck: hasSecondary && inhalt ? Number(inhalt) : null,
      zweite_einheit: hasSecondary && zweite ? zweite.trim() : null,
    };
    try {
      if (existing) {
        await lagerApi(`/lager/products/${existing.id}`, { method: "PATCH", body });
      } else {
        await lagerApi(`/lager/products`, { method: "POST", body });
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.payload?.detail || "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Produkt bearbeiten" : "Neues Produkt"} large>
      <div className="space-y-3">
        {/* Image picker */}
        <div className="flex gap-3 items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden bg-black/30"
          >
            {imageThumb || imageUrl
              ? <img src={imageThumb || imageUrl} alt="" className="w-full h-full object-cover" />
              : <Icon d={ICONS.box} size={28} color="rgba(255,255,255,0.4)" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
          <div className="flex-1 text-xs opacity-70 leading-snug">
            {uploading ? "Lade Bild hoch…" : (imageUrl ? "Tippen zum Ändern" : "Tippen zum Hochladen")}
          </div>
        </div>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-style" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Menge">
            <input type="number" inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} className="input-style" />
          </Field>
          <Field label="Einheit">
            <input value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="Stück" className="input-style" />
          </Field>
        </div>

        {/* Optional secondary unit */}
        <div className="rounded-xl border border-white/10 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasSecondary} onChange={(e) => setHasSecondary(e.target.checked)} />
            <span>Zweite Einheit (z.B. 1 Stück = 5 Liter)</span>
          </label>
          {hasSecondary && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="Inhalt pro Stück">
                <input type="number" inputMode="decimal" value={inhalt} onChange={(e) => setInhalt(e.target.value)} className="input-style" />
              </Field>
              <Field label="Einheit">
                <input value={zweite} onChange={(e) => setZweite(e.target.value)} placeholder="Liter" className="input-style" />
              </Field>
            </div>
          )}
        </div>

        <Field label="Produktinformationen (optional)">
          <textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={3} className="input-style resize-none" />
        </Field>

        <Field label={`Warnsymbole (${warnIds.length} ausgewählt)`}>
          <WarnPicker selected={warnIds} onChange={setWarnIds} />
        </Field>

        {err && <div className="text-xs" style={{ color: "#FF6B6B" }}>{err}</div>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
          <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl font-black disabled:opacity-50" style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}>
            {busy ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Product Detail Modal ----------
function ProductDetailModal({ product, onClose, onEdit }: { product: LagerProduct; onClose: () => void; onEdit: () => void }) {
  return (
    <Modal onClose={onClose} title={product.name} large>
      <div className="space-y-3">
        {(product.image_url || product.image_thumbnail) && (
          <img src={product.image_url || product.image_thumbnail || ""} alt="" className="w-full max-h-72 object-contain rounded-xl bg-black/30" />
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-black text-2xl" style={{ color: "#A78BFA" }}>{product.menge}</span>
          <span className="opacity-70">{product.einheit}</span>
          {product.inhalt_pro_stueck && product.zweite_einheit && (
            <span className="opacity-50 text-xs">≈ {product.menge * product.inhalt_pro_stueck} {product.zweite_einheit}</span>
          )}
        </div>
        {product.info_text && (
          <div className="rounded-xl border border-white/10 p-3 text-sm whitespace-pre-wrap leading-relaxed">{product.info_text}</div>
        )}
        {product.warn_symbols && product.warn_symbols.length > 0 && (
          <div>
            <div className="text-[10px] font-black tracking-[3px] opacity-50 mb-2">WARNSYMBOLE</div>
            <div className="space-y-2">
              {product.warn_symbols.map((id) => {
                const def = getWarnSymbol(id);
                if (!def) return null;
                return (
                  <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 p-2">
                    <WarnIcon id={id} size={44} />
                    <div className="min-w-0">
                      <div className="font-black text-sm">{def.label}</div>
                      <div className="text-[11px] opacity-70 leading-snug">{def.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Schließen</button>
          <button onClick={onEdit} className="flex-1 py-3 rounded-xl font-black" style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}>Bearbeiten</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Confirm Delete ----------
function ConfirmDeleteModal({ target, onClose, onDeleted }: {
  target: { kind: "folder"; item: LagerFolder } | { kind: "product"; item: LagerProduct };
  onClose: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isFolder = target.kind === "folder";
  const name = target.item.name;

  const doDelete = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const path = isFolder ? `/lager/folders/${target.item.id}` : `/lager/products/${target.item.id}`;
      await lagerApi(path, { method: "DELETE" });
      onDeleted();
    } catch (e: any) {
      const detail = e?.payload?.detail;
      if (isFolder && /nicht leer/i.test(detail || "")) {
        const sub = e?.payload?.subfolders || 0;
        const prod = e?.payload?.products || 0;
        setErr(`Ordner ist nicht leer (${sub} Unterordner, ${prod} Produkte). Bitte zuerst Inhalt verschieben oder löschen.`);
      } else {
        setErr(detail || "Löschen fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isFolder ? "Ordner löschen?" : "Produkt löschen?"}>
      <div className="text-sm mb-3 leading-relaxed">
        Möchten Sie <span className="font-black">„{name}"</span> wirklich löschen?
      </div>
      {err && (
        <div className="rounded-xl p-3 mb-3 border" style={{ borderColor: "#FF6B6B66", backgroundColor: "#FF6B6B14", color: "#FF6B6B" }}>
          {err}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
        <button onClick={doDelete} disabled={busy} className="flex-1 py-3 rounded-xl font-black" style={{ backgroundColor: "#FF6B6B", color: "#fff" }}>
          {busy ? "…" : "Löschen"}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Warning Symbols Picker ----------
function WarnPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const groups = useMemo(() => {
    const out: Record<string, typeof WARN_SYMBOLS> = { ppe: [], ghs: [], warn: [] };
    for (const s of WARN_SYMBOLS) out[s.group].push(s);
    return out;
  }, []);
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const groupLabel: Record<string, string> = {
    ppe: "PPE — Schutzausrüstung",
    ghs: "GHS — Gefahrstoff",
    warn: "Warnung",
  };
  return (
    <div className="space-y-3">
      {(["ppe", "ghs", "warn"] as const).map((g) => (
        <div key={g}>
          <div className="text-[10px] font-black tracking-[3px] opacity-60 mb-1.5">{groupLabel[g]}</div>
          <div className="grid grid-cols-3 gap-2">
            {groups[g].map((s) => {
              const active = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`rounded-xl p-2 border-2 active:scale-95 transition flex flex-col items-center gap-1 ${active ? "border-brand-purple" : "border-white/10"}`}
                  style={{ borderColor: active ? "#A78BFA" : undefined, backgroundColor: active ? "#A78BFA14" : "rgba(255,255,255,0.03)" }}
                  aria-pressed={active}
                >
                  <WarnIcon id={s.id} size={42} />
                  <div className="text-[10px] font-bold leading-tight text-center">{s.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- shared little components ----------
function Modal({ children, onClose, title, large }: { children: React.ReactNode; onClose: () => void; title: string; large?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${large ? "max-w-md" : "max-w-sm"} bg-neutral-950 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-black tracking-wider">{title}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: "rgba(255,255,255,0.6)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-black tracking-[3px] opacity-60 mb-1">{label.toUpperCase()}</div>
      {children}
    </label>
  );
}
