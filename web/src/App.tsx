import { useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Icon, ICONS } from "./components/Icons";
import { api, setToken } from "./lib/api";
import { useWebSocket } from "./lib/useWebSocket";
import { loadServerConfig, saveServerConfig, clearServerConfig, getServerConfigSync, subscribeServerConfig, DEFAULT_SERVER } from "./lib/serverConfig";
import { initLocalStore } from "./lib/localStore";
import { STATUS_LABEL, STATUS_DOT, PRESET_BG, isDarkBg, APP_VERSION } from "./lib/types";
import type { SimpleItem, Task, AppSettings, TaskStatus } from "./lib/types";
import {
  getWorkflow,
  recordEvent,
  fetchAllWorkflows,
  saveWorkflow,
  totalWorkMs,
  totalPauseMs,
  formatDuration,
  formatTime,
  formatDateTime,
  EVENT_LABEL,
  EVENT_COLOR,
  STATUS_LABEL_DE,
  STATUS_COLOR,
  allowedActions,
  buildDailyBreakdown,
  eventDisplayTime,
  eventDisplayDate,
} from "./lib/workflow";
import type { EventType, TaskWorkflow, WorkflowStatus, WorkflowEvent, DaySection } from "./lib/workflow";
import { adminCorrectTimes, adminUndoFinish, addTimelineEntry } from "./lib/workflow";
import { printTaskReport } from "./lib/printReport";
import { downloadTaskPdf } from "./lib/pdfReport";
import { MediaModal } from "./components/MediaModal";
import {
  BestellungHome, BestellungEdit, BestellungDetail,
  BestellungArchive, BestellungArchiveMonth,
} from "./components/BestellungViews";
import { installOfflineSync } from "./lib/photos";
import { useAdminName, setAdminName } from "./lib/adminName";
import { useAdminTheme, setAdminTheme, resolveBg, isDark as isDarkHex } from "./lib/adminTheme";
import type { ThemeMode } from "./lib/adminTheme";

// ============ App root ============
export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    try {
      initLocalStore();
      // App startet standardmäßig im Offline-Modus.
      // Server kann später unter Admin -> Server eingerichtet werden.
    } catch {}
    setReady(true);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return <div className="h-full flex items-center justify-center"><Spin /></div>;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminHome />} />
      <Route path="/admin/create" element={<AdminCreate />} />
      <Route path="/admin/edit/:id" element={<AdminCreate />} />
      <Route path="/admin/manage" element={<AdminManage />} />
      <Route path="/admin/settings" element={<AdminSettings />} />
      <Route path="/admin/server" element={<AdminServer />} />
      <Route path="/tablet" element={<Tablet />} />
      <Route path="/lager" element={<ComingSoonPage title="LAGER" subtitle="Bestände · Material · Verbrauch" iconKey="box" color="#A78BFA" />} />
      <Route path="/bestellung" element={<BestellungHome />} />
      <Route path="/bestellung/neu" element={<BestellungEdit />} />
      <Route path="/bestellung/edit/:id" element={<BestellungEdit />} />
      <Route path="/bestellung/archiv" element={<BestellungArchive />} />
      <Route path="/bestellung/archiv/:month" element={<BestellungArchiveMonth />} />
      <Route path="/bestellung/:id" element={<BestellungDetail />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

const Spin = () => <div className="w-8 h-8 border-4 border-brand-yellow border-t-transparent rounded-full animate-spin" />;

// ============ Landing ============
function Landing() {
  const nav = useNavigate();
  // 4-section grid: CHEF · MITARBEITER · LAGER · BESTELLUNG.
  // Note: The CHEF tile always shows "CHEF" on the landing page (the
  // customisable display-name lives inside the admin header, not here).
  const sections: { key: string; title: string; subtitle: string; iconKey: keyof typeof ICONS; color: string; onPress: () => void }[] = [
    {
      key: "chef",
      title: "CHEF",
      subtitle: "Aufgaben verwalten",
      iconKey: "user",
      color: "#FFD600",
      onPress: () => nav("/admin/login"),
    },
    {
      key: "mitarbeiter",
      title: "MITARBEITER",
      subtitle: "Aufgaben heute",
      iconKey: "users",
      color: "#00E676",
      onPress: () => nav("/tablet"),
    },
    {
      key: "lager",
      title: "LAGER",
      subtitle: "Bestände · Material",
      iconKey: "box",
      color: "#A78BFA",
      onPress: () => nav("/lager"),
    },
    {
      key: "bestellung",
      title: "BESTELLUNG",
      subtitle: "Anfragen · Lieferanten",
      iconKey: "cart",
      color: "#F472B6",
      onPress: () => nav("/bestellung"),
    },
  ];
  return (
    <div className="min-h-full p-5 sm:p-6 flex flex-col">
      <div className="mt-6 sm:mt-10 mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-[2px]">REINIGUNG</h1>
        <p className="text-white/50 text-xs sm:text-sm tracking-[4px] mt-2 uppercase">Aufgabenverwaltung</p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-3 sm:gap-5 content-start">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={s.onPress}
            className="aspect-square sm:aspect-[4/3] bg-surface-card border-2 rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center gap-2 sm:gap-3 active:scale-95 transition-transform"
            style={{ borderColor: s.color + "66", backgroundColor: s.color + "0D" }}
          >
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: s.color + "1F", border: `1px solid ${s.color}55` }}
            >
              <Icon d={ICONS[s.iconKey]} size={36} color={s.color} />
            </div>
            <div className="text-center">
              <div className="text-white font-black text-base sm:text-xl tracking-[2px] uppercase truncate">{s.title}</div>
              <div className="text-white/50 text-[10px] sm:text-xs tracking-wider mt-0.5 truncate">{s.subtitle}</div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-white/40 text-center text-[10px] sm:text-xs tracking-[3px] uppercase mt-6 sm:mt-8">Bereich wählen</p>
    </div>
  );
}

// ============ Coming Soon Placeholder ============
function ComingSoonPage({ title, subtitle, iconKey, color }: {
  title: string;
  subtitle?: string;
  iconKey: keyof typeof ICONS;
  color: string;
}) {
  const nav = useNavigate();
  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav("/")}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{title}</div>
        <div className="w-7" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
        <div
          className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl flex items-center justify-center"
          style={{ backgroundColor: color + "1F", border: `2px solid ${color}55` }}
        >
          <Icon d={ICONS[iconKey]} size={64} color={color} />
        </div>
        <div className="text-center space-y-1.5">
          <div className="text-2xl sm:text-3xl font-black tracking-[3px] uppercase" style={{ color }}>{title}</div>
          {subtitle && <div className="text-white/50 text-xs tracking-wider">{subtitle}</div>}
        </div>
        <div
          className="rounded-full px-5 py-2 border-2 mt-2"
          style={{ borderColor: color + "88", backgroundColor: color + "1A", color }}
        >
          <div className="text-sm font-black tracking-[2px]">Bald verfügbar</div>
        </div>
        <div className="text-white/40 text-xs text-center max-w-xs leading-relaxed mt-2">
          Dieser Bereich wird in Kürze freigeschaltet. Sie werden informiert, sobald er bereit ist.
        </div>
      </div>
    </div>
  );
}

// ============ Admin Login ============
function AdminLogin() {
  const nav = useNavigate();
  const adminName = useAdminName();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [serverProblem, setServerProblem] = useState(false);
  const cfg = getServerConfigSync() || loadServerConfig();
  const submit = async () => {
    if (!password) return;
    setLoading(true); setErr(""); setServerProblem(false);
    try {
      const r = await api<{ token: string }>("/admin/login", { method: "POST", body: { password } });
      setToken(r.token);
      nav("/admin");
    } catch (e: any) {
      // 401 = wrong password. Anything else = server is unreachable / incompatible
      if (e?.status === 401) {
        setErr("Falsches Passwort");
      } else {
        setErr("Server nicht erreichbar oder inkompatibel.");
        setServerProblem(true);
      }
    } finally { setLoading(false); }
  };
  const switchToOffline = () => {
    clearServerConfig();
    setErr(""); setServerProblem(false);
    // try login again automatically with same password
    if (password) submit();
  };
  return (
    <div className="min-h-full p-6">
      <button onClick={() => nav(-1)} className="mt-2 p-1"><Icon d={ICONS.back} size={28} /></button>
      <div className="mt-10">
        <Icon d={ICONS.lock} size={40} color="#FFD600" />
        <h1 className="text-3xl font-black tracking-[2px] mt-3 uppercase truncate max-w-full">{adminName} BEREICH</h1>
        <p className="text-white/50">Bitte Passwort eingeben</p>
        {cfg ? (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
            <span className="text-white/50 truncate">Server: {cfg.baseUrl}</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
            <span className="text-brand-orange">Offline-Modus · Lokale Daten</span>
          </div>
        )}
      </div>
      <div className="mt-10 space-y-3">
        <label className="section-label">Passwort</label>
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••" className="input-base" />
        {err && <p className="text-brand-red text-sm">{err}</p>}
        {serverProblem && (
          <div className="border border-brand-orange/60 bg-orange-500/10 rounded-xl p-3 space-y-2">
            <p className="text-brand-orange text-xs font-bold">
              Der konfigurierte Server antwortet nicht oder ist inkompatibel.
            </p>
            <div className="flex gap-2">
              <button onClick={switchToOffline} className="flex-1 h-11 bg-brand-yellow text-black rounded-lg font-black text-xs tracking-wide">
                OFFLINE-MODUS
              </button>
              <button onClick={() => nav("/admin/server")} className="flex-1 h-11 border border-white/20 rounded-lg font-bold text-xs">
                SERVER ÄNDERN
              </button>
            </div>
          </div>
        )}
        <button onClick={submit} disabled={loading} className="btn-primary mt-2">{loading ? "..." : "ANMELDEN"}</button>
        <p className="text-white/40 text-xs text-center mt-4">Standardpasswort: admin123</p>
      </div>
    </div>
  );
}

// ============ Admin Home ============
function AdminHome() {
  const nav = useNavigate();
  const adminName = useAdminName();
  const theme = useAdminTheme();
  const bgColor = resolveBg(theme);
  const darkScope = isDarkHex(bgColor);

  // ---- Date helpers (Berlin TZ) ----
  const todayISO = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const addDaysISO = (iso: string, n: number): string => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const formatGermanDateLong = (iso: string): string => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Berlin",
      });
    } catch { return iso; }
  };
  const formatGermanDateShort = (iso: string): string => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Berlin",
      });
    } catch { return iso; }
  };

  const [viewDate, setViewDate] = useState<string>(() => {
    // If we just restored a task, sessionStorage will tell us which day to show.
    try {
      const jump = sessionStorage.getItem("admin_jump_to_date");
      if (jump && /^\d{4}-\d{2}-\d{2}$/.test(jump)) {
        sessionStorage.removeItem("admin_jump_to_date");
        return jump;
      }
    } catch {}
    return todayISO();
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [workflows, setWorkflows] = useState<Record<string, TaskWorkflow>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(!!getServerConfigSync());
  const [timeEditTask, setTimeEditTask] = useState<Task | null>(null);
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [mediaTask, setMediaTask] = useState<Task | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{ task: Task; wf: TaskWorkflow } | null>(null);
  // Collapse/Expand — purely visual. Only ONE task card expanded at a time.
  // By default: all collapsed. Tapping a header toggles it; tapping another
  // card's header collapses the previous one. Finished tasks stay collapsed
  // unless the user explicitly opens them.
  // IMPORTANT: Does NOT touch workflow/status/timer/DB — UI-only state.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  const [busyId, setBusyId] = useState<string>("");
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const today = todayISO();
  const isToday = viewDate === today;
  const isYesterday = viewDate === addDaysISO(today, -1);
  const isTomorrow = viewDate === addDaysISO(today, 1);

  useEffect(() => { const u = subscribeServerConfig((c) => setOnline(!!c)); return () => { u(); }; }, []);
  const load = async () => {
    try {
      const [t, p, wfMap] = await Promise.all([
        // Use the new generic `/tasks?date=YYYY-MM-DD` endpoint with fallback
        api<Task[]>(`/tasks?date=${viewDate}`).catch(() =>
          api<Task[]>(`/tasks/by-date?date=${viewDate}`).catch(() => [])
        ),
        api<SimpleItem[]>("/persons"),
        fetchAllWorkflows(),
      ]);
      setTasks(Array.isArray(t) ? t : []);
      setPersons(p);
      setWorkflows(wfMap);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => {
    setLoading(true);
    load();
    const tk = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(tk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);
  useWebSocket((m) => {
    if (m?.type === "workflow_updated" && m.workflow?.task_id) {
      const wf = m.workflow as TaskWorkflow & { deleted?: boolean };
      if (wf.deleted) {
        setWorkflows((prev) => { const next = { ...prev }; delete next[wf.task_id]; return next; });
      } else {
        saveWorkflow(wf);
        setWorkflows((prev) => ({ ...prev, [wf.task_id]: wf }));
      }
      return;
    }
    if (m?.type === "tasks_updated" || m?.type === "persons_updated") load();
  });

  const personName = (id: string) => persons.find((p) => p.id === id)?.name || "—";
  const logout = () => { setToken(null); nav("/"); };
  const archiveAll = async () => {
    if (!isToday) {
      alert('Massen-Archivierung ist nur für „Heute“ verfügbar.');
      return;
    }
    if (!confirm("Alle heutigen Aufgaben archivieren?")) return;
    try { await api("/tasks/archive-now", { method: "POST", auth: true }); load(); } catch (e: any) { alert("Fehler: " + (e?.message || "")); }
  };
  // archiveOne is invoked via the ArchiveConfirmModal — see archiveConfirmTask state below.
  const archiveOne = async (id: string) => {
    try { await api(`/tasks/${id}`, { method: "DELETE", auth: true }); load(); } catch (e: any) { alert("Fehler: " + (e?.message || "")); }
  };
  const deleteOne = async (id: string) => {
    if (!confirm("Aufgabe ENDGÜLTIG löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    try { await api(`/tasks/${id}?permanent=1`, { method: "DELETE", auth: true }); load(); } catch {}
  };
  const editOne = (id: string) => nav(`/admin/edit/${id}`);
  const goCreate = () => nav(`/admin/create${viewDate !== today ? `?date=${viewDate}` : ""}`);
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    // Modern browsers: showPicker(); fallback: focus+click
    try { (el as any).showPicker?.(); el.focus(); el.click(); } catch { el.click(); }
  };
  void tick;

  return (
    <div className={`admin-scope ${darkScope ? "dark" : "light"}`} style={{ ["--admin-bg" as any]: bgColor }}>
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-5">
        <div className="min-w-0 flex-1 mr-3">
          <div className="text-2xl font-black tracking-widest uppercase truncate">{adminName}</div>
          <div className="text-xs tracking-wider opacity-60">
            Plan für: <span className="font-bold opacity-90">{formatGermanDateLong(viewDate)}</span> · {tasks.length} {tasks.length === 1 ? "Aufgabe" : "Aufgaben"}
          </div>
        </div>
        <button onClick={logout} className="p-2"><Icon d={ICONS.logout} size={22} color={darkScope ? "#fff" : "#000"} /></button>
      </div>
      <div className={`mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-full border bg-surface-card ${online ? "border-brand-green" : "border-brand-orange"}`}>
        <span className={`w-2 h-2 rounded-full ${online ? "bg-brand-green" : "bg-brand-orange"}`} />
        <span className="flex-1 text-xs font-bold">{online ? "Online · Live-Updates aktiv" : "Offline-Modus · Lokale Daten"}</span>
        <button onClick={() => nav("/admin/server")} className="border border-surface-border px-2.5 py-1 rounded-md text-xs font-bold">Server</button>
      </div>

      {/* Date navigation: ◀ [date label / picker] ▶ */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <button
          onClick={() => setViewDate(addDaysISO(viewDate, -1))}
          className="w-11 h-11 rounded-lg border border-surface-border bg-surface-card text-lg font-black active:scale-90 flex items-center justify-center"
          aria-label="Vorheriger Tag"
        >
          ◀
        </button>
        <button
          onClick={openDatePicker}
          className={`flex-1 h-11 rounded-lg border-2 font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition ${isToday ? "border-brand-blue bg-brand-blue/15 text-brand-blue" : "border-surface-border bg-surface-card"}`}
        >
          <span className="text-sm">{formatGermanDateShort(viewDate)}</span>
          <span className="opacity-70 text-base">📅</span>
        </button>
        <button
          onClick={() => setViewDate(addDaysISO(viewDate, 1))}
          className="w-11 h-11 rounded-lg border border-surface-border bg-surface-card text-lg font-black active:scale-90 flex items-center justify-center"
          aria-label="Nächster Tag"
        >
          ▶
        </button>
        {/* Hidden native date input — clicked programmatically by the date label button */}
        <input
          ref={dateInputRef}
          type="date"
          value={viewDate}
          onChange={(e) => { if (e.target.value) setViewDate(e.target.value); }}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
          aria-hidden="true"
        />
      </div>

      {/* Quick shortcuts: Gestern · Heute · Morgen · Archiv */}
      <div className="flex gap-2 px-3 pb-2">
        <button
          onClick={() => setViewDate(addDaysISO(today, -1))}
          className={`flex-1 py-2.5 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition ${isYesterday ? "bg-brand-blue/20 border-brand-blue text-brand-blue" : "bg-surface-card border-surface-border opacity-70"}`}
        >
          GESTERN
        </button>
        <button
          onClick={() => setViewDate(today)}
          className={`flex-1 py-2.5 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition ${isToday ? "bg-brand-blue/20 border-brand-blue text-brand-blue" : "bg-surface-card border-surface-border opacity-70"}`}
        >
          HEUTE
        </button>
        <button
          onClick={() => setViewDate(addDaysISO(today, 1))}
          className={`flex-1 py-2.5 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition ${isTomorrow ? "border-indigo-500 text-indigo-500" : "bg-surface-card border-surface-border opacity-70"}`}
          style={isTomorrow ? { backgroundColor: EVENT_COLOR.feierabend + "20", borderColor: EVENT_COLOR.feierabend, color: EVENT_COLOR.feierabend } : undefined}
        >
          MORGEN
        </button>
      </div>

      <div className="flex gap-2 px-3 pb-3 border-b border-surface-border">
        <ToolBtn onClick={goCreate} icon={ICONS.plus} label="Neu" primary />
        <ToolBtn onClick={() => nav("/admin/manage")} icon={ICONS.list} label="Listen" />
        <ToolBtn onClick={() => nav("/admin/settings")} icon={ICONS.settings} label="Einstell." />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {(() => {
          const activeTasks = tasks;
          if (loading) return <div className="flex justify-center mt-12"><Spin /></div>;
          if (activeTasks.length === 0) return (
            <div className="mt-16 text-center opacity-60 space-y-2">
              <div className="flex justify-center"><Icon d={ICONS.clipboard} size={48} /></div>
              <div className="text-lg font-bold">
                {isToday ? "Keine Aufgaben heute" :
                 isYesterday ? "Keine Aufgaben gestern" :
                 isTomorrow ? "Keine Aufgaben für morgen" :
                 `Keine Aufgaben am ${formatGermanDateShort(viewDate)}`}
              </div>
              <div className="text-sm">
                {isToday || isTomorrow || (viewDate > today)
                  ? "Tippen Sie auf NEU, um eine Aufgabe für diesen Tag hinzuzufügen."
                  : "Für diesen Tag wurden keine Aufgaben erfasst."}
              </div>
            </div>
          );
          return activeTasks.map((t) => {
          const wf = workflows[t.id] || getWorkflow(t.id);
          const wfStatus: WorkflowStatus = wf.status;
          const isRunning = wfStatus === "running";
          const totalMs = totalWorkMs(wf, isRunning ? Date.now() : undefined);
          const lastEventColor = wf.last_event_type ? EVENT_COLOR[wf.last_event_type] : "#9CA3AF";
          const isExpanded = expandedId === t.id;
          const personsLabel = t.person_ids.map(personName).join(" · ") || "Keine Personen";
          // "Fortsetzung von gestern" if continue_tomorrow flag is set AND we're
          // viewing the next_work_date (i.e. this card is showing on a continuation day)
          const isContinuation = !!t.continue_tomorrow && t.next_work_date === viewDate && t.task_date !== viewDate;
          return (
            <div key={t.id} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
              {/* Compact header — always visible, clickable to toggle expand */}
              <button
                type="button"
                onClick={() => toggleExpand(t.id)}
                aria-expanded={isExpanded}
                className="w-full px-3.5 py-3 text-left active:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-extrabold text-[15px] truncate">
                      {t.task_type} <span className="opacity-50">·</span> Haus {t.haus}
                    </div>
                    <div className="text-xs opacity-60 truncate">{personsLabel}</div>
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[wfStatus] }} />
                      <span className="text-[11px] font-black tracking-wide" style={{ color: STATUS_COLOR[wfStatus] }}>
                        {STATUS_LABEL_DE[wfStatus]}
                      </span>
                      {isContinuation && (
                        <span className="text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: EVENT_COLOR.feierabend + "25", color: EVENT_COLOR.feierabend }}>
                          ↻ Fortsetzung von gestern
                        </span>
                      )}
                      {isRunning && (
                        <span className="ml-auto text-[10px] font-mono tabular-nums opacity-60">
                          {formatDuration(totalMs)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-[10px] shrink-0 transition-transform"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
                    aria-hidden
                  >
                    ▼
                  </div>
                </div>
              </button>

              {/* Expanded body — full details, unchanged logic */}
              {isExpanded && (
              <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/5">
              {t.description && <div className="text-sm">{t.description}</div>}
              <div className="text-white/50 text-xs italic">
                Haus {t.haus} · Station {t.station} · {t.time_from}–{t.time_to}
              </div>

              {/* Workflow info grid – live updates */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <AdminCell label="Vorbereitet" value={formatTime(wf.prepared_at)} color={wf.prepared_at ? EVENT_COLOR.vorbereiten : undefined} />
                <AdminCell label="Gestartet" value={formatTime(wf.started_at)} color={wf.started_at ? EVENT_COLOR.starten : undefined} />
                <AdminCell label="Pause seit" value={wfStatus === "paused" ? formatTime(wf.paused_at) : "—"} color={wfStatus === "paused" ? EVENT_COLOR.pause : undefined} />
                <AdminCell label="Beendet" value={formatTime(wf.finished_at)} color={wf.finished_at ? EVENT_COLOR.beenden : undefined} />
              </div>

              {/* Live work timer + Pause total — gleiche Größe, beide identisch */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg px-3 py-2 border" style={{ borderColor: STATUS_COLOR[wfStatus] + "55", backgroundColor: STATUS_COLOR[wfStatus] + "12" }}>
                  <div className="text-[10px] font-bold tracking-widest opacity-60 uppercase">{wfStatus === "finished" ? "Gesamt-Arbeitszeit" : "Arbeitszeit"}</div>
                  <div className="font-mono tabular-nums text-xl font-black leading-tight" style={{ color: STATUS_COLOR[wfStatus] }}>{formatDuration(totalMs)}{isRunning && <span className="ml-2 text-[10px] tracking-widest" style={{ color: STATUS_COLOR.running }}>● LIVE</span>}</div>
                </div>
                <div className="rounded-lg px-3 py-2 border" style={{ borderColor: EVENT_COLOR.pause + "55", backgroundColor: EVENT_COLOR.pause + "12" }}>
                  <div className="text-[10px] font-bold tracking-widest opacity-60 uppercase">Pause-Zeit</div>
                  <div className="font-mono tabular-nums text-xl font-black leading-tight" style={{ color: EVENT_COLOR.pause }}>{formatDuration(totalPauseMs(wf, Date.now()))}</div>
                </div>
              </div>

              {/* Aktuelle Notiz (last note) */}
              {wf.last_note && wf.last_event_type && (
                <div className="border-l-2 pl-2.5" style={{ borderColor: lastEventColor }}>
                  <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: lastEventColor }}>
                    Aktuelle Notiz · {EVENT_LABEL[wf.last_event_type]}
                  </div>
                  <div className="text-sm italic" style={{ color: lastEventColor }}>{wf.last_note}</div>
                </div>
              )}

              {/* Vollständiger Verlauf aller Ereignisse (pro Tag gruppiert falls mehrtägig) */}
              <DailyBreakdownView wf={wf} persons={persons} dark={true} />

              {/* Actions: Bearbeiten | Drucken | Löschen */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button onClick={() => editOne(t.id)} className="h-10 rounded-lg border border-brand-yellow/60 bg-brand-yellow/10 text-brand-yellow text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5">
                  <Icon d={ICONS.edit} size={14} color="#FFD600" /> Bearbeiten
                </button>
                <button onClick={() => printTaskReport(t, wf, persons)} className="h-10 rounded-lg border border-brand-blue/60 bg-blue-500/10 text-brand-blue text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5">
                  <Icon d={ICONS.print} size={14} color="#3B82F6" /> Drucken
                </button>
                <button onClick={() => deleteOne(t.id)} className="h-10 rounded-lg border border-brand-red/60 bg-red-500/10 text-brand-red text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5">
                  <Icon d={ICONS.trash} size={14} color="#FF3B30" /> Löschen
                </button>
              </div>

              {/* Media + PDF herunterladen (prominent row) */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setMediaTask(t)}
                  className="h-11 rounded-lg border-2 text-xs font-black tracking-[1.5px] active:scale-95 transition flex items-center justify-center gap-1.5"
                  style={{ borderColor: "#EC4899", backgroundColor: "#EC489915", color: "#EC4899" }}
                >
                  📷 MEDIA ({t.photos?.length || 0})
                </button>
                <button
                  onClick={() => downloadTaskPdf(t, wf, persons)}
                  className="h-11 rounded-lg border-2 border-brand-green/70 bg-brand-green/10 text-brand-green text-xs font-black tracking-[1.5px] active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Icon d={ICONS.pdf} size={15} color="#00E676" /> PDF
                </button>
              </div>

              {/* Admin-Zeit-Aktionen */}
              <div className={`grid ${wfStatus === "finished" ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                <button
                  disabled={(wf.events || []).filter(e => e.type === 'vorbereiten' || e.type === 'starten' || e.type === 'pause' || e.type === 'fortsetzen' || e.type === 'beenden').length === 0}
                  onClick={() => setTimeEditTask(t)}
                  className="h-10 rounded-lg border border-white/20 bg-white/5 text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Icon d={ICONS.clock} size={14} color={darkScope ? "#fff" : "#000"} /> Zeiten bearbeiten
                </button>
                {wfStatus === "finished" && (
                  <button
                    onClick={() => setUndoTask(t)}
                    className="h-10 rounded-lg border border-brand-yellow/60 bg-brand-yellow/10 text-brand-yellow text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5"
                  >
                    <Icon d={ICONS.back} size={14} color="#FFD600" /> Beenden rückgängig
                  </button>
                )}
              </div>
              </div>
              )}
            </div>
          );
        });
        })()}
      </div>
      {/* Massen-Archivieren-Button entfernt — kein Archiv-System mehr.
          Tage selbst dienen als Archiv. */}
    </div>
    {timeEditTask && (
      <TimeEditModal
        task={timeEditTask}
        workflow={workflows[timeEditTask.id] || getWorkflow(timeEditTask.id)}
        busy={busyId === timeEditTask.id}
        onClose={() => setTimeEditTask(null)}
        onSave={async (updates, note) => {
          setBusyId(timeEditTask.id);
          try {
            const wf = await adminCorrectTimes(timeEditTask.id, updates, note, timeEditTask.task_type);
            setWorkflows((prev) => ({ ...prev, [timeEditTask.id]: wf }));
            setTimeEditTask(null);
          } catch (e: any) { alert("Fehler: " + (e?.message || "")); } finally { setBusyId(""); }
        }}
      />
    )}
    {undoTask && (
      <UndoFinishModal
        task={undoTask}
        busy={busyId === undoTask.id}
        onClose={() => setUndoTask(null)}
        onConfirm={async (note) => {
          setBusyId(undoTask.id);
          try {
            const wf = await adminUndoFinish(undoTask.id, note, undoTask.task_type);
            setWorkflows((prev) => ({ ...prev, [undoTask.id]: wf }));
            setUndoTask(null);
          } catch (e: any) { alert("Fehler: " + (e?.message || "")); } finally { setBusyId(""); }
        }}
      />
    )}
    {mediaTask && (
      <MediaModal
        task={mediaTask}
        isAdmin={true}
        currentUserName="Admin"
        onClose={() => setMediaTask(null)}
        onPhotosChanged={() => load()}
      />
    )}
    {archiveConfirm /* defensive: archive system removed; keep state harmless */ && null}
    </div>
  );
}

// ---------- Archive confirmation modal with smart "not finished" warning ----------
function ArchiveConfirmModal({ task, wf, onCancel, onConfirm }: {
  task: Task;
  wf: TaskWorkflow;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const status = wf?.status || "idle";
  const isFinished = status === "finished";
  const isDeferred = status === "deferred";
  const isInProgress = status === "running" || status === "paused" || status === "prepared";
  // Reasons displayed in the warning box (red box only shown when not finished)
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-5">
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: "rgba(24,24,28,0.98)", border: "2px solid #FF9500" }}
      >
        <div>
          <div className="text-xs font-bold tracking-widest uppercase opacity-60">Archivieren</div>
          <div className="text-lg font-black text-white mt-0.5">Diese Aufgabe wirklich archivieren?</div>
        </div>

        <div className="rounded-lg px-3 py-2.5 border border-white/10 bg-white/5">
          <div className="font-extrabold text-white truncate">{task.task_type}</div>
          <div className="text-xs opacity-60">Haus {task.haus} · Station {task.station} · {task.time_from}–{task.time_to}</div>
          {task.task_date && <div className="text-[11px] opacity-50 mt-0.5">Datum: {task.task_date}</div>}
        </div>

        {!isFinished && (
          <div className="rounded-lg px-3 py-2.5 border-2 border-red-500 bg-red-500/15">
            <div className="text-red-400 font-black text-sm flex items-center gap-2">
              <span>⚠</span>
              <span>Aufgabe ist noch nicht abgeschlossen</span>
            </div>
            <div className="text-red-200/90 text-xs mt-1.5 leading-relaxed">
              {isDeferred
                ? "Status: „Wird morgen fortgesetzt“. Wenn Sie jetzt archivieren, geht der Fortsetzungs-Plan verloren."
                : isInProgress
                ? `Aktueller Status: „${STATUS_LABEL_DE[status]}“. Es wurde noch nicht „Beendet“ gedrückt.`
                : "Es wurde noch kein „Beendet“ erfasst."}
              {" "}Die Aufgabe wandert ins Archiv, kann aber jederzeit dort wiederhergestellt werden.
            </div>
          </div>
        )}

        {isFinished && (
          <div className="rounded-lg px-3 py-2 border border-green-500/40 bg-green-500/10">
            <div className="text-green-400 text-xs font-bold">✓ Aufgabe ist abgeschlossen ({STATUS_LABEL_DE[status]})</div>
          </div>
        )}

        <div className="text-[11px] opacity-50 leading-relaxed">
          Hinweis: Timeline, Fotos, Zeiten und Notizen bleiben vollständig erhalten.
          Sie können die Aufgabe jederzeit aus dem Archiv wiederherstellen.
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-xl border-2 border-white/15 bg-white/5 text-white font-black tracking-wide active:scale-95"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-12 rounded-xl font-black tracking-wide active:scale-95 ${isFinished ? "bg-brand-orange text-black" : "bg-red-500 text-white"}`}
          >
            Ja, archivieren
          </button>
        </div>
      </div>
    </div>
  );
}

const AdminCell = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: color ? color + "55" : "rgba(255,255,255,0.08)", backgroundColor: color ? color + "10" : "rgba(255,255,255,0.04)" }}>
    <div className="text-[10px] font-bold tracking-widest uppercase opacity-60">{label}</div>
    <div className="text-sm font-bold" style={{ color: color || "#fff" }}>{value}</div>
  </div>
);

// ============ TimeEditModal — Admin kann einzelne Event-Zeitpunkte anpassen ============
function TimeEditModal({ task, workflow, busy, onClose, onSave }: {
  task: Task;
  workflow: TaskWorkflow;
  busy: boolean;
  onClose: () => void;
  onSave: (updates: Array<{ index: number; ts: string }>, note: string) => Promise<void>;
}) {
  const editable = (workflow.events || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => ["vorbereiten", "starten", "pause", "fortsetzen", "beenden"].includes(e.type) && !e.undone);
  const [times, setTimes] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const { e, i } of editable) {
      const d = new Date(e.ts);
      init[i] = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return init;
  });
  const [note, setNote] = useState("");

  const handleSave = async () => {
    const updates: Array<{ index: number; ts: string; display_time?: string; display_date?: string }> = [];
    for (const { e, i } of editable) {
      const newHHMM = times[i];
      if (!newHHMM) continue;
      const [h, m] = newHHMM.split(":").map((x) => parseInt(x, 10));
      if (isNaN(h) || isNaN(m)) continue;
      const d = new Date(e.ts);
      d.setHours(h, m, 0, 0);
      const newIso = d.toISOString();
      if (newIso !== e.ts || newHHMM !== (e.display_time || "")) {
        // Plain-text display values — ensure NO TZ conversion on display.
        const display_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        updates.push({ index: i, ts: newIso, display_time: newHHMM, display_date });
      }
    }
    if (updates.length === 0) { onClose(); return; }
    await onSave(updates, note);
  };

  return (
    <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="w-full max-w-xl my-6 rounded-2xl p-5 space-y-4" style={{ backgroundColor: "rgba(24,24,28,0.98)", border: "2px solid #FFD600" }}>
        <div className="flex items-center gap-2.5">
          <Icon d={ICONS.clock} size={22} color="#FFD600" />
          <div className="text-xl font-black tracking-wide text-brand-yellow">Zeiten bearbeiten</div>
        </div>
        <div className="text-white/70 text-sm">Aufgabe: <span className="font-bold text-white">{task.task_type} · Haus {task.haus} · Station {task.station}</span></div>
        <div className="text-white/60 text-xs">Nur die Uhrzeit (24h) jedes Ereignisses kann geändert werden. Datum bleibt erhalten.</div>

        <div className="space-y-2">
          {editable.length === 0 && <div className="text-white/50 text-sm italic">Keine Ereignisse zum Bearbeiten</div>}
          {editable.map(({ e, i }) => {
            const c = EVENT_COLOR[e.type];
            return (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2.5" style={{ backgroundColor: c + "10", borderLeft: `3px solid ${c}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black tracking-wide" style={{ color: c }}>{EVENT_LABEL[e.type]}</div>
                  <div className="text-[10px] font-mono opacity-60 text-white">alt: {formatDateTime(e.ts)}</div>
                </div>
                <input
                  type="time"
                  step={60}
                  value={times[i] || ""}
                  onChange={(ev) => setTimes((prev) => ({ ...prev, [i]: ev.target.value }))}
                  className="h-11 px-3 rounded-lg bg-black/40 border-2 text-white font-mono tabular-nums text-base outline-none"
                  style={{ borderColor: c + "99", caretColor: c }}
                />
              </div>
            );
          })}
        </div>

        <div>
          <div className="section-label mb-1.5">Notiz des Admins (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Starten wurde zu spät gedrückt, echter Beginn war 07:00"
            rows={2}
            className="w-full rounded-xl p-3 bg-black/40 border-2 border-brand-yellow/40 text-brand-yellow caret-brand-yellow outline-none resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 h-12 border-2 border-white/15 bg-white/5 rounded-xl font-black tracking-wide text-white disabled:opacity-50">ABBRECHEN</button>
          <button onClick={handleSave} disabled={busy} className="flex-1 h-12 rounded-xl font-black tracking-wide text-black bg-brand-yellow disabled:opacity-50">{busy ? "..." : "SPEICHERN"}</button>
        </div>
      </div>
    </div>
  );
}

// ============ UndoFinishModal ============
function UndoFinishModal({ task, busy, onClose, onConfirm }: {
  task: Task;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ backgroundColor: "rgba(24,24,28,0.98)", border: "2px solid #FFD600" }}>
        <div className="flex items-center gap-2.5">
          <Icon d={ICONS.back} size={22} color="#FFD600" />
          <div className="text-xl font-black tracking-wide text-brand-yellow">Beenden rückgängig machen</div>
        </div>
        <div className="text-white/70 text-sm">
          Aufgabe: <span className="font-bold text-white">{task.task_type}</span><br />
          Die Aufgabe kehrt zum Zustand vor dem letzten <span className="text-brand-green font-bold">Beenden</span> zurück. Alle Notizen und der Verlauf bleiben erhalten.
        </div>
        <div>
          <div className="section-label mb-1.5">Notiz des Admins (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Versehentlich beendet"
            rows={3}
            className="w-full rounded-xl p-3 bg-black/40 border-2 border-brand-yellow/40 text-brand-yellow caret-brand-yellow outline-none resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 h-12 border-2 border-white/15 bg-white/5 rounded-xl font-black tracking-wide text-white disabled:opacity-50">ABBRECHEN</button>
          <button onClick={() => onConfirm(note)} disabled={busy} className="flex-1 h-12 rounded-xl font-black tracking-wide text-black bg-brand-yellow disabled:opacity-50">{busy ? "..." : "RÜCKGÄNGIG"}</button>
        </div>
      </div>
    </div>
  );
}
function EventHistoryList({ events, dark = true, max = 50 }: { events: WorkflowEvent[]; dark?: boolean; max?: number }) {
  if (!events || events.length === 0) return null;
  // Sort chronologically (oldest first)
  const sorted = [...events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).slice(-max);
  return (
    <div className="rounded-xl border p-2.5 mt-1" style={{ borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}>
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="text-[10px] font-black tracking-[2px] uppercase opacity-60" style={{ color: dark ? "#fff" : "#000" }}>Verlauf · Notizen</div>
        <div className="text-[10px] font-bold opacity-50" style={{ color: dark ? "#fff" : "#000" }}>{sorted.length} Einträge</div>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {sorted.map((ev, i) => {
          const c = EVENT_COLOR[ev.type] || "#888";
          const isAdminEvent = ev.type === "admin_zeitkorrektur" || ev.type === "admin_beenden_rueckgaengig";
          const undone = !!ev.undone;
          return (
            <div key={i} className="flex gap-2.5 items-start rounded-lg p-2" style={{ backgroundColor: c + "10", borderLeft: `3px solid ${c}`, opacity: undone ? 0.55 : 1 }}>
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-black tracking-wide" style={{ color: c, textDecoration: undone ? "line-through" : "none" }}>{EVENT_LABEL[ev.type] || ev.type}</span>
                  {undone && <span className="text-[10px] font-bold text-brand-yellow">(zurückgenommen)</span>}
                  <span className="text-[10px] font-mono opacity-70" style={{ color: dark ? "#fff" : "#000" }}>{eventDisplayDate(ev)} · {eventDisplayTime(ev, { withSeconds: true })}</span>
                </div>
                {ev.note ? (
                  <div className="text-xs italic mt-0.5" style={{ color: c, textDecoration: undone ? "line-through" : "none" }}>„{ev.note}"</div>
                ) : (
                  <div className="text-[10px] italic opacity-40" style={{ color: dark ? "#fff" : "#000" }}>(keine Notiz)</div>
                )}
                {isAdminEvent && ev.corrections && ev.corrections.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {ev.corrections.map((co, k) => (
                      <div key={k} className="text-[10px] font-mono opacity-80" style={{ color: c }}>
                        ↳ {EVENT_LABEL[co.target_type]}: {new Date(co.old_ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} → {co.new_display_time ? co.new_display_time : new Date(co.new_ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ToolBtn = ({ onClick, icon, label, primary }: any) => (
  <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg border text-xs font-bold tracking-wide ${primary ? "bg-brand-yellow border-brand-yellow text-black" : "bg-surface-card border-surface-border text-white"}`}>
    <Icon d={icon} size={16} color={primary ? "#000" : "#fff"} /> {label}
  </button>
);

// ============ DailyBreakdownView ============
// Shows a task's events and times split by calendar day (dailyWorkLog).
// Used in Admin and Archive when a task spans >1 day (Feierabend → Fortsetzen next day).
function DailyBreakdownView({ wf, persons, dark = true }: { wf: TaskWorkflow; persons: SimpleItem[]; dark?: boolean }) {
  const days: DaySection[] = buildDailyBreakdown(wf);
  if (days.length === 0) return <EventHistoryList events={wf.events || []} dark={dark} />;
  // If only one day, just show the regular event list (avoids clutter for single-day tasks).
  if (days.length === 1) return <EventHistoryList events={wf.events || []} dark={dark} />;

  const pn = (id: string) => persons.find((p) => p.id === id)?.name || id.slice(0, 6);
  const fmtDE = (d: string) => {
    try { return new Date(d + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return d; }
  };

  const txt = dark ? "#fff" : "#000";
  const muted = dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
  const border = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const subBg = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";

  return (
    <div className="space-y-2 mt-1">
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-black tracking-[2px] uppercase opacity-60" style={{ color: txt }}>
          Verlauf pro Tag · {days.length} Tage
        </div>
      </div>
      {days.map((d, idx) => {
        const isLast = idx === days.length - 1;
        const headerColor = isLast ? (wf.status === "finished" ? EVENT_COLOR.beenden : EVENT_COLOR.feierabend) : EVENT_COLOR.feierabend;
        return (
          <div key={d.date} className="rounded-xl border overflow-hidden" style={{ borderColor: border, backgroundColor: subBg }}>
            {/* Day header */}
            <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: headerColor + "18", borderBottom: `1px solid ${headerColor}33` }}>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[10px] font-black tracking-widest uppercase opacity-70" style={{ color: txt }}>Tag {idx + 1}</span>
                <span className="text-sm font-black" style={{ color: headerColor }}>{fmtDE(d.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums" style={{ color: txt }}>
                <span title="Arbeitszeit" style={{ color: STATUS_COLOR.running }}>⏱ {formatDuration(d.workMs)}</span>
                <span title="Pause-Zeit" style={{ color: EVENT_COLOR.pause }}>⏸ {formatDuration(d.pauseMs)}</span>
              </div>
            </div>
            {/* Mitarbeiter of the day */}
            <div className="px-3 py-2 flex flex-wrap gap-1.5 items-center" style={{ borderBottom: `1px solid ${border}` }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: muted }}>Mitarbeiter:</span>
              {d.persons.length === 0 ? (
                <span className="text-[11px] italic" style={{ color: muted }}>—</span>
              ) : (
                d.persons.map((pid) => (
                  <span key={pid} className="text-[11px] px-2 py-0.5 rounded-full border font-bold" style={{ borderColor: border, color: txt, backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }}>
                    {pn(pid)}
                  </span>
                ))
              )}
            </div>
            {/* Events of the day */}
            <div className="p-2 space-y-1.5">
              {d.events.length === 0 ? (
                <div className="text-[11px] italic px-2" style={{ color: muted }}>Keine Ereignisse an diesem Tag.</div>
              ) : d.events.map((ev, i) => {
                const c = EVENT_COLOR[ev.type] || "#888";
                const undone = !!ev.undone;
                return (
                  <div key={i} className="flex gap-2.5 items-start rounded-lg p-2" style={{ backgroundColor: c + "10", borderLeft: `3px solid ${c}`, opacity: undone ? 0.55 : 1 }}>
                    <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-black tracking-wide" style={{ color: c, textDecoration: undone ? "line-through" : "none" }}>{EVENT_LABEL[ev.type] || ev.type}</span>
                        {undone && <span className="text-[10px] font-bold text-brand-yellow">(zurückgenommen)</span>}
                        <span className="text-[10px] font-mono opacity-70" style={{ color: txt }}>{eventDisplayTime(ev, { withSeconds: true })}</span>
                      </div>
                      {ev.note ? (
                        <div className="text-xs italic mt-0.5" style={{ color: c, textDecoration: undone ? "line-through" : "none" }}>„{ev.note}"</div>
                      ) : (
                        <div className="text-[10px] italic opacity-40" style={{ color: txt }}>(keine Notiz)</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border px-3 py-2" style={{ borderColor: border, backgroundColor: subBg }}>
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: muted }}>Gesamt-Arbeitszeit</div>
          <div className="font-mono tabular-nums text-base font-black" style={{ color: STATUS_COLOR.running }}>{formatDuration(totalWorkMs(wf))}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: muted }}>Gesamt-Pause-Zeit</div>
          <div className="font-mono tabular-nums text-base font-black" style={{ color: EVENT_COLOR.pause }}>{formatDuration(totalPauseMs(wf))}</div>
        </div>
      </div>
    </div>
  );
}


// ============ Admin Create / Edit ============
function AdminCreate() {
  const nav = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const editId = params.id || null;
  const isEdit = !!editId;

  // ---- Date helpers (Berlin TZ) ----
  const todayISO = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const addDaysISO = (iso: string, n: number): string => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const formatDateLabel = (iso: string): string => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("de-DE", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
        timeZone: "Europe/Berlin",
      });
    } catch { return iso; }
  };

  const [tt, setTt] = useState<SimpleItem[]>([]); const [hs, setHs] = useState<SimpleItem[]>([]);
  const [st, setSt] = useState<SimpleItem[]>([]); const [pp, setPp] = useState<SimpleItem[]>([]);
  const [taskType, setTaskType] = useState(""); const [haus, setHaus] = useState(""); const [station, setStation] = useState("");
  const [desc, setDesc] = useState(""); const [pids, setPids] = useState<string[]>([]);
  const [tFrom, setTFrom] = useState("07:00"); const [tTo, setTTo] = useState("15:30");
  // Pre-fill Datum from URL ?date= (when admin clicked "Neu" while viewing a non-today day)
  const initialDate = (() => {
    const q = searchParams.get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayISO();
  })();
  const [taskDate, setTaskDate] = useState<string>(initialDate);
  const [saving, setSaving] = useState(false);
  const [addFor, setAddFor] = useState<null | { kind: string; label: string }>(null);
  const [newName, setNewName] = useState("");
  const [loadError, setLoadError] = useState<string>("");

  const today = todayISO();
  const isToday = taskDate === today;
  const isTomorrow = taskDate === addDaysISO(today, 1);
  const isNextWeek = taskDate === addDaysISO(today, 7);

  const load = async () => {
    const [a, b, c, d] = await Promise.all([
      api<SimpleItem[]>("/task-types"), api<SimpleItem[]>("/houses"),
      api<SimpleItem[]>("/stations"), api<SimpleItem[]>("/persons")
    ]);
    setTt(a); setHs(b); setSt(c); setPp(d);
    if (isEdit && editId) {
      try {
        // Find task among today's tasks or archive
        const today = await api<Task[]>("/tasks/today");
        let task = today.find((t) => t.id === editId);
        if (!task) {
          // try archive dates
          const { dates } = await api<{ dates: string[] }>("/tasks/archive");
          for (const dt of dates || []) {
            const { tasks: arr } = await api<{ tasks: Task[] }>(`/tasks/archive?date=${encodeURIComponent(dt)}`);
            const found = arr?.find((t) => t.id === editId);
            if (found) { task = found; break; }
          }
        }
        if (!task) {
          // Fallback: search in any non-archived list (covers future-dated tasks)
          try {
            const all = await api<Task[]>("/tasks");
            task = (all || []).find((t) => t.id === editId);
          } catch {}
        }
        if (task) {
          setTaskType(task.task_type); setHaus(task.haus); setStation(task.station);
          setDesc(task.description || ""); setPids(task.person_ids || []);
          setTFrom(task.time_from || "07:00"); setTTo(task.time_to || "15:30");
          if (task.task_date && /^\d{4}-\d{2}-\d{2}$/.test(task.task_date)) {
            setTaskDate(task.task_date);
          }
        } else {
          setLoadError("Aufgabe nicht gefunden");
        }
      } catch (e: any) {
        setLoadError(e?.message || "Fehler beim Laden");
      }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [editId]);

  const addItem = async () => {
    if (!addFor || !newName.trim()) return;
    try {
      const it = await api<SimpleItem>(`/${addFor.kind}`, { method: "POST", body: { name: newName.trim() }, auth: true });
      if (addFor.kind === "task-types") { setTt([...tt, it]); setTaskType(it.name); }
      else if (addFor.kind === "houses") { setHs([...hs, it]); setHaus(it.name); }
      else if (addFor.kind === "stations") { setSt([...st, it]); setStation(it.name); }
      else if (addFor.kind === "persons") { setPp([...pp, it]); setPids([...pids, it.id]); }
      setNewName(""); setAddFor(null);
    } catch (e: any) { alert("Fehler: " + (e?.message || "")); }
  };
  const submit = async () => {
    if (!taskType || !haus || !station || !tFrom || !tTo) { alert("Bitte alle Pflichtfelder ausfüllen"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) { alert("Ungültiges Datum"); return; }
    setSaving(true);
    try {
      const body = {
        task_type: taskType, haus, station, description: desc, person_ids: pids,
        time_from: tFrom, time_to: tTo,
        task_date: taskDate,
      };
      if (isEdit && editId) {
        await api(`/tasks/${editId}`, { method: "PUT", auth: true, body });
      } else {
        await api("/tasks", { method: "POST", auth: true, body });
      }
      nav("/admin");
    } catch (e: any) { alert("Fehler: " + (e?.message || "")); } finally { setSaving(false); }
  };

  const Field = ({ label, opts, value, onChange, kind }: { label: string; opts: SimpleItem[]; value: string; onChange: (v: string) => void; kind: string }) => (
    <div className="mb-5">
      <label className="section-label">{label}</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {opts.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.name)} className={`chip ${value === o.name ? "chip-active" : ""}`}>{o.name}</button>
        ))}
        <button type="button" onClick={() => setAddFor({ kind, label })} className="chip-add"><Icon d={ICONS.plus} size={14} color="#FFD600" /> Add</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{isEdit ? "AUFGABE BEARBEITEN" : "NEUE AUFGABE"}</div>
        <div className="w-7" />
      </div>
      <div className="flex-1 p-4 overflow-auto pb-20">
        <Field label="AUFGABENTYP" opts={tt} value={taskType} onChange={setTaskType} kind="task-types" />
        <Field label="HAUS" opts={hs} value={haus} onChange={setHaus} kind="houses" />
        <Field label="STATION" opts={st} value={station} onChange={setStation} kind="stations" />
        <div className="mb-5">
          <label className="section-label">Beschreibung</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Optionale Beschreibung" className="input-base h-24 py-3 mt-2 resize-none" />
        </div>
        <div className="mb-5">
          <label className="section-label">Personen</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {pp.map((p) => (
              <button key={p.id} type="button" onClick={() => setPids(pids.includes(p.id) ? pids.filter((x) => x !== p.id) : [...pids, p.id])} className={`chip ${pids.includes(p.id) ? "chip-active" : ""}`}>{p.name}</button>
            ))}
            <button type="button" onClick={() => setAddFor({ kind: "persons", label: "Person" })} className="chip-add"><Icon d={ICONS.plus} size={14} color="#FFD600" /> Add</button>
          </div>
        </div>

        {/* ---- Datum (date picker + quick shortcuts) ---- */}
        <div className="mb-5">
          <label className="section-label">Datum</label>
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={taskDate}
              onChange={(e) => e.target.value && setTaskDate(e.target.value)}
              className="input-base"
            />
            <div className="text-xs opacity-70 px-1">
              {formatDateLabel(taskDate)}
              {taskDate < today && <span className="ml-2 text-brand-orange font-bold">· Vergangenheit</span>}
              {taskDate > today && <span className="ml-2 text-brand-blue font-bold">· in der Zukunft</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTaskDate(today)}
                className={`px-3 py-1.5 rounded-md border-2 text-xs font-black tracking-wide transition ${isToday ? "border-brand-blue bg-brand-blue/15 text-brand-blue" : "border-surface-border bg-surface-card opacity-70"}`}
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => setTaskDate(addDaysISO(today, 1))}
                className={`px-3 py-1.5 rounded-md border-2 text-xs font-black tracking-wide transition ${isTomorrow ? "border-indigo-500 bg-indigo-500/15 text-indigo-400" : "border-surface-border bg-surface-card opacity-70"}`}
              >
                Morgen
              </button>
              <button
                type="button"
                onClick={() => setTaskDate(addDaysISO(today, 7))}
                className={`px-3 py-1.5 rounded-md border-2 text-xs font-black tracking-wide transition ${isNextWeek ? "border-purple-500 bg-purple-500/15 text-purple-400" : "border-surface-border bg-surface-card opacity-70"}`}
              >
                Nächste Woche
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1"><label className="section-label">Von</label><input type="time" value={tFrom} onChange={(e) => setTFrom(e.target.value)} className="input-base mt-2" /></div>
          <div className="flex-1"><label className="section-label">Bis</label><input type="time" value={tTo} onChange={(e) => setTTo(e.target.value)} className="input-base mt-2" /></div>
        </div>
      </div>
      <button onClick={submit} disabled={saving} className="btn-primary m-4 mt-0">{saving ? "..." : isEdit ? "ÄNDERUNGEN SPEICHERN" : "AUFGABE ERSTELLEN"}</button>
      {loadError && <div className="mx-4 mb-3 text-brand-red text-sm font-bold">{loadError}</div>}
      {addFor && <AddModal label={addFor.label} value={newName} setValue={setNewName} onCancel={() => { setAddFor(null); setNewName(""); }} onSubmit={addItem} />}
    </div>
  );
}

const AddModal = ({ label, value, setValue, onCancel, onSubmit }: any) => (
  <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-5 z-50">
    <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
      <div className="font-extrabold tracking-wide">{label} hinzufügen</div>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit()} placeholder="Name" className="input-base" />
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 h-12 border border-surface-border rounded-xl font-bold">Abbrechen</button>
        <button onClick={onSubmit} className="flex-1 h-12 bg-brand-yellow text-black rounded-xl font-black">Hinzufügen</button>
      </div>
    </div>
  </div>
);

// ============ Admin Manage ============
function AdminManage() {
  const nav = useNavigate();
  const KINDS = [{ key: "task-types", label: "Aufgabentypen" }, { key: "houses", label: "Häuser" }, { key: "stations", label: "Stationen" }, { key: "persons", label: "Personen" }];
  const [data, setData] = useState<Record<string, SimpleItem[]>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const load = async () => {
    const r: Record<string, SimpleItem[]> = {};
    for (const k of KINDS) r[k.key] = await api<SimpleItem[]>(`/${k.key}`);
    setData(r);
  };
  useEffect(() => { load(); }, []);
  const add = async () => { if (!adding || !newName.trim()) return; try { await api(`/${adding}`, { method: "POST", body: { name: newName.trim() }, auth: true }); setNewName(""); setAdding(null); load(); } catch (e: any) { alert(e?.message); } };
  const del = async (k: string, i: SimpleItem) => { if (!confirm(`"${i.name}" löschen?`)) return; await api(`/${k}/${i.id}`, { method: "DELETE", auth: true }); load(); };
  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">LISTEN VERWALTEN</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-6">
        {KINDS.map((k) => (
          <div key={k.key}>
            <div className="flex justify-between items-center mb-2">
              <div className="section-label">{k.label}</div>
              <button onClick={() => setAdding(k.key)} className="chip-add"><Icon d={ICONS.plus} size={14} color="#FFD600" /> Add</button>
            </div>
            <div className="space-y-0.5">
              {(data[k.key] || []).length === 0 && <div className="text-white/50 italic p-3">Keine Einträge</div>}
              {(data[k.key] || []).map((i) => (
                <div key={i.id} className="bg-surface-card border border-surface-border px-4 py-3.5 flex justify-between items-center">
                  <div className="font-semibold">{i.name}</div>
                  <button onClick={() => del(k.key, i)}><Icon d={ICONS.close} size={20} color="#71717a" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {adding && <AddModal label="Eintrag" value={newName} setValue={setNewName} onCancel={() => { setAdding(null); setNewName(""); }} onSubmit={add} />}
    </div>
  );
}

// ============ Admin Archive ============
function AdminArchive() {
  const nav = useNavigate();
  const [dates, setDates] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [workflows, setWorkflows] = useState<Record<string, TaskWorkflow>>({});
  const [resetting, setResetting] = useState(false);
  const [restoringId, setRestoringId] = useState<string>("");
  const [restoreMsg, setRestoreMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [lastRestoredDate, setLastRestoredDate] = useState<string | null>(null);
  const loadAll = async () => {
    const [d, p, wfMap] = await Promise.all([
      api<{ dates: string[] }>("/tasks/archive"),
      api<SimpleItem[]>("/persons"),
      fetchAllWorkflows(),
    ]);
    setDates(d.dates); setPersons(p); setWorkflows(wfMap);
  };
  useEffect(() => { loadAll(); }, []);
  const loadDate = async (date: string) => {
    setSelected(date);
    const r = await api<{ tasks: Task[] }>(`/tasks/archive?date=${date}`);
    setTasks(r.tasks);
  };
  const resetArchive = async () => {
    if (!confirm("Möchten Sie wirklich alle archivierten Aufgaben löschen?")) return;
    setResetting(true);
    try {
      await api(`/tasks/archive/all`, { method: "DELETE", auth: true });
      setSelected(null); setTasks([]);
      await loadAll();
    } catch (e: any) {
      alert("Fehler: " + (e?.message || ""));
    } finally { setResetting(false); }
  };
  const restoreTask = async (t: Task) => {
    if (!confirm(`Aufgabe „${t.task_type}“ wiederherstellen?\n\nDie Aufgabe erscheint wieder unter ihrem ursprünglichen Datum (${t.task_date || "—"}). Timeline, Fotos, Zeiten und Notizen bleiben erhalten.`)) return;
    setRestoringId(t.id);
    setRestoreMsg(null);
    try {
      const r = await api<{ ok: true; task: Task; restored_to_date?: string; date_source?: string; photos_count?: number }>(
        `/tasks/${t.id}/restore`, { method: "POST", auth: true }
      );
      // Remove from local archive list immediately
      setTasks((prev) => prev.filter((x) => x.id !== t.id));

      const targetDate = r.restored_to_date || r.task?.task_date || t.task_date || "";
      const sourceWarning = r.date_source && r.date_source !== "preserved"
        ? ` (Datum war leer — automatisch gesetzt auf ${targetDate})`
        : "";

      // Build a German-formatted label for the toast
      const fmtLabel = (iso: string) => {
        try {
          const d = new Date(iso + "T12:00:00Z");
          return d.toLocaleDateString("de-DE", {
            weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
            timeZone: "Europe/Berlin",
          });
        } catch { return iso; }
      };

      setRestoreMsg({
        kind: "ok",
        text: `✓ „${t.task_type}“ wurde wiederhergestellt unter ${fmtLabel(targetDate)}${sourceWarning}.`,
      });

      // Stash the date so user gets a "Jetzt ansehen" button to jump there
      setLastRestoredDate(targetDate || null);

      // Refresh the archive date list (in case this date now has 0 entries)
      const rr = await api<{ tasks: Task[] }>(`/tasks/archive?date=${selected}`).catch(() => ({ tasks: [] as Task[] }));
      if (!rr.tasks || rr.tasks.length === 0) {
        await loadAll();
        setSelected(null);
        setTasks([]);
      }
    } catch (e: any) {
      setRestoreMsg({ kind: "err", text: "Wiederherstellen fehlgeschlagen: " + (e?.message || "Unbekannter Fehler") });
    } finally {
      setRestoringId("");
    }
  };
  const pn = (id: string) => persons.find((x) => x.id === id)?.name || "—";

  if (selected) return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => { setSelected(null); setTasks([]); setRestoreMsg(null); }}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{selected}</div>
        <div className="w-7" />
      </div>
      {restoreMsg && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded-lg border text-xs ${
          restoreMsg.kind === "ok" ? "bg-green-500/15 border-green-500/40 text-green-300"
                                   : "bg-red-500/15 border-red-500/40 text-red-300"
        }`}>
          <div className="flex items-start gap-2">
            <span className="flex-1" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>{restoreMsg.text}</span>
            <button onClick={() => { setRestoreMsg(null); setLastRestoredDate(null); }} className="opacity-70 hover:opacity-100">✕</button>
          </div>
          {restoreMsg.kind === "ok" && lastRestoredDate && (
            <button
              onClick={() => {
                // Persist target date in sessionStorage so AdminHome jumps to it on mount.
                try { sessionStorage.setItem("admin_jump_to_date", lastRestoredDate!); } catch {}
                nav("/admin");
              }}
              className="mt-2 w-full h-9 rounded-md border border-green-500/60 bg-green-500/20 text-green-200 text-[11px] font-black tracking-wide active:scale-95"
            >
              → JETZT IM PLAN ANSEHEN
            </button>
          )}
        </div>
      )}
      <div className="p-4 space-y-3">
        {tasks.length === 0 && <div className="text-white/50 text-center mt-10">Keine Aufgaben in diesem Archiv</div>}
        {tasks.map((t) => {
          const wf = workflows[t.id];
          const wfStatus: WorkflowStatus = wf?.status || "idle";
          const totalMs = wf ? totalWorkMs(wf) : 0;
          const pauseMs = wf ? totalPauseMs(wf) : 0;
          const isRestoring = restoringId === t.id;
          return (
            <div key={t.id} className="bg-surface-card border border-surface-border p-3.5 rounded-xl space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{t.task_type}</div>
                  <div className="text-white/50 text-xs">Haus {t.haus} · Station {t.station} · {t.time_from}–{t.time_to}</div>
                  {t.task_date && <div className="text-white/40 text-[10px] mt-0.5">Ursprüngliches Datum: <span className="font-bold text-white/70">{t.task_date}</span></div>}
                </div>
                <div className="flex items-center gap-1.5 border rounded-full px-2.5 py-1" style={{ borderColor: STATUS_COLOR[wfStatus] + "55", backgroundColor: STATUS_COLOR[wfStatus] + "15" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[wfStatus] }} />
                  <span className="text-[10px] font-bold" style={{ color: STATUS_COLOR[wfStatus] }}>{STATUS_LABEL_DE[wfStatus]}</span>
                </div>
              </div>
              {t.description && <div className="text-sm">{t.description}</div>}
              <div className="text-white/50 text-sm italic">{t.person_ids.map(pn).join(", ") || "—"}</div>
              {wf && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <AdminCell label="Vorbereitet" value={formatTime(wf.prepared_at)} color={wf.prepared_at ? EVENT_COLOR.vorbereiten : undefined} />
                    <AdminCell label="Gestartet" value={formatTime(wf.started_at)} color={wf.started_at ? EVENT_COLOR.starten : undefined} />
                    <AdminCell label="Beendet" value={formatTime(wf.finished_at)} color={wf.finished_at ? EVENT_COLOR.beenden : undefined} />
                    <AdminCell label="Pause-Anzahl" value={String((wf.events || []).filter(e => e.type === 'pause').length)} color={EVENT_COLOR.pause} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg px-3 py-2 border" style={{ borderColor: STATUS_COLOR[wfStatus] + "55", backgroundColor: STATUS_COLOR[wfStatus] + "12" }}>
                      <div className="text-[10px] font-bold tracking-widest opacity-60 uppercase">Gesamt</div>
                      <div className="font-mono tabular-nums text-xl font-black leading-tight" style={{ color: STATUS_COLOR[wfStatus] }}>{formatDuration(totalMs)}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2 border" style={{ borderColor: EVENT_COLOR.pause + "55", backgroundColor: EVENT_COLOR.pause + "12" }}>
                      <div className="text-[10px] font-bold tracking-widest opacity-60 uppercase">Pause-Zeit</div>
                      <div className="font-mono tabular-nums text-xl font-black leading-tight" style={{ color: EVENT_COLOR.pause }}>{formatDuration(pauseMs)}</div>
                    </div>
                  </div>
                  <DailyBreakdownView wf={wf} persons={persons} dark={true} />
                </>
              )}
              {/* Drucken + PDF buttons (always visible in Archive) */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => printTaskReport(t, wf || null, persons)}
                  className="h-10 rounded-lg border border-brand-blue/60 bg-blue-500/10 text-brand-blue text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Icon d={ICONS.print} size={14} color="#3B82F6" /> Drucken
                </button>
                <button
                  onClick={() => downloadTaskPdf(t, wf || null, persons)}
                  className="h-10 rounded-lg border-2 border-brand-green/70 bg-brand-green/10 text-brand-green text-xs font-black tracking-wide active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Icon d={ICONS.pdf} size={14} color="#00E676" /> PDF herunterladen
                </button>
              </div>
              {/* Restore button — full-width, prominent (cyan/teal) */}
              <button
                onClick={() => restoreTask(t)}
                disabled={isRestoring}
                className="w-full h-12 rounded-xl border-2 font-black tracking-[1.5px] text-sm active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ borderColor: "#06B6D4", backgroundColor: "#06B6D415", color: "#06B6D4" }}
              >
                {isRestoring ? "Wiederherstellen…" : "🔄 AUS ARCHIV ZURÜCKHOLEN"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">ARCHIV</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-2 flex-1">
        {dates.length === 0 && <div className="text-white/50 text-center mt-16">Noch keine archivierten Tage</div>}
        {dates.map((d) => (
          <button key={d} onClick={() => loadDate(d)} className="w-full bg-surface-card border border-surface-border px-4 py-4 flex items-center gap-3 rounded-xl">
            <Icon d={ICONS.calendar} size={20} color="#FFD600" />
            <span className="flex-1 text-left font-bold">{d}</span>
            <Icon d={ICONS.chevronRight} size={18} color="#71717a" />
          </button>
        ))}
      </div>
      {dates.length > 0 && (
        <button
          onClick={resetArchive}
          disabled={resetting}
          className="m-4 mt-0 h-14 border-2 border-brand-red bg-red-500/10 text-brand-red rounded-xl font-black tracking-[2px] flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-50"
        >
          <Icon d={ICONS.trash} size={18} color="#FF3B30" /> {resetting ? "..." : "ARCHIV ZURÜCKSETZEN"}
        </button>
      )}
    </div>
  );
}

// ============ Admin Settings ============
// ============ Admin Theme Section (used in Settings) ============
function AdminThemeSection() {
  const theme = useAdminTheme();
  return (
    <div>
      <div className="section-label mb-2">Admin Theme</div>
      <div className="text-white/50 text-xs mb-3">Hintergrund-Modus der Admin-Ansicht</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["dark", "light", "custom"] as ThemeMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setAdminTheme({ mode: m, color: theme.color })}
            className={`h-12 rounded-lg border-2 text-xs font-black tracking-wide ${
              theme.mode === m ? "border-brand-yellow bg-brand-yellow/10 text-brand-yellow" : "border-white/15 bg-white/5 text-white/70"
            }`}
          >
            {m === "dark" ? "Dark Mode" : m === "light" ? "Light Mode" : "Custom"}
          </button>
        ))}
      </div>
      {theme.mode === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={theme.color}
            onChange={(e) => setAdminTheme({ mode: "custom", color: e.target.value })}
            className="h-12 w-16 rounded-lg border-2 border-white/15 bg-transparent cursor-pointer"
          />
          <input
            type="text"
            value={theme.color}
            onChange={(e) => setAdminTheme({ mode: "custom", color: e.target.value })}
            placeholder="#1E1E24"
            maxLength={7}
            className="flex-1 h-12 px-3 bg-black/40 border-2 border-white/15 rounded-lg text-white font-mono caret-brand-yellow outline-none"
          />
        </div>
      )}
      <div className="mt-2 text-white/50 text-xs">
        Vorschau: <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{ backgroundColor: resolveBg(theme) }} />
        <span className="ml-2 font-mono">{resolveBg(theme)}</span>
      </div>
    </div>
  );
}

function AdminSettings() {
  const nav = useNavigate();
  const currentName = useAdminName();
  const [adminNameInput, setAdminNameInput] = useState<string>(currentName);
  const [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { setAdminNameInput(currentName); }, [currentName]);
  const [s, setS] = useState<AppSettings | null>(null);
  const [pw, setPw] = useState("");
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<{ latest_version: string; download_url: string; changelog?: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "latest" | "available">("idle");

  const saveName = () => {
    setAdminName(adminNameInput);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1800);
  };

  useEffect(() => { (async () => setS(await api<AppSettings>("/settings")))(); }, []);
  const upd = async (patch: any) => { try { setS(await api<AppSettings>("/settings", { method: "PUT", auth: true, body: patch })); } catch (e: any) { alert(e?.message); } };
  const pickImage = (kind: "logo" | "background") => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => {
        const b64 = r.result as string;
        if (kind === "logo") upd({ logo_base64: b64 });
        else upd({ background_type: "image", background_value: b64 });
      }; r.readAsDataURL(f);
    };
    inp.click();
  };
  const savePw = async () => { if (pw.length < 3) { alert("Mindestens 3 Zeichen"); return; } await upd({ password: pw }); setPw(""); alert("Passwort gespeichert"); };
  const check = async () => {
    setChecking(true);
    try { const i = await api<any>("/update-info"); setInfo(i); setStatus(cmp(i.latest_version, APP_VERSION) > 0 ? "available" : "latest"); }
    catch { alert("Update-Prüfung fehlgeschlagen"); } finally { setChecking(false); }
  };
  const cmp = (a: string, b: string) => { const pa = a.split(".").map(Number), pb = b.split(".").map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) > (pb[i] || 0)) return 1; if ((pa[i] || 0) < (pb[i] || 0)) return -1; } return 0; };

  if (!s) return null;
  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">EINSTELLUNGEN</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-7">
        <div>
          <div className="section-label mb-2">Admin Name</div>
          <div className="text-white/50 text-xs mb-3">Erscheint auf Startseite, Login und Admin-Header (max. 20 Zeichen)</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={adminNameInput}
              onChange={(e) => setAdminNameInput(e.target.value.slice(0, 20))}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
              placeholder="z. B. Chef, Roberto, Bahaa"
              maxLength={20}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              className="flex-1 h-12 px-4 bg-black/40 border-2 border-white/15 rounded-xl text-white text-base placeholder:text-white/30 outline-none focus:border-brand-yellow caret-brand-yellow transition"
            />
            <button onClick={saveName} className="btn-primary px-5 h-12 whitespace-nowrap">SPEICHERN</button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-white/50 text-xs">Aktuell:</span>
            <span className="text-brand-yellow font-bold truncate max-w-[200px]">{currentName}</span>
            {nameSaved && <span className="text-brand-green text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-green" /> Gespeichert</span>}
          </div>
        </div>

        {/* Admin Theme */}
        <AdminThemeSection />

        <div>
          <div className="section-label mb-3">Logo</div>
          <div className="h-32 bg-surface-card border border-surface-border flex items-center justify-center mb-3 rounded-xl overflow-hidden">
            {s.logo_base64 ? <img src={s.logo_base64} className="max-h-full max-w-full object-contain" alt="" /> : <Icon d={ICONS.image} size={40} color="#71717a" />}
          </div>
          <div className="flex gap-2">
            <button onClick={() => pickImage("logo")} className="btn-ghost flex-1"><Icon d={ICONS.image} size={16} /> Bild wählen</button>
            {s.logo_base64 && <button onClick={() => upd({ logo_base64: null })} className="btn-danger flex-1">Entfernen</button>}
          </div>
        </div>
        <div>
          <div className="section-label mb-3">Hintergrund (Tablet)</div>
          <div className="flex flex-wrap gap-2.5 mb-3">
            {Object.entries(PRESET_BG).map(([k, hex]) => (
              <button key={k} onClick={() => upd({ background_type: "preset", background_value: k })} className={`w-14 h-14 rounded-md border-2 ${s.background_type === "preset" && s.background_value === k ? "border-brand-yellow" : "border-surface-border"}`} style={{ backgroundColor: hex }} />
            ))}
          </div>
          <button onClick={() => pickImage("background")} className="btn-ghost"><Icon d={ICONS.image} size={16} /> Bild als Hintergrund</button>
          {s.background_type === "image" && <div className="h-24 mt-3 border border-surface-border rounded-xl overflow-hidden"><img src={s.background_value} className="w-full h-full object-cover" alt="" /></div>}
        </div>
        <div>
          <div className="section-label mb-3">Passwort ändern</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Neues Passwort" className="input-base mb-3" />
          <button onClick={savePw} className="btn-primary h-12">SPEICHERN</button>
        </div>
        <div>
          <div className="section-label mb-3">App-Update</div>
          <div className="flex justify-between items-center bg-surface-card border border-surface-border p-4 mb-3 rounded-xl">
            <div><div className="text-xs text-white/50 font-bold tracking-wide">Aktuelle Version</div><div className="text-xl font-black mt-1">v{APP_VERSION}</div></div>
            {info && <div className="text-right"><div className="text-xs text-white/50 font-bold tracking-wide">Neueste Version</div><div className={`text-xl font-black mt-1 ${status === "available" ? "text-brand-yellow" : ""}`}>v{info.latest_version}</div></div>}
          </div>
          {status === "latest" && <div className="flex items-center gap-2 mb-2 text-brand-green text-sm font-semibold"><Icon d={ICONS.checkCircle} size={16} color="#00E676" /> Sie haben die neueste Version</div>}
          {status === "available" && info?.changelog && <div className="border-l-2 border-brand-yellow pl-3 mb-3"><div className="text-xs text-white/50 font-bold">Änderungen:</div><div className="text-sm">{info.changelog}</div></div>}
          <button onClick={check} disabled={checking} className="btn-ghost"><Icon d={ICONS.download} size={16} /> {checking ? "..." : "Nach Updates suchen"}</button>
          {status === "available" && info?.download_url && (
            <button onClick={() => { if (confirm("Update herunterladen? Daten bleiben erhalten.")) window.open(info.download_url, "_blank"); }} className="btn-primary mt-3 h-12">UPDATE HERUNTERLADEN</button>
          )}
          <p className="text-white/40 text-xs italic mt-3">Hinweis: Ihre Daten bleiben bei Updates erhalten.</p>
        </div>
      </div>
    </div>
  );
}

// ============ Admin Server ============
function AdminServer() {
  const nav = useNavigate();
  const [base, setBase] = useState(""); const [key, setKey] = useState("");
  const [apiU, setApiU] = useState(""); const [wsU, setWsU] = useState("");
  const [st, setSt] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  useEffect(() => { const c = loadServerConfig(); if (c) { setBase(c.baseUrl); setKey(c.apiKey || ""); setApiU(c.apiBaseUrl); setWsU(c.wsUrl); } }, []);
  const recompute = (v: string) => {
    setBase(v); const tr = v.trim().replace(/\/+$/, "");
    if (!tr) { setApiU(""); setWsU(""); return; }
    const a = `${tr}/api`; setApiU(a); setWsU(a.replace(/^http/, "ws") + "/ws");
  };
  const test = async () => {
    const url = base.trim().replace(/\/+$/, "");
    if (!url) { alert("Bitte Server-URL eingeben."); return; }
    if (!/^https?:\/\//i.test(url)) { alert("URL muss mit http:// oder https:// beginnen."); return; }
    setSt("testing");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const h: Record<string, string> = {}; if (key.trim()) h["X-API-Key"] = key.trim();
      const r = await fetch(`${url}/api/update-info`, { headers: h, signal: ctrl.signal });
      setSt(r.ok ? "ok" : "fail");
    } catch { setSt("fail"); } finally { clearTimeout(t); }
  };
  const save = () => {
    const url = base.trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\//i.test(url)) { alert("URL muss mit http:// oder https:// beginnen."); return; }
    saveServerConfig(url, key);
    alert(url ? "Server-Einstellungen gespeichert." : "Offline-Modus aktiviert.");
  };
  const reset = () => {
    if (!confirm("Server-Einstellungen löschen und in den Offline-Modus wechseln?")) return;
    clearServerConfig(); setBase(""); setKey(""); setApiU(""); setWsU(""); setSt("idle");
    alert("Offline-Modus aktiviert.");
  };
  const offline = !getServerConfigSync();
  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">SERVER-EINSTELLUNGEN</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-5">
        <div className={`flex items-center gap-2.5 border p-3 rounded-xl bg-surface-card ${offline ? "border-brand-orange" : "border-brand-green"}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${offline ? "bg-brand-orange" : "bg-brand-green"}`} />
          <span className="font-bold text-sm">{offline ? "Offline-Modus aktiv" : "Online – Verbunden mit Server"}</span>
        </div>
        <div><div className="section-label mb-2">Server URL</div>
          <input value={base} onChange={(e) => recompute(e.target.value)} placeholder="https://api.example.com" autoCapitalize="none" className="input-base" />
          <div className="text-white/40 text-xs italic mt-1.5">Basis-URL Ihres Servers (ohne /api)</div>
        </div>
        <div><div className="section-label mb-2">API Base URL (automatisch)</div>
          <div className="border border-dashed border-surface-border px-4 py-3 rounded-xl font-mono text-sm text-white/50">{apiU || "—"}</div>
        </div>
        <div><div className="section-label mb-2">WebSocket URL (automatisch)</div>
          <div className="border border-dashed border-surface-border px-4 py-3 rounded-xl font-mono text-sm text-white/50">{wsU || "—"}</div>
        </div>
        <div><div className="section-label mb-2">API Key (optional)</div>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Optional – nur falls Server einen Schlüssel verlangt" className="input-base" />
        </div>
        {st !== "idle" && (
          <div className={`flex items-center gap-2.5 p-3.5 border rounded-xl bg-surface-card ${st === "ok" ? "border-brand-green" : st === "fail" ? "border-brand-red" : "border-surface-border"}`}>
            {st === "testing" && <><Spin /><span>Teste Verbindung…</span></>}
            {st === "ok" && <><Icon d={ICONS.checkCircle} size={20} color="#00E676" /><span className="text-brand-green font-semibold">Verbunden</span></>}
            {st === "fail" && <><Icon d={ICONS.xCircle} size={20} color="#FF3B30" /><span className="text-brand-red font-semibold">Keine Verbindung</span></>}
          </div>
        )}
        <button onClick={test} disabled={st === "testing"} className="btn-ghost"><Icon d={ICONS.pulse} size={18} /> Verbindung testen</button>
        <button onClick={save} className="btn-primary h-12">SPEICHERN</button>
        <button onClick={reset} className="btn-danger"><Icon d={ICONS.trash} size={16} color="#FF3B30" /> Zurücksetzen (Offline-Modus)</button>
        <p className="text-white/40 text-xs italic">Wenn die Felder leer sind, arbeitet die App im Offline-Modus — alle Daten werden lokal auf dem Gerät gespeichert.</p>
      </div>
    </div>
  );
}

// ============ Tablet ============
function Tablet() {
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [s, setS] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [tick, setTick] = useState(0);  // forces re-render every second for live timer
  const [online, setOnline] = useState(!!getServerConfigSync());
  const [workflows, setWorkflows] = useState<Record<string, TaskWorkflow>>({});
  const [modal, setModal] = useState<null | { taskId: string; taskName: string; type: EventType }>(null);
  const [note, setNote] = useState("");
  // Timeline modal state (Mitarbeiter kann Zeit + Notiz markieren)
  const [tlModal, setTlModal] = useState<null | { taskId: string; taskName: string }>(null);
  const [tlTime, setTlTime] = useState("");
  const [tlNote, setTlNote] = useState("");
  const [tlBusy, setTlBusy] = useState(false);
  // Media modal (photo gallery)
  const [mediaTask, setMediaTask] = useState<Task | null>(null);
  // Collapse/Expand — visual only. Only ONE task expanded at a time.
  // Safe for Mitarbeiter: never touches workflow/timer/status/DB.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  // ---- Date navigation (same as Chef): Heute / Gestern / Morgen / Date Picker ----
  const todayISO = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const addDaysISO = (iso: string, n: number): string => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const formatGermanDateLong = (iso: string): string => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("de-DE", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
        timeZone: "Europe/Berlin",
      });
    } catch { return iso; }
  };
  const formatGermanDateShort = (iso: string): string => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("de-DE", {
        weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
        timeZone: "Europe/Berlin",
      });
    } catch { return iso; }
  };
  const [viewDate, setViewDate] = useState<string>(todayISO());
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const todayValue = todayISO();
  const isViewToday = viewDate === todayValue;
  const isViewYesterday = viewDate === addDaysISO(todayValue, -1);
  const isViewTomorrow = viewDate === addDaysISO(todayValue, 1);
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try { (el as any).showPicker?.(); el.focus(); el.click(); } catch { el.click(); }
  };
  // Install offline upload sync on mount
  useEffect(() => { const stop = installOfflineSync(() => load()); return stop; /* eslint-disable-next-line */ }, []);
  // Toast for user feedback on non-destructive workflow actions (Feierabend)
  const [toast, setToast] = useState<{ msg: string; tone: "info" | "success" } | null>(null);
  const showToast = (msg: string, tone: "info" | "success" = "success", durationMs = 3800) => {
    setToast({ msg, tone });
    window.setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), durationMs);
  };

  useEffect(() => { const u = subscribeServerConfig((c) => setOnline(!!c)); return () => { u(); }; }, []);
  const tomorrowISO = (): string => {
    // Europe/Berlin local day + 1
    const todayBerlin = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
    const d = new Date(todayBerlin + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const load = async () => {
    try {
      const [t, p, st, wfMap, tmw] = await Promise.all([
        // Tablet (Mitarbeiter): fetch by selected date — defaults to today.
        api<Task[]>(`/tasks?date=${viewDate}`).catch(() =>
          api<Task[]>(`/tasks/by-date?date=${viewDate}`).catch(() => [])
        ),
        api<SimpleItem[]>("/persons"),
        api<AppSettings>("/settings"),
        fetchAllWorkflows(),
        // Tomorrow panel (only relevant when viewing today)
        viewDate === todayValue
          ? api<Task[]>(`/tasks/by-date?date=${tomorrowISO()}`).catch(() => [])
          : Promise.resolve([]),
      ]);
      setTasks(Array.isArray(t) ? t : []);
      setPersons(p); setS(st);
      setWorkflows(wfMap);
      setTomorrowTasks(Array.isArray(tmw) ? tmw : []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => {
    setLoading(true);
    load();
    const it = setInterval(() => setNow(new Date()), 30000);
    const tk = setInterval(() => setTick((x) => x + 1), 1000); // live timer
    return () => { clearInterval(it); clearInterval(tk); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);
  useWebSocket((m) => {
    if (m?.type === "workflow_updated" && m.workflow?.task_id) {
      const wf = m.workflow as TaskWorkflow & { deleted?: boolean };
      if (wf.deleted) {
        setWorkflows((prev) => { const next = { ...prev }; delete next[wf.task_id]; return next; });
      } else {
        saveWorkflow(wf);
        setWorkflows((prev) => ({ ...prev, [wf.task_id]: wf }));
      }
      return;
    }
    if (m?.type === "tasks_updated" || m?.type === "persons_updated" || m?.type === "settings_updated") load();
  });

  const pn = (id: string) => persons.find((x) => x.id === id)?.name || "—";

  const openAction = (task: Task, type: EventType) => {
    setModal({ taskId: task.id, taskName: task.task_type, type });
    setNote("");
  };

  const confirmAction = async () => {
    if (!modal) return;
    const m = modal;
    const noteVal = note.trim();
    setModal(null); setNote("");
    const task = tasks.find((x) => x.id === m.taskId);
    const personsSnap = task?.person_ids ? [...task.person_ids] : undefined;
    const wf = await recordEvent(m.taskId, m.type, noteVal, m.taskName, personsSnap);
    setWorkflows((prev) => ({ ...prev, [m.taskId]: wf }));
    // On Feierabend: show a visible "verschoben auf morgen" toast + reload both
    // today's and tomorrow's lists so the task clearly moves to "Für morgen geplant".
    if (m.type === "feierabend") {
      showToast(`„${m.taskName}" wurde auf morgen verschoben`, "success");
      try {
        const [today, tmw] = await Promise.all([
          api<Task[]>("/tasks/today"),
          api<Task[]>(`/tasks/by-date?date=${tomorrowISO()}`).catch(() => []),
        ]);
        setTasks(today);
        setTomorrowTasks(Array.isArray(tmw) ? tmw : []);
      } catch {}
    }
  };

  const openTimeline = (task: Task) => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setTlTime(`${hh}:${mm}`);
    setTlNote("");
    setTlModal({ taskId: task.id, taskName: task.task_type });
  };

  const confirmTimeline = async () => {
    if (!tlModal) return;
    if (!/^\d{2}:\d{2}$/.test(tlTime)) { alert("Bitte Uhrzeit im Format HH:MM eingeben"); return; }
    setTlBusy(true);
    try {
      const wf = await addTimelineEntry(tlModal.taskId, tlTime, tlNote.trim(), tlModal.taskName);
      setWorkflows((prev) => ({ ...prev, [tlModal.taskId]: wf }));
      setTlModal(null); setTlNote(""); setTlTime("");
    } catch (e: any) {
      alert("Fehler: " + (e?.message || ""));
    } finally { setTlBusy(false); }
  };

  const bgType = s?.background_type || "preset"; const bgVal = s?.background_value || "dark";
  const bgColor = bgType === "preset" ? (PRESET_BG[bgVal] || "#0F0F0F") : bgType === "color" ? bgVal : "#0F0F0F";
  const bgImg = bgType === "image" ? bgVal : null;
  const dark = isDarkBg(bgColor);
  const textMuted = dark ? "rgba(255,255,255,0.65)" : "rgba(10,10,10,0.6)";

  const dateStr = now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-full relative" style={{ backgroundColor: bgColor, backgroundImage: bgImg ? `url(${bgImg})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="min-h-full" style={{ backgroundColor: bgImg ? "rgba(0,0,0,0.70)" : "transparent" }}>
        <div className="px-6 pt-5 pb-4 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            {s?.logo_base64 ? <img src={s.logo_base64} alt="" className="w-14 h-14 object-contain" /> : <div className="w-14 h-14 border-2 border-current rounded-xl flex items-center justify-center font-black text-2xl" style={{ color: dark ? "#fff" : "#000" }}>R</div>}
            <button onClick={() => nav("/")} className="p-2"><Icon d={ICONS.exit} size={22} color={textMuted} /></button>
          </div>
          <div className="flex items-baseline flex-wrap gap-5">
            <div className="text-3xl font-black tracking-[3px]" style={{ color: dark ? "#fff" : "#000" }}>
              {isViewToday ? "PLAN HEUTE" : isViewYesterday ? "PLAN GESTERN" : isViewTomorrow ? "PLAN MORGEN" : "PLAN"}
            </div>
            <div style={{ color: textMuted }}>{formatGermanDateLong(viewDate)}</div>
            {!online && <div className="flex items-center gap-1.5 border border-brand-orange bg-orange-500/15 rounded-full px-2.5 py-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-orange" /><span className="text-brand-orange text-xs font-bold">Offline Modus</span></div>}
            <div className="ml-auto" style={{ color: textMuted }}>{timeStr}</div>
          </div>
        </div>
        {/* ===== Date navigation row (Mitarbeiter sees all days) ===== */}
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewDate(addDaysISO(viewDate, -1))}
              className="w-12 h-12 rounded-xl border text-lg font-black active:scale-90 flex items-center justify-center"
              style={{ borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: dark ? "#fff" : "#000" }}
              aria-label="Vorheriger Tag"
            >◀</button>
            <button
              onClick={openDatePicker}
              className="flex-1 h-12 rounded-xl border-2 font-black flex items-center justify-center gap-2 active:scale-95 transition"
              style={isViewToday
                ? { borderColor: "#3B82F6", backgroundColor: "#3B82F622", color: "#3B82F6" }
                : { borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: dark ? "#fff" : "#000" }}
            >
              <span className="text-sm">{formatGermanDateShort(viewDate)}</span>
              <span className="opacity-70 text-base">📅</span>
            </button>
            <button
              onClick={() => setViewDate(addDaysISO(viewDate, 1))}
              className="w-12 h-12 rounded-xl border text-lg font-black active:scale-90 flex items-center justify-center"
              style={{ borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: dark ? "#fff" : "#000" }}
              aria-label="Nächster Tag"
            >▶</button>
            <input
              ref={dateInputRef}
              type="date"
              value={viewDate}
              onChange={(e) => { if (e.target.value) setViewDate(e.target.value); }}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
              aria-hidden="true"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewDate(addDaysISO(todayValue, -1))}
              className="flex-1 py-2 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition"
              style={isViewYesterday
                ? { borderColor: "#3B82F6", backgroundColor: "#3B82F622", color: "#3B82F6" }
                : { borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: textMuted }}
            >GESTERN</button>
            <button
              onClick={() => setViewDate(todayValue)}
              className="flex-1 py-2 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition"
              style={isViewToday
                ? { borderColor: "#3B82F6", backgroundColor: "#3B82F622", color: "#3B82F6" }
                : { borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: textMuted }}
            >HEUTE</button>
            <button
              onClick={() => setViewDate(addDaysISO(todayValue, 1))}
              className="flex-1 py-2 rounded-lg border-2 font-black text-[11px] tracking-[1.5px] transition"
              style={isViewTomorrow
                ? { borderColor: EVENT_COLOR.feierabend, backgroundColor: EVENT_COLOR.feierabend + "22", color: EVENT_COLOR.feierabend }
                : { borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)", backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: textMuted }}
            >MORGEN</button>
          </div>
        </div>
        <div className="p-4 space-y-3.5 pb-10">
          {loading ? <div className="flex justify-center mt-12"><Spin /></div> : tasks.length === 0 ? (
            <div className="border-2 border-dashed rounded-2xl p-12 text-center space-y-3" style={{ borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", backgroundColor: "rgba(15,15,18,0.88)" }}>
              <div className="flex justify-center"><Icon d={ICONS.clipboard} size={56} color={textMuted} /></div>
              <div className="text-xl font-bold" style={{ color: dark ? "#fff" : "#000" }}>
                {isViewToday ? "Keine Aufgaben heute" :
                 isViewYesterday ? "Keine Aufgaben gestern" :
                 isViewTomorrow ? "Keine Aufgaben für morgen" :
                 `Keine Aufgaben am ${formatGermanDateShort(viewDate)}`}
              </div>
              <div style={{ color: textMuted }}>
                {isViewToday ? "Warten auf neue Aufgaben vom Chef" : "Für diesen Tag wurden keine Aufgaben erfasst"}
              </div>
            </div>
          ) : tasks.map((t) => {
            const wf = workflows[t.id] || getWorkflow(t.id);
            const wfStatus: WorkflowStatus = wf.status;
            const allowed = allowedActions(wfStatus);
            const isRunning = wfStatus === "running";
            const totalMs = totalWorkMs(wf, isRunning ? Date.now() : undefined);
            // tick is referenced so re-render happens each second when running
            void tick;
            const lastEventColor = wf.last_event_type ? EVENT_COLOR[wf.last_event_type] : "#9CA3AF";
            const isExpanded = expandedId === t.id;
            const personsLabel = t.person_ids.map(pn).join(" · ") || "Keine Personen";
            const isContinuation = !!t.continue_tomorrow && t.next_work_date === viewDate && t.task_date !== viewDate;
            return (
              <div key={t.id} className="border rounded-2xl shadow-lg overflow-hidden" style={{ backgroundColor: dark ? "rgba(15,15,18,0.88)" : "rgba(255,255,255,0.92)", borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", color: dark ? "#fff" : "#000", maxWidth: "100%" }}>
                {/* Compact header — tap to expand/collapse. Pure visual, no workflow mutation. */}
                <button
                  type="button"
                  onClick={() => toggleExpand(t.id)}
                  aria-expanded={isExpanded}
                  className="w-full px-4 py-3 text-left transition-colors"
                  style={{ color: "inherit", backgroundColor: "transparent" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div
                        className="font-extrabold text-[17px] leading-tight"
                        style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal" }}
                      >
                        {t.task_type} <span style={{ color: textMuted }}>·</span> Haus {t.haus}
                      </div>
                      <div
                        className="text-sm italic"
                        style={{ color: textMuted, overflowWrap: "break-word", wordBreak: "break-word" }}
                      >
                        {personsLabel}
                      </div>
                      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[wfStatus] }} />
                        <span className="text-xs font-black tracking-wide" style={{ color: STATUS_COLOR[wfStatus] }}>
                          {STATUS_LABEL_DE[wfStatus]}
                        </span>
                        {isContinuation && (
                          <span className="text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: EVENT_COLOR.feierabend + "25", color: EVENT_COLOR.feierabend }}>
                            ↻ Fortsetzung von gestern
                          </span>
                        )}
                        {isRunning && (
                          <span className="ml-auto text-xs font-mono tabular-nums" style={{ color: textMuted }}>
                            {formatDuration(totalMs)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 rounded-full border flex items-center justify-center text-xs shrink-0 transition-transform"
                      style={{
                        transform: isExpanded ? "rotate(180deg)" : "none",
                        borderColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
                        color: textMuted,
                      }}
                      aria-hidden
                    >
                      ▼
                    </div>
                  </div>
                </button>

                {/* Expanded body — full details, unchanged behaviour */}
                {isExpanded && (
                <div className="px-4 pb-4 pt-1 space-y-2.5 border-t" style={{ borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 shrink-0">
                    <span className="font-extrabold">{t.time_from}</span>
                    <span className="opacity-60">—</span>
                    <span className="font-extrabold">{t.time_to}</span>
                  </div>
                  <div className="flex-1 min-w-[120px] max-w-full overflow-hidden">
                    <div
                      className="text-xs font-bold tracking-widest"
                      style={{ color: textMuted, overflowWrap: "break-word", wordBreak: "break-word" }}
                    >
                      HAUS {t.haus} · STATION {t.station}
                    </div>
                  </div>
                </div>

                {t.description && (
                  <div className="text-sm" style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal" }}>{t.description}</div>
                )}

                {/* Workflow info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                  <InfoCell label="Start" value={formatTime(wf.started_at)} dark={dark} />
                  <InfoCell label="Pause seit" value={wfStatus === "paused" ? formatTime(wf.paused_at) : "—"} dark={dark} highlight={wfStatus === "paused" ? "#FF9500" : undefined} />
                  <InfoCell label="Beendet" value={formatTime(wf.finished_at)} dark={dark} highlight={wfStatus === "finished" ? "#00E676" : undefined} />
                  <InfoCell
                    label={wfStatus === "finished" ? "Gesamt" : "Arbeitszeit"}
                    value={formatDuration(totalMs)}
                    dark={dark}
                    mono
                    highlight={isRunning ? "#3B82F6" : wfStatus === "finished" ? "#00E676" : undefined}
                  />
                </div>

                {/* Aktuelle Notiz (current/last note) */}
                {wf.last_note && wf.last_event_type && (
                  <div className="border-l-2 pl-2.5 mt-1" style={{ borderColor: lastEventColor }}>
                    <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: lastEventColor }}>
                      Aktuelle Notiz · {EVENT_LABEL[wf.last_event_type]}
                    </div>
                    <div className="text-sm italic" style={{ color: lastEventColor }}>{wf.last_note}</div>
                  </div>
                )}

                {/* Vollständiger Verlauf aller Notizen / Ereignisse */}
                <EventHistoryList events={wf.events || []} dark={dark} max={20} />

                {/* 4 fixed buttons: Vorbereiten / Starten / Pause·Fortsetzen / Beenden */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  <ActionBtn label="Vorbereiten" color={EVENT_COLOR.vorbereiten} disabled={!allowed.vorbereiten} onClick={() => openAction(t, "vorbereiten")} dark={dark} />
                  <ActionBtn label="Starten" color={EVENT_COLOR.starten} disabled={!allowed.starten} onClick={() => openAction(t, "starten")} dark={dark} />
                  {wfStatus === "paused" || wfStatus === "deferred" ? (
                    <ActionBtn label="Fortsetzen" color={EVENT_COLOR.fortsetzen} disabled={!allowed.fortsetzen} onClick={() => openAction(t, "fortsetzen")} dark={dark} />
                  ) : (
                    <ActionBtn label="Pause" color={EVENT_COLOR.pause} disabled={!allowed.pause} onClick={() => openAction(t, "pause")} dark={dark} />
                  )}
                  <ActionBtn label="Beenden" color={EVENT_COLOR.beenden} disabled={!allowed.beenden} onClick={() => openAction(t, "beenden")} dark={dark} />
                </div>

                {/* Feierabend + Media + Timeline row (Mitarbeiter-Aktionen, informativ) */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    onClick={() => openAction(t, "feierabend")}
                    disabled={!allowed.feierabend}
                    className="h-11 rounded-xl border-2 font-black text-[11px] tracking-[1.5px] active:scale-95 transition flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      borderColor: EVENT_COLOR.feierabend,
                      backgroundColor: allowed.feierabend ? EVENT_COLOR.feierabend : (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                      color: allowed.feierabend ? "#FFFFFF" : (dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"),
                      boxShadow: allowed.feierabend ? `0 4px 14px ${EVENT_COLOR.feierabend}66` : "none",
                    }}
                  >
                    FEIERABEND
                  </button>
                  <button
                    onClick={() => setMediaTask(t)}
                    className="h-11 rounded-xl border-2 font-black text-[11px] tracking-[1.5px] active:scale-95 transition flex items-center justify-center gap-1.5"
                    style={{ borderColor: "#EC4899", backgroundColor: "#EC489915", color: "#EC4899" }}
                  >
                    📷 MEDIA ({t.photos?.length || 0})
                  </button>
                  <button
                    onClick={() => openTimeline(t)}
                    className="h-11 rounded-xl border-2 font-black text-[11px] tracking-[1.5px] active:scale-95 transition flex items-center justify-center gap-1.5"
                    style={{ borderColor: EVENT_COLOR.timeline, backgroundColor: EVENT_COLOR.timeline + "15", color: EVENT_COLOR.timeline }}
                  >
                    <Icon d={ICONS.timeline} size={13} color={EVENT_COLOR.timeline} /> TIMELINE
                  </button>
                </div>
                </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ============ FÜR MORGEN GEPLANT ============ */}
        {tomorrowTasks.length > 0 && (
          <div className="mt-10 pt-5 border-t" style={{ borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EVENT_COLOR.feierabend, boxShadow: `0 0 10px ${EVENT_COLOR.feierabend}` }} />
              <div className="text-xs font-black tracking-[3px] uppercase" style={{ color: EVENT_COLOR.feierabend }}>Für morgen geplant</div>
              <span className="text-xs font-bold opacity-60" style={{ color: dark ? "#fff" : "#000" }}>({tomorrowTasks.length})</span>
            </div>
            <div className="space-y-2.5">
              {tomorrowTasks.map((t) => {
                const wf = workflows[t.id];
                return (
                  <div key={t.id} className="rounded-xl border-2 overflow-hidden"
                    style={{
                      borderColor: EVENT_COLOR.feierabend + "55",
                      backgroundColor: dark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.06)",
                      color: dark ? "#fff" : "#000",
                      maxWidth: "100%",
                    }}>
                    <div className="flex items-start gap-3 p-3 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0" style={{ backgroundColor: EVENT_COLOR.feierabend + "22", color: EVENT_COLOR.feierabend }}>
                        <span className="font-extrabold text-sm">{t.time_from}</span>
                        <span className="opacity-60">—</span>
                        <span className="font-extrabold text-sm">{t.time_to}</span>
                      </div>
                      <div className="flex-1 min-w-[120px] max-w-full overflow-hidden">
                        <div className="text-base font-extrabold leading-tight"
                          style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", maxWidth: "100%" }}>
                          {t.task_type}
                        </div>
                        <div className="text-[10px] font-bold tracking-widest mt-0.5 opacity-70"
                          style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
                          HAUS {t.haus} · STATION {t.station} · {t.person_ids.map(pn).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border shrink-0"
                        style={{ borderColor: EVENT_COLOR.feierabend + "66", backgroundColor: EVENT_COLOR.feierabend + "15", color: EVENT_COLOR.feierabend }}>
                        <span className="text-[10px] font-black tracking-wider">WIRD FORTGESETZT</span>
                      </div>
                    </div>
                    {wf && wf.events && wf.events.length > 0 && (
                      <div className="px-3 pb-3 text-[11px] opacity-80" style={{ color: dark ? "#fff" : "#000" }}>
                        <span className="font-bold">Bereits gearbeitet:</span>{" "}
                        <span className="font-mono tabular-nums">{formatDuration(totalWorkMs(wf))}</span>
                        <span className="mx-1.5 opacity-40">·</span>
                        <span className="font-bold">Letzte Aktion:</span>{" "}
                        <span>{EVENT_LABEL[wf.last_event_type as EventType] || "—"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============ TOAST (Feierabend-Bestätigung) ============ */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl border-2 max-w-[92%]"
          style={{
            backgroundColor: "rgba(24,24,28,0.97)",
            borderColor: toast.tone === "success" ? EVENT_COLOR.feierabend : "#3B82F6",
            color: "#fff",
            boxShadow: `0 8px 24px ${(toast.tone === "success" ? EVENT_COLOR.feierabend : "#3B82F6")}66`,
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: toast.tone === "success" ? EVENT_COLOR.feierabend : "#3B82F6" }} />
            <div className="text-sm font-bold" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>{toast.msg}</div>
          </div>
        </div>
      )}
      {modal && (
        <NoteModal
          title={EVENT_LABEL[modal.type]}
          color={EVENT_COLOR[modal.type]}
          taskName={modal.taskName}
          note={note}
          setNote={setNote}
          onCancel={() => { setModal(null); setNote(""); }}
          onConfirm={confirmAction}
        />
      )}
      {tlModal && (
        <TimelineModal
          taskName={tlModal.taskName}
          time={tlTime}
          setTime={setTlTime}
          note={tlNote}
          setNote={setTlNote}
          busy={tlBusy}
          onCancel={() => { setTlModal(null); setTlNote(""); setTlTime(""); }}
          onConfirm={confirmTimeline}
        />
      )}
      {mediaTask && (
        <MediaModal
          task={mediaTask}
          isAdmin={false}
          currentUserName={mediaTask.person_ids.map(pn).join(", ") || "Mitarbeiter"}
          onClose={() => setMediaTask(null)}
          onPhotosChanged={() => load()}
        />
      )}
    </div>
  );
}

const InfoCell = ({ label, value, dark, mono, highlight }: { label: string; value: string; dark: boolean; mono?: boolean; highlight?: string }) => (
  <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: highlight ? highlight + "55" : (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"), backgroundColor: highlight ? highlight + "10" : (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)") }}>
    <div className="text-[10px] font-bold tracking-widest uppercase opacity-60">{label}</div>
    <div className={`text-sm font-bold ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: highlight || (dark ? "#fff" : "#000") }}>{value}</div>
  </div>
);

const ActionBtn = ({ label, color, disabled, onClick, dark }: { label: string; color: string; disabled?: boolean; onClick: () => void; dark: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="h-12 rounded-xl font-black text-sm tracking-wide transition active:scale-95 disabled:cursor-not-allowed"
    style={{
      backgroundColor: disabled ? (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)") : color,
      color: disabled ? (dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)") : "#FFFFFF",
      border: `2px solid ${disabled ? "transparent" : color}`,
      opacity: disabled ? 0.55 : 1,
      boxShadow: disabled ? "none" : `0 4px 14px ${color}55`,
    }}
  >
    {label}
  </button>
);

const NoteModal = ({ title, color, taskName, note, setNote, onCancel, onConfirm }: { title: string; color: string; taskName: string; note: string; setNote: (v: string) => void; onCancel: () => void; onConfirm: () => void; }) => (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
    <div className="w-full max-w-xl rounded-2xl p-5 space-y-3" style={{ backgroundColor: "rgba(24,24,28,0.97)", border: `2px solid ${color}` }}>
      <div className="flex items-center gap-2.5">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <div className="text-xl font-black tracking-wide" style={{ color }}>{title}</div>
      </div>
      <div className="text-white/70 text-sm">Aufgabe: <span className="font-bold text-white">{taskName}</span></div>
      <div className="text-white/60 text-sm">Notiz hinzufügen (optional):</div>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notiz zu diesem Schritt..."
        rows={4}
        className="w-full rounded-xl p-3.5 resize-none outline-none font-medium"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1.5px solid ${color}66`, color, caretColor: color }}
      />
      <div className="flex gap-3 mt-2">
        <button onClick={onCancel} className="flex-1 h-13 py-3 border-2 border-white/15 bg-white/5 text-white rounded-xl font-black tracking-wide">ABBRECHEN</button>
        <button
          onClick={onConfirm}
          className="flex-1 h-13 py-3 rounded-xl font-black tracking-wide text-white"
          style={{ backgroundColor: color, boxShadow: `0 4px 14px ${color}66` }}
        >
          BESTÄTIGEN
        </button>
      </div>
    </div>
  </div>
);

// ============ TimelineModal — Mitarbeiter markiert einen Zeitpunkt + Notiz ============
const TimelineModal = ({ taskName, time, setTime, note, setNote, busy, onCancel, onConfirm }: {
  taskName: string; time: string; setTime: (v: string) => void; note: string; setNote: (v: string) => void; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) => {
  const color = EVENT_COLOR.timeline;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="w-full max-w-xl rounded-2xl p-5 space-y-3" style={{ backgroundColor: "rgba(24,24,28,0.97)", border: `2px solid ${color}` }}>
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <div className="text-xl font-black tracking-wide" style={{ color }}>Timeline</div>
        </div>
        <div className="text-white/70 text-sm">Aufgabe: <span className="font-bold text-white">{taskName}</span></div>

        <div className="space-y-1.5">
          <div className="text-white/60 text-xs font-bold tracking-wider uppercase">Uhrzeit (HH:MM · 24 h)</div>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            step={60}
            className="w-full rounded-xl px-4 py-3 outline-none font-mono tabular-nums text-2xl font-black"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1.5px solid ${color}66`, color: "#fff", caretColor: color, colorScheme: "dark" }}
          />
        </div>

        <div className="space-y-1.5">
          <div className="text-white/60 text-xs font-bold tracking-wider uppercase">Notiz</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ihre Notiz zu diesem Zeitpunkt..."
            rows={4}
            className="w-full rounded-xl p-3.5 resize-none outline-none font-medium"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1.5px solid ${color}66`, color: "#fff", caretColor: color }}
          />
        </div>

        <div className="rounded-lg p-2.5 text-[11px] leading-relaxed" style={{ backgroundColor: color + "12", border: `1px solid ${color}44`, color: "#fff" }}>
          <span style={{ color }}>ℹ</span> Timeline-Einträge ändern weder den Status der Aufgabe, noch die Arbeitszeit oder Pause-Zeit. Sie ergänzen nur den Verlauf.
        </div>

        <div className="flex gap-3 mt-1">
          <button disabled={busy} onClick={onCancel} className="flex-1 h-13 py-3 border-2 border-white/15 bg-white/5 text-white rounded-xl font-black tracking-wide disabled:opacity-50">ABBRECHEN</button>
          <button
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 h-13 py-3 rounded-xl font-black tracking-wide text-white disabled:opacity-50"
            style={{ backgroundColor: color, boxShadow: `0 4px 14px ${color}66` }}
          >
            {busy ? "SPEICHERN…" : "SPEICHERN"}
          </button>
        </div>
      </div>
    </div>
  );
};

const GBtn_unused = ({ onClick, dot, label, dark }: any) => (
  <button onClick={onClick} className="flex items-center gap-2 px-3.5 py-2.5 rounded-full border transition active:scale-95" style={{ backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)", color: dark ? "#fff" : "#000" }}>
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
    <span className="text-xs font-semibold">{label}</span>
  </button>
);
void GBtn_unused;
