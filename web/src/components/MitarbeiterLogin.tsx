// =====================================================================
// MITARBEITER LOGIN — Tablet: shows list of Mitarbeiter, asks for PIN,
// then routes to /tablet?as=<id> where Tablet filters tasks by person_ids.
//
// Flow:
//   /tablet         → MitarbeiterLogin (this component)
//   click name      → PIN modal
//   correct PIN     → sessionStorage.setItem('current_mitarbeiter', { id, name })
//                     navigate("/tablet?as=" + id)
//   wrong PIN       → "Falscher Code"
//   no PIN set      → backend allows direct login
// =====================================================================
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, ICONS } from "./Icons";
import { api } from "../lib/api";
import { loadServerConfig } from "../lib/serverConfig";

interface Person { id: string; name: string; has_pin?: boolean }
interface CurrentMitarbeiter { id: string; name: string }

const MITARBEITER_KEY = "current_mitarbeiter";

// ---- Reactive storage: every component that needs to know "is a Mitarbeiter
// logged in?" can subscribe and gets a re-render the very moment the value
// changes — without a full page reload. ----
type Subscriber = (m: CurrentMitarbeiter | null) => void;
const subscribers: Set<Subscriber> = new Set();
function notifySubscribers(m: CurrentMitarbeiter | null) {
  subscribers.forEach((fn) => {
    try { fn(m); } catch {}
  });
  // Sync between tabs (storage events fire only in OTHER tabs, so we also
  // dispatch our own 'mitarbeiter-changed' event for same-tab listeners).
  try {
    window.dispatchEvent(new CustomEvent("mitarbeiter-changed", { detail: m }));
  } catch {}
}
export function subscribeMitarbeiter(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function getCurrentMitarbeiter(): CurrentMitarbeiter | null {
  try {
    const raw = sessionStorage.getItem(MITARBEITER_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j.id === "string" && typeof j.name === "string") return j;
  } catch {}
  return null;
}
export function setCurrentMitarbeiter(m: CurrentMitarbeiter | null): void {
  try {
    if (m) {
      sessionStorage.setItem(MITARBEITER_KEY, JSON.stringify(m));
    } else {
      // Full cleanup — make sure no stale session lingers across tabs/storages.
      sessionStorage.removeItem(MITARBEITER_KEY);
      try { localStorage.removeItem(MITARBEITER_KEY); } catch {}
    }
  } catch {}
  // Notify React listeners immediately so any TabletGate / banner re-renders
  // in the same tick — no page reload needed.
  notifySubscribers(m);
}

/** Clear ALL Mitarbeiter session data (sessionStorage + localStorage + state).
 *  Used by the "Wechseln / Abmelden" button so the next /tablet visit always
 *  shows the "Wer arbeitet?" picker. */
export function clearMitarbeiterSession(): void {
  try { sessionStorage.removeItem(MITARBEITER_KEY); } catch {}
  try { localStorage.removeItem(MITARBEITER_KEY); } catch {}
  // Belt-and-braces: also remove any legacy keys that earlier versions of
  // the app might have written.
  try {
    for (const k of ["mitarbeiter_id", "mitarbeiter_name", "employee_session", "employeeMode"]) {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    }
  } catch {}
  notifySubscribers(null);
}

export function MitarbeiterLogin() {
  const nav = useNavigate();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pinRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try { setPersons(await api<Person[]>("/persons")); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (selected) {
      setPin(""); setErr("");
      setTimeout(() => pinRef.current?.focus(), 80);
    }
  }, [selected]);

  const submitPin = async (forcePin?: string) => {
    if (!selected) return;
    const code = (forcePin !== undefined ? forcePin : pin).trim();
    setSubmitting(true); setErr("");
    try {
      // Direct fetch (api() throws on 401, which we want to catch with our own message)
      const cfg = loadServerConfig();
      const base = (cfg?.apiBaseUrl || "/api").replace(/\/$/, "");
      const r = await fetch(`${base}/persons/${selected.id}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setErr(j?.detail || "Falscher Code");
        setPin("");
        setTimeout(() => pinRef.current?.focus(), 50);
        return;
      }
      // SUCCESS — apply state changes synchronously so the UI flips to Tablet
      // immediately (no page reload, no "ghost login" requiring a refresh).
      // Order matters: clear local modal state first, then commit the
      // Mitarbeiter session — which fires the subscriber that re-renders
      // TabletGate from <MitarbeiterLogin/> to <Tablet/> in the SAME tick.
      const me = { id: selected.id, name: selected.name };
      setSelected(null);
      setPin("");
      setErr("");
      setSubmitting(false);
      setCurrentMitarbeiter(me);
      // Navigate (route stays /tablet, just adds ?as=<id> for traceability).
      nav(`/tablet?as=${encodeURIComponent(me.id)}`, { replace: true });
      return;
    } catch (e: any) {
      setErr("Verbindungsfehler: " + (e?.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const onPinChange = (v: string) => {
    const cleaned = v.replace(/\D/g, "").slice(0, 4);
    setPin(cleaned);
    setErr("");
    if (cleaned.length === 4 && selected?.has_pin) {
      // Auto-submit when 4 digits entered for persons with PINs
      setTimeout(() => submitPin(cleaned), 80);
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav("/")}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm" style={{ color: "#00E676" }}>MITARBEITER</div>
        <div className="w-7" />
      </div>

      <div className="flex-1 p-4">
        <div className="text-center mb-5 space-y-1">
          <div className="text-2xl font-black tracking-[2px]">Wer arbeitet?</div>
          <div className="text-xs opacity-60">Bitte tippen Sie auf Ihren Namen</div>
        </div>

        {loading ? (
          <div className="text-center mt-12 opacity-60">Lädt…</div>
        ) : persons.length === 0 ? (
          <div className="text-center mt-16 space-y-2 opacity-60">
            <div className="text-5xl">👥</div>
            <div className="font-bold">Keine Mitarbeiter angelegt</div>
            <div className="text-xs">Der Chef muss zuerst Mitarbeiter mit PIN anlegen.</div>
          </div>
        ) : (
          <div className="space-y-2.5 max-w-md mx-auto">
            {persons.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full px-5 py-4 rounded-xl border-2 border-surface-border bg-surface-card text-left active:scale-95 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-base" style={{ backgroundColor: "#00E67622", color: "#00E676" }}>
                  {(p.name || "?").trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-base truncate">{p.name}</div>
                  <div className="text-[10px] opacity-50 mt-0.5 tracking-wider uppercase">
                    {p.has_pin ? "🔒 PIN erforderlich" : "Kein PIN gesetzt"}
                  </div>
                </div>
                <span className="opacity-50">›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PIN modal */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ backgroundColor: "rgba(24,24,28,0.98)", border: "2px solid #00E676" }}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg" style={{ backgroundColor: "#00E67622", color: "#00E676" }}>
                {(selected.name || "?").trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold tracking-widest uppercase opacity-60">Anmelden als</div>
                <div className="text-lg font-black truncate">{selected.name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="opacity-60 hover:opacity-100 px-2 py-1">✕</button>
            </div>

            {selected.has_pin ? (
              <>
                <div className="text-xs opacity-70">Bitte 4-stelligen Code eingeben</div>
                <input
                  ref={pinRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={4}
                  autoFocus
                  value={pin}
                  onChange={(e) => onPinChange(e.target.value)}
                  className="w-full text-center text-3xl font-mono tracking-[12px] py-3 rounded-xl border-2 border-white/15 bg-white/5 outline-none focus:border-brand-green"
                  placeholder="• • • •"
                />
                {err && <div className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-red-300 text-sm font-bold text-center">⚠ {err}</div>}
                <button
                  onClick={() => submitPin()}
                  disabled={submitting || pin.length !== 4}
                  className="w-full h-12 rounded-xl font-black tracking-wide active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: "#00E676", color: "#000" }}
                >
                  {submitting ? "Prüft…" : "Anmelden"}
                </button>
              </>
            ) : (
              <>
                <div className="text-xs opacity-70">
                  Für diesen Mitarbeiter ist kein PIN gesetzt. Sie können sich direkt anmelden.
                </div>
                {err && <div className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-red-300 text-sm font-bold text-center">⚠ {err}</div>}
                <button
                  onClick={() => submitPin("")}
                  disabled={submitting}
                  className="w-full h-12 rounded-xl font-black tracking-wide active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: "#00E676", color: "#000" }}
                >
                  {submitting ? "Anmelden…" : "Anmelden"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
