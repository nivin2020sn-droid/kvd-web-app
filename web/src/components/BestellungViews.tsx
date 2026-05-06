// =====================================================================
// BESTELLUNG (Orders) — full feature set
//   - Grid 2-column home with status badges + search + status filter
//   - Detail view with status buttons (Offen / Bestellt / Geliefert / Archivieren)
//   - Monthly archive (Archiv März 2026, ...)
//   - Print + PDF monthly report (works on Android via blob fallback)
//   - Image upload via existing /api/orders/upload-image (Cloudinary)
//   - 100% German UI, mobile-first, no dependency on Tasks/Tablet
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, ICONS } from "./Icons";
import { api } from "../lib/api";
import { loadServerConfig } from "../lib/serverConfig";

// ---- Types ----
export type OrderStatus = "offen" | "bestellt" | "geliefert";
export interface Order {
  id: string;
  name: string;
  serial_number?: string;
  article_number?: string;
  quantity: number;
  purchase_link?: string;
  note?: string;
  image_url?: string;
  image_thumbnail?: string;
  image_public_id?: string;
  status: OrderStatus;
  archived?: boolean;
  archive_month?: string | null;
  created_at?: string;
  updated_at?: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  offen: "Offen",
  bestellt: "Bestellt",
  geliefert: "Geliefert",
};
const STATUS_COLOR: Record<OrderStatus, string> = {
  offen: "#FF9500",       // orange
  bestellt: "#3B82F6",    // blue
  geliefert: "#00E676",   // green
};

// ---- Helpers ----
function todayMonth(): string { return new Date().toISOString().slice(0, 7); }
function formatGermanMonth(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}
function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ---- Status pill ----
function StatusPill({ status, size = "sm" }: { status: OrderStatus; size?: "sm" | "md" }) {
  const c = STATUS_COLOR[status];
  const cls = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-black tracking-wider ${cls}`} style={{ backgroundColor: c + "1F", color: c, border: `1px solid ${c}66` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// =====================================================================
// HOME — grid 2-column
// =====================================================================
export function BestellungHome() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | OrderStatus>("alle");
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("archived", "false");
      if (filter !== "alle") params.set("status", filter);
      if (search.trim()) params.set("q", search.trim());
      const r = await api<Order[]>(`/orders?${params.toString()}`).catch(() => []);
      setOrders(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  // Debounced search
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav("/")}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm" style={{ color: "#F472B6" }}>BESTELLUNG</div>
        <button onClick={() => nav("/bestellung/archiv")} className="text-xs font-bold opacity-70 active:opacity-100 px-2 py-1">Archiv</button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen (Name · Seriennummer · Artikelnummer)"
            className="input-base pl-9"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-sm">🔍</span>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 active:opacity-100">✕</button>
          )}
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {(["alle", "offen", "bestellt", "geliefert"] as const).map((f) => {
            const active = filter === f;
            const color = f === "alle" ? "#F472B6" : STATUS_COLOR[f as OrderStatus];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="shrink-0 px-3 py-1.5 rounded-full border-2 text-[11px] font-black tracking-wider uppercase transition active:scale-95"
                style={{
                  borderColor: active ? color : "rgba(255,255,255,0.15)",
                  backgroundColor: active ? color + "22" : "transparent",
                  color: active ? color : "rgba(255,255,255,0.6)",
                }}
              >
                {f === "alle" ? "Alle" : STATUS_LABEL[f as OrderStatus]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="px-3 pb-24 flex-1">
        {loading ? (
          <div className="flex justify-center pt-12"><div className="text-sm opacity-60">Lädt...</div></div>
        ) : orders.length === 0 ? (
          <div className="text-center mt-16 space-y-2 opacity-60">
            <div className="text-5xl">📦</div>
            <div className="text-base font-bold">Keine Bestellungen</div>
            <div className="text-xs">Tippen Sie auf NEU, um die erste Bestellung anzulegen.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => nav(`/bestellung/${o.id}`)}
                className="bg-surface-card border border-surface-border rounded-xl overflow-hidden text-left active:scale-95 transition-transform"
              >
                <div className="aspect-square bg-black/20 flex items-center justify-center overflow-hidden relative">
                  {o.image_thumbnail || o.image_url ? (
                    <img src={o.image_thumbnail || o.image_url} alt={o.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-4xl opacity-40">📦</div>
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <StatusPill status={o.status} />
                  </div>
                </div>
                <div className="p-2.5 space-y-0.5">
                  <div className="font-black text-sm leading-tight line-clamp-2" style={{ minHeight: "2.4em" }}>{o.name}</div>
                  {o.quantity > 1 && (
                    <div className="text-[10px] opacity-60">Menge: <span className="font-bold">{o.quantity}</span></div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB — Neu */}
      <button
        onClick={() => nav("/bestellung/neu")}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full font-black text-2xl shadow-2xl active:scale-90 transition flex items-center justify-center"
        style={{ backgroundColor: "#F472B6", color: "#000", boxShadow: "0 8px 24px rgba(244,114,182,0.5)" }}
        aria-label="Neue Bestellung"
      >
        +
      </button>
    </div>
  );
}

// =====================================================================
// CREATE / EDIT (re-uses the same component)
// =====================================================================
export function BestellungEdit() {
  const nav = useNavigate();
  const params = useParams();
  const isEdit = !!params.id && params.id !== "neu";
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [article, setArticle] = useState("");
  const [qty, setQty] = useState(1);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgThumb, setImgThumb] = useState("");
  const [imgPid, setImgPid] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      if (isEdit && params.id) {
        try {
          const o = await api<Order>(`/orders/${params.id}`);
          setName(o.name); setSerial(o.serial_number || ""); setArticle(o.article_number || "");
          setQty(o.quantity || 1); setLink(o.purchase_link || ""); setNote(o.note || "");
          setImgUrl(o.image_url || ""); setImgThumb(o.image_thumbnail || ""); setImgPid(o.image_public_id || "");
        } catch (e: any) { setErr(e?.message || "Fehler beim Laden"); }
      }
    })();
  }, [isEdit, params.id]);

  const pickImage = () => fileRef.current?.click();
  const onFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f, f.name || "bild.jpg");
      const cfg = loadServerConfig();
      const base = (cfg?.apiBaseUrl || "/api").replace(/\/$/, "");
      const r = await fetch(`${base}/orders/upload-image`, { method: "POST", body: fd });
      if (!r.ok) {
        let detail = `${r.status}`;
        try { const j = await r.json(); if (j?.detail) detail = j.detail; } catch {}
        throw new Error(detail);
      }
      const j = await r.json();
      setImgUrl(j.url); setImgThumb(j.thumbnail); setImgPid(j.public_id);
    } catch (e: any) { setErr("Upload fehlgeschlagen: " + (e?.message || "")); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!name.trim()) { setErr("Name ist Pflicht."); return; }
    setSaving(true); setErr("");
    try {
      const body = {
        name: name.trim(),
        serial_number: serial.trim(),
        article_number: article.trim(),
        quantity: Math.max(1, qty | 0),
        purchase_link: link.trim(),
        note: note.trim(),
        image_url: imgUrl, image_thumbnail: imgThumb, image_public_id: imgPid,
      };
      if (isEdit && params.id) {
        await api(`/orders/${params.id}`, { method: "PUT", auth: true, body });
        nav(`/bestellung/${params.id}`);
      } else {
        const o = await api<Order>("/orders", { method: "POST", auth: true, body });
        nav(`/bestellung/${o.id}`);
      }
    } catch (e: any) { setErr(e?.message || "Fehler"); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{isEdit ? "BESTELLUNG BEARBEITEN" : "NEUE BESTELLUNG"}</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-4 pb-24">
        {err && <div className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-red-300 text-xs">{err}</div>}

        {/* Image */}
        <div>
          <label className="section-label">Produktbild</label>
          <div className="mt-2">
            {imgUrl ? (
              <div className="relative">
                <img src={imgThumb || imgUrl} alt="" className="w-full aspect-square object-cover rounded-xl" />
                <button onClick={pickImage} className="absolute bottom-2 right-2 px-3 py-1.5 rounded-md bg-black/70 text-white text-xs font-bold border border-white/20">Ändern</button>
              </div>
            ) : (
              <button onClick={pickImage} disabled={uploading} className="w-full aspect-square rounded-xl border-2 border-dashed border-white/15 bg-white/5 flex flex-col items-center justify-center gap-2 active:opacity-80">
                <span className="text-5xl">{uploading ? "⏫" : "📷"}</span>
                <span className="text-sm font-bold opacity-70">{uploading ? "Lädt hoch…" : "Bild hochladen"}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
          </div>
        </div>

        <div>
          <label className="section-label">Produktname *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Wischmop Profi" className="input-base mt-2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-label">Seriennummer</label>
            <input value={serial} onChange={(e) => setSerial(e.target.value)} className="input-base mt-2" />
          </div>
          <div>
            <label className="section-label">Artikelnummer</label>
            <input value={article} onChange={(e) => setArticle(e.target.value)} className="input-base mt-2" />
          </div>
        </div>
        <div>
          <label className="section-label">Menge</label>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)} className="input-base mt-2" />
        </div>
        <div>
          <label className="section-label">Einkaufslink</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="input-base mt-2" />
        </div>
        <div>
          <label className="section-label">Notiz</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-base h-24 py-3 mt-2 resize-none" />
        </div>
      </div>
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-surface-bg border-t border-surface-border" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
        <button
          onClick={submit}
          disabled={saving || uploading}
          className="w-full h-12 rounded-xl font-black tracking-wide active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "#F472B6", color: "#000" }}
        >
          {saving ? "Speichert…" : isEdit ? "Speichern" : "Bestellung anlegen"}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// DETAIL VIEW (full info + status buttons)
// =====================================================================
export function BestellungDetail() {
  const nav = useNavigate();
  const params = useParams();
  const [o, setO] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const load = async () => {
    if (!params.id) return;
    try { setO(await api<Order>(`/orders/${params.id}`)); }
    catch (e: any) { setErr(e?.message || "Fehler"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.id]);

  const setStatus = async (s: OrderStatus) => {
    if (!o) return;
    setBusy("status");
    try {
      const r = await api<Order>(`/orders/${o.id}/status`, { method: "PATCH", auth: true, body: { status: s } });
      setO(r);
    } catch (e: any) { setErr(e?.message || "Fehler"); }
    finally { setBusy(""); }
  };
  const archive = async () => {
    if (!o || !confirm(`Bestellung „${o.name}" archivieren?\n\nSie wird in das Archiv des aktuellen Monats verschoben.`)) return;
    setBusy("archive");
    try {
      const r = await api<{ archived_to_month: string }>(`/orders/${o.id}/archive`, { method: "POST", auth: true, body: { month: todayMonth() } });
      alert(`Archiviert in: ${formatGermanMonth(r.archived_to_month)}`);
      nav("/bestellung");
    } catch (e: any) { setErr(e?.message || "Fehler"); setBusy(""); }
  };
  const delForever = async () => {
    if (!o || !confirm("Bestellung ENDGÜLTIG löschen?")) return;
    setBusy("del");
    try {
      await api(`/orders/${o.id}`, { method: "DELETE", auth: true });
      nav("/bestellung");
    } catch (e: any) { setErr(e?.message || "Fehler"); setBusy(""); }
  };
  const restore = async () => {
    if (!o) return;
    setBusy("restore");
    try {
      const r = await api<{ order: Order }>(`/orders/${o.id}/restore`, { method: "POST", auth: true });
      setO(r.order);
    } catch (e: any) { setErr(e?.message || "Fehler"); }
    finally { setBusy(""); }
  };

  if (!o) return (
    <div className="min-h-full flex items-center justify-center">
      {err ? <div className="text-red-400">{err}</div> : <div className="opacity-60">Lädt…</div>}
    </div>
  );

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm" style={{ color: "#F472B6" }}>BESTELLUNG</div>
        <button onClick={() => nav(`/bestellung/edit/${o.id}`)} className="px-2 py-1 text-xs font-bold opacity-70 active:opacity-100">Bearbeiten</button>
      </div>
      <div className="p-4 space-y-4 pb-32">
        {err && <div className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-red-300 text-xs">{err}</div>}

        {/* Image */}
        {(o.image_url || o.image_thumbnail) && (
          <div className="rounded-2xl overflow-hidden bg-black/20">
            <img src={o.image_url || o.image_thumbnail} alt={o.name} className="w-full aspect-square object-cover" />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-2xl font-black leading-tight">{o.name}</div>
          <div className="flex flex-wrap gap-2 items-center">
            <StatusPill status={o.status} size="md" />
            {o.archived && o.archive_month && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 border border-white/20">
                Archiv: {formatGermanMonth(o.archive_month)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Seriennummer" value={o.serial_number || "—"} />
          <Field label="Artikelnummer" value={o.article_number || "—"} />
          <Field label="Menge" value={String(o.quantity)} />
          <Field label="Status" value={STATUS_LABEL[o.status]} color={STATUS_COLOR[o.status]} />
        </div>

        {o.purchase_link && (
          <div>
            <div className="section-label">Einkaufslink</div>
            <a
              href={o.purchase_link}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 rounded-lg border border-brand-blue/60 bg-blue-500/10 text-brand-blue px-3 py-2.5 text-sm font-bold truncate active:opacity-80"
            >
              🔗 {o.purchase_link}
            </a>
          </div>
        )}

        {o.note && (
          <div>
            <div className="section-label">Notiz</div>
            <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
              {o.note}
            </div>
          </div>
        )}

        {/* Status buttons */}
        {!o.archived && (
          <div>
            <div className="section-label">Status setzen</div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(["offen", "bestellt", "geliefert"] as OrderStatus[]).map((s) => {
                const active = o.status === s;
                const c = STATUS_COLOR[s];
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={busy !== ""}
                    className="h-12 rounded-xl border-2 font-black text-xs tracking-wider uppercase active:scale-95 disabled:opacity-50 transition"
                    style={active
                      ? { borderColor: c, backgroundColor: c, color: "#000" }
                      : { borderColor: c + "66", backgroundColor: c + "15", color: c }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {!o.archived ? (
            <button onClick={archive} disabled={busy !== ""} className="h-12 rounded-xl border-2 border-brand-orange/70 bg-orange-500/15 text-brand-orange font-black tracking-wider text-xs active:scale-95 disabled:opacity-50">
              📁 ARCHIVIEREN
            </button>
          ) : (
            <button onClick={restore} disabled={busy !== ""} className="h-12 rounded-xl border-2 font-black tracking-wider text-xs active:scale-95 disabled:opacity-50" style={{ borderColor: "#06B6D4", backgroundColor: "#06B6D415", color: "#06B6D4" }}>
              🔄 ZURÜCKHOLEN
            </button>
          )}
          <button onClick={delForever} disabled={busy !== ""} className="h-12 rounded-xl border-2 border-brand-red/70 bg-red-500/15 text-brand-red font-black tracking-wider text-xs active:scale-95 disabled:opacity-50">
            🗑 LÖSCHEN
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] font-bold tracking-widest uppercase opacity-60">{label}</div>
      <div className="text-sm font-extrabold mt-0.5 truncate" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

// =====================================================================
// ARCHIVE — list of months
// =====================================================================
export function BestellungArchive() {
  const nav = useNavigate();
  const [months, setMonths] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setMonths(await api<{ month: string; count: number }[]>("/orders/archive/months")); }
      catch {} finally { setLoading(false); }
    })();
  }, []);
  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav("/bestellung")}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">BESTELLUNG · ARCHIV</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-2 flex-1">
        {loading ? (
          <div className="text-center mt-12 opacity-60">Lädt…</div>
        ) : months.length === 0 ? (
          <div className="text-center mt-16 space-y-2 opacity-60">
            <div className="text-5xl">📁</div>
            <div className="font-bold">Keine archivierten Bestellungen</div>
          </div>
        ) : months.map((m) => (
          <button
            key={m.month}
            onClick={() => nav(`/bestellung/archiv/${m.month}`)}
            className="w-full bg-surface-card border border-surface-border px-4 py-4 flex items-center gap-3 rounded-xl active:scale-95 transition"
          >
            <Icon d={ICONS.calendar} size={20} color="#F472B6" />
            <div className="flex-1 text-left">
              <div className="font-black tracking-wide">{formatGermanMonth(m.month)}</div>
              <div className="text-xs opacity-60">{m.count} Bestellung{m.count === 1 ? "" : "en"}</div>
            </div>
            <Icon d={ICONS.chevronRight} size={18} color="#71717a" />
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// ARCHIVE MONTH — list + print + PDF
// =====================================================================
export function BestellungArchiveMonth() {
  const nav = useNavigate();
  const params = useParams();
  const month = params.month || "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api<Order[]>(`/orders?archived=true&month=${encodeURIComponent(month)}`);
      setOrders(Array.isArray(r) ? r : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const grouped = useMemo(() => {
    const g: Record<OrderStatus, Order[]> = { offen: [], bestellt: [], geliefert: [] };
    for (const o of orders) {
      if (g[o.status]) g[o.status].push(o);
    }
    return g;
  }, [orders]);

  const printReport = () => generateMonthlyReport(month, orders, "print");
  const pdfReport = () => generateMonthlyReport(month, orders, "pdf");

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav("/bestellung/archiv")}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{formatGermanMonth(month)}</div>
        <div className="w-7" />
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <button onClick={printReport} className="h-11 rounded-lg border-2 border-brand-blue/70 bg-blue-500/15 text-brand-blue font-black text-xs tracking-wide active:scale-95 flex items-center justify-center gap-1.5">
          <Icon d={ICONS.print} size={14} color="#3B82F6" /> Drucken
        </button>
        <button onClick={pdfReport} className="h-11 rounded-lg border-2 border-brand-green/70 bg-brand-green/15 text-brand-green font-black text-xs tracking-wide active:scale-95 flex items-center justify-center gap-1.5">
          <Icon d={ICONS.pdf} size={14} color="#00E676" /> PDF
        </button>
      </div>
      <div className="px-3 pb-10 space-y-4 flex-1">
        {loading ? <div className="text-center mt-12 opacity-60">Lädt…</div> : (
          <>
            {(["offen", "bestellt", "geliefert"] as OrderStatus[]).map((s) => {
              if (!grouped[s].length) return null;
              const c = STATUS_COLOR[s];
              return (
                <div key={s}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                    <div className="text-xs font-black tracking-widest uppercase" style={{ color: c }}>{STATUS_LABEL[s]} · {grouped[s].length}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {grouped[s].map((o) => (
                      <button key={o.id} onClick={() => nav(`/bestellung/${o.id}`)} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden text-left active:scale-95">
                        <div className="aspect-square bg-black/20 flex items-center justify-center overflow-hidden">
                          {(o.image_thumbnail || o.image_url) ? (
                            <img src={o.image_thumbnail || o.image_url} alt={o.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : <div className="text-3xl opacity-40">📦</div>}
                        </div>
                        <div className="p-2 text-xs font-black line-clamp-2" style={{ minHeight: "2.4em" }}>{o.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && (
              <div className="text-center mt-12 opacity-60">Keine Bestellungen in diesem Monat</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Monthly report — Print + PDF (Android-friendly via blob fallback)
// =====================================================================
function buildReportHtml(month: string, orders: Order[]): string {
  const grouped: Record<OrderStatus, Order[]> = { offen: [], bestellt: [], geliefert: [] };
  for (const o of orders) if (grouped[o.status]) grouped[o.status].push(o);
  const sectionHtml = (s: OrderStatus) => {
    if (!grouped[s].length) return "";
    return `<section class="block">
      <h2 style="border-left:6px solid ${STATUS_COLOR[s]};padding:6px 12px;background:${STATUS_COLOR[s]}11;font-size:14pt;margin:18px 0 10px;color:#111;">
        ${STATUS_LABEL[s]} · ${grouped[s].length}
      </h2>
      ${grouped[s].map((o) => `
        <div class="row">
          <div class="img-cell">${o.image_url || o.image_thumbnail
            ? `<img src="${escapeHtml(o.image_url || o.image_thumbnail || "")}" />`
            : `<div class="ph">📦</div>`}</div>
          <div class="info">
            <div class="name">${escapeHtml(o.name)}</div>
            <div class="meta">
              ${o.serial_number ? `<span><b>S/N:</b> ${escapeHtml(o.serial_number)}</span>` : ""}
              ${o.article_number ? `<span><b>Art.-Nr.:</b> ${escapeHtml(o.article_number)}</span>` : ""}
              <span><b>Menge:</b> ${o.quantity}</span>
            </div>
            ${o.note ? `<div class="note"><b>Notiz:</b> ${escapeHtml(o.note)}</div>` : ""}
          </div>
        </div>`).join("")}
    </section>`;
  };
  return `<!doctype html><html lang="de"><head><meta charset="utf-8" />
<title>Bestellungen ${formatGermanMonth(month)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font-family: system-ui, Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: 1pt; }
  .meta-top { color: #555; font-size: 10pt; margin-bottom: 14pt; }
  .row { display: flex; gap: 12px; padding: 10pt 0; border-bottom: 1px solid #e5e5e5; page-break-inside: avoid; }
  .img-cell { width: 90pt; height: 90pt; flex-shrink: 0; background: #f3f3f3; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6pt; }
  .img-cell img { width: 100%; height: 100%; object-fit: cover; }
  .ph { font-size: 36pt; opacity: .4; }
  .info { flex: 1; min-width: 0; }
  .name { font-weight: 800; font-size: 13pt; margin-bottom: 4pt; }
  .meta { color: #444; font-size: 10pt; display: flex; flex-wrap: wrap; gap: 12pt; margin-bottom: 4pt; }
  .note { font-size: 10pt; color: #444; font-style: italic; margin-top: 4pt; }
  .totals { display: flex; gap: 18pt; margin-top: 4pt; font-size: 10pt; }
  .totals span b { color: #111; }
  .block { page-break-inside: avoid; }
</style></head>
<body>
  <h1>Bestellungen · ${formatGermanMonth(month)}</h1>
  <div class="meta-top">
    Gesamt: <b>${orders.length}</b> Bestellung${orders.length === 1 ? "" : "en"} · 
    Erstellt am: ${new Date().toLocaleDateString("de-DE")}
  </div>
  <div class="totals">
    <span style="color:${STATUS_COLOR.offen}"><b>Offen:</b> ${grouped.offen.length}</span>
    <span style="color:${STATUS_COLOR.bestellt}"><b>Bestellt:</b> ${grouped.bestellt.length}</span>
    <span style="color:${STATUS_COLOR.geliefert}"><b>Geliefert:</b> ${grouped.geliefert.length}</span>
  </div>
  ${sectionHtml("offen")}
  ${sectionHtml("bestellt")}
  ${sectionHtml("geliefert")}
  ${orders.length === 0 ? `<p style="margin-top:24pt;color:#888;">Keine Bestellungen in diesem Monat.</p>` : ""}
</body></html>`;
}

function generateMonthlyReport(month: string, orders: Order[], mode: "print" | "pdf") {
  const html = buildReportHtml(month, orders);
  if (mode === "print") {
    // Open in a new window and trigger print. Fallback to blob if popups blocked.
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (w) {
      w.document.open(); w.document.write(html); w.document.close();
      const tryPrint = () => { try { w.focus(); w.print(); } catch {} };
      if (w.document.readyState === "complete") setTimeout(tryPrint, 400);
      else w.addEventListener("load", () => setTimeout(tryPrint, 400));
      return;
    }
    // Fallback: blob link (Android Chrome / WebView)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  // PDF mode — use jsPDF + html2canvas if available; else fall back to print which lets the user "Save as PDF".
  // To keep this lightweight and reliable, we use the browser's "Save as PDF" via print dialog as the main path.
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (w) {
    w.document.open(); w.document.write(html); w.document.close();
    const tryPrint = () => { try { w.focus(); w.print(); } catch {} };
    if (w.document.readyState === "complete") setTimeout(tryPrint, 400);
    else w.addEventListener("load", () => setTimeout(tryPrint, 400));
  } else {
    // Direct download HTML as a "report" (browser will open it; user can save as PDF)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Bestellungen_${month}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
