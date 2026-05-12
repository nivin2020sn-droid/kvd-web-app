// =====================================================================
// LAGER (Inventory) — independent PIN-gated tree of folders & products.
// UI style: ONLINE-SHOP / Produktkatalog (square image cards in a
// responsive grid, full names, no truncation, hover/glow effects).
//
// Mounted at /lager via <LagerGate />. Internal navigation uses React
// state (not router routes) — keeps everything inside the existing
// Layout without changing global Navigation.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ICONS } from "./Icons";
import { api } from "../lib/api";
import { loadServerConfig } from "../lib/serverConfig";
import { WARN_SYMBOLS, WarnIcon, getWarnSymbol } from "./WarnSymbols";
import { buildLagerReportData, exportLagerPDF, exportLagerCSV } from "../lib/lagerReport";

// ---------- Types ----------
interface LagerFolder {
  id: string; parent_id: string | null; name: string; sort_order?: number;
  image_url?: string | null; image_thumbnail?: string | null; image_public_id?: string | null;
  created_at: string;
}
interface LagerProduct {
  id: string;
  folder_id: string;
  name: string;
  lan?: string | null;
  image_url?: string | null;
  image_thumbnail?: string | null;
  image_public_id?: string | null;
  menge: number;
  einheit: string;
  inhalt_pro_stueck?: number | null;
  zweite_einheit?: string | null;
  minimum_quantity?: number;
  info_text?: string;
  warn_symbols?: string[];
  created_at: string;
}

const PIN_KEY = "lager_session_v1";

// ---------- Stock-status (Mindestmenge) ----------
type StockStatus = "critical" | "low" | "ok" | "neutral";
interface StockStyle { label: string; color: string; bg: string; ring: string; glow: string }

function computeStock(p: LagerProduct): StockStatus {
  const m = Number(p.menge) || 0;
  const min = Number(p.minimum_quantity) || 0;
  if (m <= 0) return "critical";
  if (min > 0 && m < min) return "low";
  if (min > 0) return "ok";
  return "neutral";          // no minimum defined → neither good nor bad
}
const STOCK_STYLE: Record<StockStatus, StockStyle> = {
  critical: { label: "Leer",    color: "#FF4D4F", bg: "#FF4D4F18", ring: "#FF4D4F",  glow: "0 0 0 1px #FF4D4F66, 0 0 24px -4px #FF4D4F88" },
  low:      { label: "Niedrig", color: "#FF9F40", bg: "#FF9F4018", ring: "#FF9F40",  glow: "0 0 0 1px #FF9F4055, 0 0 18px -6px #FF9F4080" },
  ok:       { label: "OK",      color: "#00E676", bg: "#00E67616", ring: "#00E67688", glow: "0 0 0 1px #00E67644, 0 0 16px -8px #00E67670" },
  neutral:  { label: "",        color: "rgba(255,255,255,0.6)", bg: "transparent",  ring: "rgba(255,255,255,0.12)", glow: "none" },
};

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

async function lagerApi<T = any>(path: string, opts: any = {}): Promise<T> {
  const sess = readSession();
  try {
    return await api<T>(path, { ...opts, lagerPv: sess?.pin_version });
  } catch (e: any) {
    if (e?.status === 409 && /pin_changed/i.test(e?.message || "")) writeSession(null);
    throw e;
  }
}

// =====================================================================
// LagerGate — top-level wrapper.
// =====================================================================
export function LagerGate() {
  const [sess, setSess] = useState(readSession);
  useEffect(() => {
    const onChange = () => setSess(readSession());
    window.addEventListener("lager-session-changed", onChange);
    window.addEventListener("storage", onChange);
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
// PIN screen
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
    } finally { setBusy(false); }
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
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) submit(pin); }}
            className="w-full text-center text-3xl tracking-[16px] font-black bg-black/30 border-2 rounded-xl py-4 outline-none"
            style={{ borderColor: err ? "#FF6B6B" : "#A78BFA66", color: "#fff" }}
            placeholder="••••"
            autoComplete="off"
          />
          {err ? <div className="mt-3 text-center text-[12px] font-bold" style={{ color: "#FF6B6B" }}>{err}</div> : null}
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
// LagerHome — Online-shop catalog grid
// =====================================================================
function LagerHome() {
  const [path, setPath] = useState<LagerFolder[]>([]);
  const currentId = path.length ? path[path.length - 1].id : null;
  const currentFolderName = path.length ? path[path.length - 1].name : null;
  const [folders, setFolders] = useState<LagerFolder[]>([]);
  const [products, setProducts] = useState<LagerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState<null | "folder" | "product" | "menu">(null);
  const [editProduct, setEditProduct] = useState<LagerProduct | null>(null);
  const [viewProduct, setViewProduct] = useState<LagerProduct | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ kind: "folder"; item: LagerFolder } | { kind: "product"; item: LagerProduct } | null>(null);
  const [editFolder, setEditFolder] = useState<LagerFolder | null>(null);
  // Export state: null = closed, "pick" = format chooser, { busy } = working
  const [exportState, setExportState] = useState<
    | null
    | { phase: "pick"; scope: "all" | "folder"; folderId?: string; folderName?: string }
    | { phase: "busy"; label: string; progress?: { loaded: number; total: number } }
  >(null);

  const load = async () => {
    setLoading(true);
    try {
      const [fs, ps] = await Promise.all([
        lagerApi<LagerFolder[]>(`/lager/folders?parent_id=${currentId || "root"}`),
        currentId ? lagerApi<LagerProduct[]>(`/lager/products?folder_id=${currentId}`) : Promise.resolve([] as LagerProduct[]),
      ]);
      setFolders(fs); setProducts(ps);
    } catch {
      setFolders([]); setProducts([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentId]);

  const openFolder = (f: LagerFolder) => setPath([...path, f]);
  const navigateTo = (idx: number) => setPath(path.slice(0, idx));

  // -------- Export handler --------
  // Builds the report data, then writes either a PDF or CSV file to the
  // user's downloads. Pure READ-only — never touches product data.
  const runExport = async (fmt: "pdf" | "csv") => {
    if (!exportState || exportState.phase !== "pick") return;
    const sess = readSession();
    const scope = exportState.scope;
    const folderId = exportState.folderId;
    const folderName = exportState.folderName;
    setExportState({ phase: "busy", label: "Lade Daten…" });
    try {
      const data = await buildLagerReportData({
        scope,
        folderId,
        folderName: folderName || undefined,
        lagerPv: sess?.pin_version,
      });
      if (data.totals.productCount === 0) {
        alert("Keine Produkte zum Exportieren gefunden.");
        setExportState(null);
        return;
      }
      if (fmt === "csv") {
        setExportState({ phase: "busy", label: "Erzeuge CSV…" });
        exportLagerCSV(data);
      } else {
        setExportState({ phase: "busy", label: "Erzeuge PDF…", progress: { loaded: 0, total: 0 } });
        await exportLagerPDF(data, {
          includeImages: true,
          onProgress: (loaded, total) => {
            setExportState({
              phase: "busy",
              label: `Lade Produktbilder… ${loaded}/${total}`,
              progress: { loaded, total },
            });
          },
        });
      }
      setExportState(null);
    } catch (e: any) {
      alert("Export fehlgeschlagen: " + (e?.message || "Unbekannter Fehler"));
      setExportState(null);
    }
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-[3px] opacity-60">LAGER</div>
          <Breadcrumb path={path} onJump={navigateTo} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Export button — label depends on context */}
          <button
            onClick={() =>
              setExportState({
                phase: "pick",
                scope: currentId ? "folder" : "all",
                folderId: currentId || undefined,
                folderName: currentFolderName || undefined,
              })
            }
            className="text-[11px] font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 active:scale-95 transition"
            style={{
              borderColor: "rgba(167,139,250,0.4)",
              backgroundColor: "rgba(167,139,250,0.12)",
              color: "#C4B5FD",
            }}
            title={currentId ? "Bericht für diesen Ordner" : "Bericht für das gesamte Lager"}
          >
            <Icon d={ICONS.download} size={14} color="#C4B5FD" />
            <span className="hidden sm:inline">
              {currentId ? "Ordnerbericht exportieren" : "Gesamtlager exportieren"}
            </span>
            <span className="sm:hidden">Export</span>
          </button>
          <button
            onClick={() => writeSession(null)}
            className="text-[11px] font-bold opacity-60 active:opacity-100 px-3 py-1.5 rounded-full border"
            style={{ borderColor: "rgba(255,255,255,0.2)" }}
            title="Lager-Sitzung beenden"
          >Sperren</button>
        </div>
      </div>

      {/* Catalog grid */}
      <div className="px-4 sm:px-5 pb-32 sm:pb-28">
        {loading ? (
          <div className="text-center opacity-60 mt-10 text-sm">Lade…</div>
        ) : folders.length === 0 && products.length === 0 ? (
          <div className="text-center opacity-50 mt-12 text-sm">
            {currentId ? "Dieser Ordner ist leer." : "Noch keine Ordner. Tippe + um zu beginnen."}
          </div>
        ) : (
          <div className="space-y-6">
            {folders.length > 0 && (
              <section>
                <SectionHeader>Ordner · {folders.length}</SectionHeader>
                <CatalogGrid>
                  {folders.map((f) => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={() => openFolder(f)}
                      onEdit={() => setEditFolder(f)}
                      onDelete={() => setConfirmDel({ kind: "folder", item: f })}
                    />
                  ))}
                </CatalogGrid>
              </section>
            )}
            {products.length > 0 && (
              <section>
                <SectionHeader>Produkte · {products.length}</SectionHeader>
                <CatalogGrid>
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
                </CatalogGrid>
              </section>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd("menu")}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-30 active:scale-95 transition"
        style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}
        aria-label="Neu hinzufügen"
      ><Icon d={ICONS.plus} size={28} color="#0F0F0F" /></button>

      {/* Add menu */}
      {showAdd === "menu" && (
        <Modal onClose={() => setShowAdd(null)} title="Neu hinzufügen">
          <button
            onClick={() => setShowAdd("folder")}
            className="w-full py-4 rounded-xl mb-2 font-bold flex items-center gap-3 px-4"
            style={{ backgroundColor: "#A78BFA1A", color: "#A78BFA", border: "1px solid #A78BFA44" }}
          ><Icon d={ICONS.folder} size={22} color="#A78BFA" /> Neuer Ordner</button>
          <button
            onClick={() => setShowAdd("product")}
            disabled={!currentId}
            className="w-full py-4 rounded-xl font-bold flex items-center gap-3 px-4 disabled:opacity-30"
            style={{ backgroundColor: "#00E6761A", color: "#00E676", border: "1px solid #00E67644" }}
          ><Icon d={ICONS.box} size={22} color="#00E676" /> Neues Produkt</button>
          {!currentId && (
            <div className="mt-3 text-[11px] opacity-60 text-center">
              Produkte können nur innerhalb eines Ordners angelegt werden.
            </div>
          )}
        </Modal>
      )}

      {showAdd === "folder" && (
        <FolderEditModal parent_id={currentId} existing={null}
          onClose={() => setShowAdd(null)} onSaved={() => { setShowAdd(null); load(); }} />
      )}
      {editFolder && (
        <FolderEditModal parent_id={currentId} existing={editFolder}
          onClose={() => setEditFolder(null)} onSaved={() => { setEditFolder(null); load(); }} />
      )}
      {showAdd === "product" && currentId && (
        <ProductEditModal folder_id={currentId} existing={null}
          onClose={() => setShowAdd(null)} onSaved={() => { setShowAdd(null); load(); }} />
      )}
      {editProduct && (
        <ProductEditModal folder_id={editProduct.folder_id} existing={editProduct}
          onClose={() => setEditProduct(null)} onSaved={() => { setEditProduct(null); load(); }} />
      )}
      {viewProduct && (
        <ProductDetailModal product={viewProduct}
          onClose={() => setViewProduct(null)}
          onEdit={() => { setEditProduct(viewProduct); setViewProduct(null); }} />
      )}
      {confirmDel && (
        <ConfirmDeleteModal target={confirmDel}
          onClose={() => setConfirmDel(null)} onDeleted={() => { setConfirmDel(null); load(); }} />
      )}

      {/* Export format chooser */}
      {exportState?.phase === "pick" && (
        <Modal
          onClose={() => setExportState(null)}
          title={
            exportState.scope === "folder"
              ? `Ordnerbericht — ${exportState.folderName || "Ordner"}`
              : "Gesamtlager-Bericht"
          }
        >
          <div className="text-[12px] opacity-70 mb-3 leading-relaxed">
            Wähle das gewünschte Format. Beide Berichte enthalten alle Produkte
            sortiert nach LAN-Nummer, mit Status-Farbkennzeichnung
            (<span style={{ color: "#00E676" }}>Grün</span> ·{" "}
            <span style={{ color: "#FF9F40" }}>Orange</span> ·{" "}
            <span style={{ color: "#FF4D4F" }}>Rot</span>).
          </div>
          <button
            onClick={() => runExport("pdf")}
            className="w-full py-4 rounded-xl mb-2 font-bold flex items-center gap-3 px-4 active:scale-[0.98] transition"
            style={{ backgroundColor: "#A78BFA1A", color: "#A78BFA", border: "1px solid #A78BFA44" }}
          >
            <Icon d={ICONS.pdf} size={22} color="#A78BFA" />
            <div className="text-left flex-1">
              <div>Als PDF speichern</div>
              <div className="text-[10px] font-normal opacity-70">Druck-fertig · mit Produktbildern · farbcodiert</div>
            </div>
          </button>
          <button
            onClick={() => runExport("csv")}
            className="w-full py-4 rounded-xl font-bold flex items-center gap-3 px-4 active:scale-[0.98] transition"
            style={{ backgroundColor: "#00E6761A", color: "#00E676", border: "1px solid #00E67644" }}
          >
            <Icon d={ICONS.list} size={22} color="#00E676" />
            <div className="text-left flex-1">
              <div>Als CSV / Excel speichern</div>
              <div className="text-[10px] font-normal opacity-70">Bearbeitbar · ; getrennt · UTF-8 BOM</div>
            </div>
          </button>
        </Modal>
      )}

      {/* Busy overlay during export */}
      {exportState?.phase === "busy" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="rounded-2xl px-6 py-5 max-w-sm w-full text-center"
            style={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="text-sm font-bold mb-2">Bericht wird erzeugt…</div>
            <div className="text-[11px] opacity-70">{exportState.label}</div>
            {exportState.progress && exportState.progress.total > 0 && (
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.round((exportState.progress.loaded / exportState.progress.total) * 100)}%`,
                    backgroundColor: "#A78BFA",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Section + Grid wrappers ----------
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-black tracking-[3px] opacity-60 mb-2.5 px-1">{children}</div>;
}
// 2 cols on mobile (always), 3 on small tablets, 4 on tablets, 5 on desktop,
// auto-fit beyond. `auto-rows-fr` keeps cards in the same row equal height.
function CatalogGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5 sm:gap-3.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 auto-rows-fr">
      {children}
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
          <button onClick={() => onJump(i + 1)} className="active:scale-95 px-1"
            style={{ color: i === path.length - 1 ? "#A78BFA" : "#fff" }}>{f.name}</button>
        </span>
      ))}
    </div>
  );
}

// =====================================================================
// FOLDER CARD — large square image, full multi-line name
// =====================================================================
function FolderCard({ folder, onOpen, onEdit, onDelete }: {
  folder: LagerFolder; onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const img = folder.image_thumbnail || folder.image_url;
  return (
    <div
      className="relative group rounded-2xl overflow-hidden border transition-shadow active:scale-[0.98]"
      style={{
        borderColor: "#A78BFA22",
        backgroundColor: "rgba(167,139,250,0.04)",
        boxShadow: "0 0 0 1px rgba(167,139,250,0.06)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(167,139,250,0.4), 0 8px 32px -8px rgba(167,139,250,0.35)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(167,139,250,0.06)"; }}
    >
      <button onClick={onOpen} className="block w-full text-left">
        {/* Square image / placeholder */}
        <div className="relative aspect-[5/4] w-full overflow-hidden" style={{ backgroundColor: "rgba(167,139,250,0.10)" }}>
          {img ? (
            <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <FolderPlaceholder />
          )}
          {/* "Ordner" badge */}
          <span className="absolute top-1.5 left-1.5 text-[9px] font-black tracking-[2px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: "rgba(167,139,250,0.95)", color: "#0F0F0F" }}>ORDNER</span>
        </div>
        {/* Body — full multi-line name, no truncation */}
        <div className="p-2.5">
          <div className="font-black text-[12.5px] leading-tight break-words" style={{ wordBreak: "break-word" }}>{folder.name}</div>
        </div>
      </button>
      {/* ⋯ menu */}
      <button onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center bg-black/40 backdrop-blur"
        style={{ color: "#fff" }} aria-label="Menü">⋯</button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute top-9 right-1.5 z-20 bg-neutral-900 border border-white/15 rounded-xl shadow-2xl py-1 w-36">
            <button onClick={() => { setMenu(false); onEdit(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5">Bearbeiten</button>
            <button onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5" style={{ color: "#FF6B6B" }}>Löschen</button>
          </div>
        </>
      )}
    </div>
  );
}

// Pretty SVG folder placeholder (purple gradient with subtle folder shape)
function FolderPlaceholder() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lf-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="lf-folder" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7C5CFA" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#lf-bg)" />
      <g transform="translate(100 100)">
        <path
          d="M-46 -30 q-6 0 -6 6 v54 q0 8 8 8 h88 q8 0 8 -8 v-46 q0 -8 -8 -8 h-40 l-8 -10 q-2 -2 -6 -2 z"
          fill="url(#lf-folder)"
        />
        <path
          d="M-46 -8 q-6 0 -6 6 v32 q0 8 8 8 h88 q8 0 8 -8 v-32 q0 -6 -6 -6 z"
          fill="#fff" fillOpacity="0.18"
        />
      </g>
    </svg>
  );
}

// =====================================================================
// PRODUCT CARD — square image, full name, status border + glow
// =====================================================================
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

  const status = computeStock(product);
  const sst = STOCK_STYLE[status];

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
    ? `${(product.menge * product.inhalt_pro_stueck).toLocaleString("de-DE")} ${product.zweite_einheit}`
    : null;

  const img = product.image_thumbnail || product.image_url;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border transition-shadow flex flex-col"
      style={{
        borderColor: sst.ring,
        backgroundColor: "rgba(255,255,255,0.03)",
        boxShadow: sst.glow,
      }}
    >
      {/* Image — slightly less than square so card is shorter */}
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[5/4] w-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          {img ? (
            <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon d={ICONS.box} size={40} color="rgba(255,255,255,0.18)" />
            </div>
          )}
          {/* Status badge top-left */}
          {status !== "neutral" && (
            <span
              className="absolute top-1.5 left-1.5 text-[9px] font-black tracking-[2px] px-1.5 py-0.5 rounded uppercase"
              style={{ backgroundColor: sst.color, color: "#0F0F0F" }}
            >{sst.label}</span>
          )}
          {/* Warn icons row top-right */}
          {product.warn_symbols && product.warn_symbols.length > 0 && (
            <div className="absolute bottom-1.5 left-1.5 flex gap-1 max-w-[90%] flex-wrap">
              {product.warn_symbols.slice(0, 4).map((id) => <WarnIcon key={id} id={id} size={20} />)}
              {product.warn_symbols.length > 4 && (
                <span className="text-[9px] font-black px-1 py-0.5 rounded bg-black/70 text-white self-center">
                  +{product.warn_symbols.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      {/* ⋯ menu */}
      <button onClick={() => setMenu(!menu)}
        className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 backdrop-blur"
        style={{ color: "#fff" }} aria-label="Menü">⋯</button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute top-9 right-1 z-20 bg-neutral-900 border border-white/15 rounded-xl shadow-2xl py-1 w-36">
            <button onClick={() => { setMenu(false); onEdit(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5">Bearbeiten</button>
            <button onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5" style={{ color: "#FF6B6B" }}>Löschen</button>
          </div>
        </>
      )}

      {/* Body — compact */}
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        {/* LAN badge (above name) */}
        {product.lan && (
          <div className="font-mono text-[10px] font-black tracking-[1.5px] inline-block self-start px-1.5 py-0.5 rounded"
            style={{ backgroundColor: "rgba(167,139,250,0.18)", color: "#A78BFA" }}>
            {product.lan}
          </div>
        )}
        {/* Name (full, multi-line, no truncation) */}
        <button onClick={onOpen} className="text-left w-full block">
          <div className="font-black text-[12.5px] leading-tight break-words" style={{ wordBreak: "break-word" }}>{product.name}</div>
        </button>

        {/* Quantity + unit (prominent) */}
        <div>
          <div className="flex items-baseline gap-1.5 leading-none">
            {editingQty ? (
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(qtyDraft);
                  if (!isNaN(v) && v >= 0) setExact(v); else setEditingQty(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingQty(false);
                }}
                className="w-16 text-left text-xl font-black bg-black/40 border border-white/20 rounded-md py-0.5 px-1 text-white"
              />
            ) : (
              <button
                onClick={() => { setQtyDraft(String(product.menge)); setEditingQty(true); }}
                className="font-black text-xl active:opacity-70"
                style={{ color: sst.color }}
              >{product.menge}</button>
            )}
            <span className="font-bold text-[13px] opacity-90">{product.einheit}</span>
          </div>
          {total && (
            <div className="text-[11px] opacity-65 mt-0.5">≈ {total}</div>
          )}
        </div>

        {/* +/− row at the bottom */}
        <div className="flex items-center gap-1.5 mt-auto">
          <button
            onClick={() => adjust(-1)}
            disabled={busy || product.menge <= 0}
            className="flex-1 h-8 rounded-lg font-black text-base flex items-center justify-center disabled:opacity-30 active:scale-95"
            style={{ backgroundColor: "rgba(255,77,79,0.15)", color: "#FF4D4F" }}
            aria-label="weniger"
          >−</button>
          <button
            onClick={() => adjust(1)}
            disabled={busy}
            className="flex-1 h-8 rounded-lg font-black text-base flex items-center justify-center disabled:opacity-30 active:scale-95"
            style={{ backgroundColor: "rgba(0,230,118,0.18)", color: "#00E676" }}
            aria-label="mehr"
          >+</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// FOLDER EDIT MODAL — name + image picker
// =====================================================================
function FolderEditModal({ parent_id, existing, onClose, onSaved }: {
  parent_id: string | null; existing: LagerFolder | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [imageUrl, setImageUrl] = useState(existing?.image_url || "");
  const [imageThumb, setImageThumb] = useState(existing?.image_thumbnail || "");
  const [imagePid, setImagePid] = useState(existing?.image_public_id || "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickImage = async (file: File) => {
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const cfg = loadServerConfig();
      const base = (cfg?.apiBaseUrl || "/api").replace(/\/$/, "");
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`${base}/lager/folders/upload-image`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || "Upload fehlgeschlagen");
      setImageUrl(j.url); setImageThumb(j.thumbnail); setImagePid(j.public_id);
    } catch (e: any) { setErr(e?.message || "Upload fehlgeschlagen"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim()) { setErr("Name fehlt"); return; }
    setBusy(true); setErr("");
    try {
      const body: any = {
        name: name.trim(),
        image_url: imageUrl || null,
        image_thumbnail: imageThumb || null,
        image_public_id: imagePid || null,
      };
      if (existing) {
        await lagerApi(`/lager/folders/${existing.id}`, { method: "PATCH", body });
      } else {
        await lagerApi(`/lager/folders`, { method: "POST", body: { ...body, parent_id } });
      }
      onSaved();
    } catch (e: any) { setErr(e?.payload?.detail || "Fehler beim Speichern"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Ordner bearbeiten" : "Neuer Ordner"} large>
      <div className="space-y-3">
        {/* Image picker — visible upload, change, and remove actions */}
        <Field label="Ordnerbild (optional)">
          <div className="flex gap-3 items-stretch">
            <button onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-white/25 flex items-center justify-center overflow-hidden bg-black/30 shrink-0">
              {imageThumb || imageUrl
                ? <img src={imageThumb || imageUrl} alt="" className="w-full h-full object-cover" />
                : <Icon d={ICONS.folder} size={32} color="rgba(255,255,255,0.4)" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
            <div className="flex flex-col gap-1.5 flex-1 justify-center min-w-0">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 rounded-lg text-xs font-black tracking-wider border border-white/20 bg-white/5 text-white active:bg-white/10 disabled:opacity-50 text-left"
              >{uploading ? "Lädt…" : (imageUrl ? "BILD ÄNDERN" : "BILD HOCHLADEN")}</button>
              {(imageUrl || imageThumb) && (
                <button
                  onClick={() => { setImageUrl(""); setImageThumb(""); setImagePid(""); }}
                  className="px-3 py-2 rounded-lg text-xs font-black tracking-wider border text-left"
                  style={{ borderColor: "#FF6B6B66", color: "#FF6B6B", backgroundColor: "#FF6B6B14" }}
                >BILD ENTFERNEN</button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-base" autoFocus />
        </Field>
        {err && <div className="text-xs" style={{ color: "#FF6B6B" }}>{err}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
          <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl font-black disabled:opacity-50" style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}>{busy ? "…" : "Speichern"}</button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// PRODUCT EDIT MODAL
// =====================================================================
function ProductEditModal({ folder_id, existing, onClose, onSaved }: {
  folder_id: string; existing: LagerProduct | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]               = useState(existing?.name || "");
  const [lan, setLan]                 = useState(existing?.lan || "");
  const [lanBusy, setLanBusy]         = useState(false);
  const [menge, setMenge]             = useState<string>(existing ? String(existing.menge) : "0");
  const [minQty, setMinQty]           = useState<string>(existing && existing.minimum_quantity ? String(existing.minimum_quantity) : "");
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
    } catch (e: any) { setErr(e?.message || "Upload fehlgeschlagen"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim()) { setErr("Name fehlt"); return; }
    setBusy(true); setErr("");
    const body: any = {
      folder_id, name: name.trim(),
      lan: lan.trim().toUpperCase() || null,
      menge: Number(menge) || 0,
      einheit: einheit.trim() || "Stück",
      minimum_quantity: Number(minQty) || 0,
      info_text: info,
      warn_symbols: warnIds,
      image_url: imageUrl || null,
      image_thumbnail: imageThumb || null,
      image_public_id: imagePid || null,
      inhalt_pro_stueck: hasSecondary && inhalt ? Number(inhalt) : null,
      zweite_einheit: hasSecondary && zweite ? zweite.trim() : null,
    };
    try {
      if (existing) await lagerApi(`/lager/products/${existing.id}`, { method: "PATCH", body });
      else          await lagerApi(`/lager/products`, { method: "POST", body });
      onSaved();
    } catch (e: any) { setErr(e?.payload?.detail || "Fehler beim Speichern"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Produkt bearbeiten" : "Neues Produkt"} large>
      <div className="space-y-3">
        <Field label="Produktbild">
          <div className="flex gap-3 items-stretch">
            <button onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-white/25 flex items-center justify-center overflow-hidden bg-black/30 shrink-0">
              {imageThumb || imageUrl
                ? <img src={imageThumb || imageUrl} alt="" className="w-full h-full object-cover" />
                : <Icon d={ICONS.box} size={32} color="rgba(255,255,255,0.4)" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
            <div className="flex flex-col gap-1.5 flex-1 justify-center min-w-0">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 rounded-lg text-xs font-black tracking-wider border border-white/20 bg-white/5 text-white active:bg-white/10 disabled:opacity-50 text-left"
              >{uploading ? "Lädt…" : (imageUrl ? "BILD ÄNDERN" : "BILD HOCHLADEN")}</button>
              {(imageUrl || imageThumb) && (
                <button
                  onClick={() => { setImageUrl(""); setImageThumb(""); setImagePid(""); }}
                  className="px-3 py-2 rounded-lg text-xs font-black tracking-wider border text-left"
                  style={{ borderColor: "#FF6B6B66", color: "#FF6B6B", backgroundColor: "#FF6B6B14" }}
                >BILD ENTFERNEN</button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
        </Field>

        <Field label="LAN — Lager-Nummer (optional)">
          <div className="flex gap-2 items-stretch">
            <input
              value={lan}
              onChange={(e) => setLan(e.target.value.toUpperCase())}
              placeholder="z.B. BA001"
              className="input-base flex-1 font-mono tracking-wider"
            />
            <button
              type="button"
              onClick={async () => {
                // Pull a prefix out of the current value (the leading letters).
                // If empty, ask the user to type at least one letter first.
                const m = /^([A-Z]+)/.exec(lan.trim().toUpperCase());
                const prefix = m ? m[1] : "";
                if (!prefix) {
                  setErr("Bitte zuerst die Buchstaben (z.B. BB) eintippen, dann Vorschlag.");
                  return;
                }
                setLanBusy(true); setErr("");
                try {
                  const r = await lagerApi<{ suggestion: string }>(`/lager/products/suggest-lan?prefix=${encodeURIComponent(prefix)}`);
                  if (r?.suggestion) setLan(r.suggestion);
                } catch (e: any) {
                  setErr(e?.payload?.detail || "Vorschlag fehlgeschlagen");
                } finally { setLanBusy(false); }
              }}
              disabled={lanBusy}
              className="px-3 rounded-xl border-2 text-xs font-black tracking-wider whitespace-nowrap disabled:opacity-50"
              style={{ borderColor: "#A78BFA66", backgroundColor: "#A78BFA1A", color: "#A78BFA" }}
              title="Nächste freie Nummer für diesen Buchstaben-Prefix vorschlagen"
            >{lanBusy ? "…" : "VORSCHLAG"}</button>
          </div>
          <div className="text-[10px] opacity-50 mt-1 leading-snug">
            Buchstaben-Prefix + Nummer (z.B. BA001, BB014). Wird für die Sortierung im Lager und im Excel-Export verwendet. Muss eindeutig sein.
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Menge">
            <input type="number" inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} className="input-base" />
          </Field>
          <Field label="Einheit">
            <input value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="Stück" className="input-base" />
          </Field>
        </div>

        <Field label="Mindestmenge (optional)">
          <input type="number" inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="0 = keine" className="input-base" />
          <div className="text-[10px] opacity-50 mt-1">
            Wird das Produkt unter diese Menge fallen, leuchtet die Karte orange. Bei 0 oder leer rot.
          </div>
        </Field>

        <div className="rounded-xl border border-white/10 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasSecondary} onChange={(e) => setHasSecondary(e.target.checked)} />
            <span>Zweite Einheit (z.B. 1 Stück = 5 Liter)</span>
          </label>
          {hasSecondary && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="Inhalt pro Stück">
                <input type="number" inputMode="decimal" value={inhalt} onChange={(e) => setInhalt(e.target.value)} className="input-base" />
              </Field>
              <Field label="Einheit">
                <input value={zweite} onChange={(e) => setZweite(e.target.value)} placeholder="Liter" className="input-base" />
              </Field>
            </div>
          )}
        </div>

        <Field label="Produktinformationen (optional)">
          <textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={3} className="input-base resize-none py-3 h-auto" />
        </Field>

        <Field label={`Warnsymbole (${warnIds.length} ausgewählt)`}>
          <WarnPicker selected={warnIds} onChange={setWarnIds} />
        </Field>

        {err && <div className="text-xs" style={{ color: "#FF6B6B" }}>{err}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
          <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl font-black disabled:opacity-50" style={{ backgroundColor: "#A78BFA", color: "#0F0F0F" }}>{busy ? "…" : "Speichern"}</button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// PRODUCT DETAIL MODAL
// =====================================================================
function ProductDetailModal({ product, onClose, onEdit }: { product: LagerProduct; onClose: () => void; onEdit: () => void }) {
  const status = computeStock(product);
  const sst = STOCK_STYLE[status];
  return (
    <Modal onClose={onClose} title={product.name} large>
      <div className="space-y-3">
        {product.lan && (
          <div className="font-mono text-[12px] font-black tracking-[2px] inline-block px-2.5 py-1 rounded"
            style={{ backgroundColor: "rgba(167,139,250,0.18)", color: "#A78BFA" }}>
            {product.lan}
          </div>
        )}
        {(product.image_url || product.image_thumbnail) && (
          <img src={product.image_url || product.image_thumbnail || ""} alt="" className="w-full max-h-72 object-contain rounded-xl bg-black/30" />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="font-black text-3xl" style={{ color: sst.color }}>{product.menge}</span>
            <span className="opacity-70 ml-1">{product.einheit}</span>
          </div>
          {product.inhalt_pro_stueck && product.zweite_einheit && (
            <span className="opacity-50 text-xs">≈ {(product.menge * product.inhalt_pro_stueck).toLocaleString("de-DE")} {product.zweite_einheit}</span>
          )}
          {Number(product.minimum_quantity) > 0 && (
            <span className="text-xs opacity-60">Min: {product.minimum_quantity}</span>
          )}
          {status !== "neutral" && (
            <span className="ml-auto text-[10px] font-black tracking-[2px] px-2 py-1 rounded uppercase" style={{ backgroundColor: sst.color, color: "#0F0F0F" }}>{sst.label}</span>
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

// =====================================================================
// CONFIRM DELETE
// =====================================================================
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
    } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title={isFolder ? "Ordner löschen?" : "Produkt löschen?"}>
      <div className="text-sm mb-3 leading-relaxed">
        Möchten Sie <span className="font-black">„{name}"</span> wirklich löschen?
      </div>
      {err && (
        <div className="rounded-xl p-3 mb-3 border" style={{ borderColor: "#FF6B6B66", backgroundColor: "#FF6B6B14", color: "#FF6B6B" }}>{err}</div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-white/15">Abbrechen</button>
        <button onClick={doDelete} disabled={busy} className="flex-1 py-3 rounded-xl font-black" style={{ backgroundColor: "#FF6B6B", color: "#fff" }}>{busy ? "…" : "Löschen"}</button>
      </div>
    </Modal>
  );
}

// =====================================================================
// WARN PICKER
// =====================================================================
function WarnPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const groups = useMemo(() => {
    const out: Record<string, typeof WARN_SYMBOLS> = { ppe: [], ghs: [], warn: [] };
    for (const s of WARN_SYMBOLS) out[s.group].push(s);
    return out;
  }, []);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
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
                  className="rounded-xl p-2 border-2 active:scale-95 transition flex flex-col items-center gap-1"
                  style={{ borderColor: active ? "#A78BFA" : "rgba(255,255,255,0.1)", backgroundColor: active ? "#A78BFA14" : "rgba(255,255,255,0.03)" }}
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

// ---------- shared ----------
function Modal({ children, onClose, title, large }: { children: React.ReactNode; onClose: () => void; title: string; large?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${large ? "max-w-md" : "max-w-sm"} bg-neutral-950 border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto`}>
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
