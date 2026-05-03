import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Icon, ICONS } from "./components/Icons";
import { api, setToken } from "./lib/api";
import { useWebSocket } from "./lib/useWebSocket";
import { loadServerConfig, saveServerConfig, clearServerConfig, getServerConfigSync, subscribeServerConfig, DEFAULT_SERVER } from "./lib/serverConfig";
import { initLocalStore } from "./lib/localStore";
import { STATUS_LABEL, STATUS_DOT, PRESET_BG, isDarkBg, APP_VERSION } from "./lib/types";
import type { SimpleItem, Task, AppSettings, TaskStatus } from "./lib/types";

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
      <Route path="/admin/manage" element={<AdminManage />} />
      <Route path="/admin/archive" element={<AdminArchive />} />
      <Route path="/admin/settings" element={<AdminSettings />} />
      <Route path="/admin/server" element={<AdminServer />} />
      <Route path="/tablet" element={<Tablet />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

const Spin = () => <div className="w-8 h-8 border-4 border-brand-yellow border-t-transparent rounded-full animate-spin" />;

// ============ Landing ============
function Landing() {
  const nav = useNavigate();
  return (
    <div className="min-h-full p-6 flex flex-col justify-between">
      <div className="mt-10">
        <h1 className="text-4xl font-black tracking-[2px]">REINIGUNG</h1>
        <p className="text-white/50 text-sm tracking-[4px] mt-2 uppercase">Aufgabenverwaltung</p>
      </div>
      <div className="space-y-5">
        <button onClick={() => nav("/admin/login")} className="w-full bg-surface-card border-2 border-brand-yellow p-7 text-left active:opacity-80 rounded-2xl">
          <Icon d={ICONS.phone} size={40} color="#FFD600" />
          <div className="text-white font-black text-2xl tracking-[3px] mt-3">ADMIN</div>
          <div className="text-white/50 text-xs tracking-wider">Telefon · Aufgaben verwalten</div>
        </button>
        <button onClick={() => nav("/tablet")} className="w-full bg-surface-card border-2 border-brand-green p-7 text-left active:opacity-80 rounded-2xl">
          <Icon d={ICONS.tablet} size={40} color="#00E676" />
          <div className="text-white font-black text-2xl tracking-[3px] mt-3">TABLET</div>
          <div className="text-white/50 text-xs tracking-wider">Wandanzeige · Aufgaben heute</div>
        </button>
      </div>
      <p className="text-white/40 text-center text-xs tracking-[3px] uppercase">Gerät wählen</p>
    </div>
  );
}

// ============ Admin Login ============
function AdminLogin() {
  const nav = useNavigate();
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
        <h1 className="text-3xl font-black tracking-[2px] mt-3">ADMIN BEREICH</h1>
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(!!getServerConfigSync());

  useEffect(() => { const u = subscribeServerConfig((c) => setOnline(!!c)); return () => { u(); }; }, []);
  const load = async () => {
    try {
      const [t, p] = await Promise.all([api<Task[]>("/tasks/today"), api<SimpleItem[]>("/persons")]);
      setTasks(t); setPersons(p);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useWebSocket((m) => { if (m?.type === "tasks_updated" || m?.type === "persons_updated") load(); });

  const personName = (id: string) => persons.find((p) => p.id === id)?.name || "—";
  const logout = () => { setToken(null); nav("/"); };
  const archiveAll = async () => {
    if (!confirm("Alle heutigen Aufgaben archivieren?")) return;
    try { await api("/tasks/archive-now", { method: "POST", auth: true }); load(); } catch (e: any) { alert("Fehler: " + (e?.message || "")); }
  };
  const del = async (id: string) => {
    if (!confirm("Aufgabe entfernen? Sie wird sofort archiviert.")) return;
    try { await api(`/tasks/${id}`, { method: "DELETE", auth: true }); load(); } catch {}
  };
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center justify-between p-5">
        <div><div className="text-2xl font-black tracking-widest">ADMIN</div><div className="text-white/50 text-xs tracking-wider">Aufgaben heute · {tasks.length}</div></div>
        <button onClick={logout} className="p-2"><Icon d={ICONS.logout} size={22} /></button>
      </div>
      <div className={`mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-full border bg-surface-card ${online ? "border-brand-green" : "border-brand-orange"}`}>
        <span className={`w-2 h-2 rounded-full ${online ? "bg-brand-green" : "bg-brand-orange"}`} />
        <span className="flex-1 text-xs font-bold">{online ? "Online · Server verbunden" : "Offline-Modus · Lokale Daten"}</span>
        <button onClick={() => nav("/admin/server")} className="border border-surface-border px-2.5 py-1 rounded-md text-xs font-bold">Server</button>
      </div>
      <div className="flex gap-2 px-3 pb-3 border-b border-surface-border">
        <ToolBtn onClick={() => nav("/admin/create")} icon={ICONS.plus} label="Neu" primary />
        <ToolBtn onClick={() => nav("/admin/manage")} icon={ICONS.list} label="Listen" />
        <ToolBtn onClick={() => nav("/admin/archive")} icon={ICONS.archive} label="Archiv" />
        <ToolBtn onClick={() => nav("/admin/settings")} icon={ICONS.settings} label="Einstell." />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {loading ? <div className="flex justify-center mt-12"><Spin /></div> : tasks.length === 0 ? (
          <div className="mt-16 text-center text-white/50 space-y-2">
            <div className="flex justify-center"><Icon d={ICONS.clipboard} size={48} /></div>
            <div className="text-lg font-bold text-white">Keine Aufgaben heute</div>
            <div className="text-sm">Tippen Sie auf NEU, um eine Aufgabe hinzuzufügen.</div>
          </div>
        ) : tasks.map((t) => (
          <div key={t.id} className="bg-surface-card border border-surface-border p-3.5 space-y-1.5 rounded-xl">
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <div className="text-[17px] font-extrabold">{t.task_type}</div>
                <div className="text-white/50 text-xs tracking-wider mt-0.5">Haus {t.haus} · Station {t.station}</div>
              </div>
              <div className="flex items-center gap-1.5 border rounded-full px-2.5 py-1" style={{ borderColor: STATUS_DOT[t.status] + "55", backgroundColor: STATUS_DOT[t.status] + "15" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[t.status] }} />
                <span className="text-[10px] font-bold tracking-wide">{STATUS_LABEL[t.status]}</span>
              </div>
            </div>
            {t.description && <div className="text-sm">{t.description}</div>}
            <div className="text-white/50 text-sm italic">{t.person_ids.map(personName).join(", ") || "Keine Personen"}</div>
            <div className="flex justify-between items-center mt-1">
              <div className="text-brand-yellow font-bold text-sm">{t.time_from} – {t.time_to}</div>
              <button onClick={() => del(t.id)}><Icon d={ICONS.trash} size={18} color="#FF3B30" /></button>
            </div>
            {t.accepted_at && <div className="text-brand-green text-xs font-semibold">✓ Angenommen: {fmt(t.accepted_at)}</div>}
            {t.finished_at && <div className="text-brand-green text-xs font-semibold">✓ Erledigt: {fmt(t.finished_at)}</div>}
            {t.accept_reason && <div className="text-brand-orange text-xs italic">↳ Nicht annehmbar: {t.accept_reason}</div>}
            {t.not_finished_reason && <div className="text-brand-orange text-xs italic">↳ Nicht beendbar: {t.not_finished_reason}</div>}
            {t.not_done_reason && <div className="text-brand-orange text-xs italic">↳ Nicht erledigt: {t.not_done_reason}</div>}
          </div>
        ))}
      </div>
      {tasks.length > 0 && (
        <button onClick={archiveAll} className="m-4 mt-0 bg-brand-yellow text-black font-black tracking-[2px] h-14 flex items-center justify-center gap-2 rounded-xl">
          <Icon d={ICONS.archive} size={18} color="#000" /> HEUTE JETZT ARCHIVIEREN
        </button>
      )}
    </div>
  );
}

const ToolBtn = ({ onClick, icon, label, primary }: any) => (
  <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg border text-xs font-bold tracking-wide ${primary ? "bg-brand-yellow border-brand-yellow text-black" : "bg-surface-card border-surface-border text-white"}`}>
    <Icon d={icon} size={16} color={primary ? "#000" : "#fff"} /> {label}
  </button>
);

// ============ Admin Create ============
function AdminCreate() {
  const nav = useNavigate();
  const [tt, setTt] = useState<SimpleItem[]>([]); const [hs, setHs] = useState<SimpleItem[]>([]);
  const [st, setSt] = useState<SimpleItem[]>([]); const [pp, setPp] = useState<SimpleItem[]>([]);
  const [taskType, setTaskType] = useState(""); const [haus, setHaus] = useState(""); const [station, setStation] = useState("");
  const [desc, setDesc] = useState(""); const [pids, setPids] = useState<string[]>([]);
  const [tFrom, setTFrom] = useState("08:00"); const [tTo, setTTo] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [addFor, setAddFor] = useState<null | { kind: string; label: string }>(null);
  const [newName, setNewName] = useState("");

  const load = async () => {
    const [a, b, c, d] = await Promise.all([
      api<SimpleItem[]>("/task-types"), api<SimpleItem[]>("/houses"),
      api<SimpleItem[]>("/stations"), api<SimpleItem[]>("/persons")
    ]);
    setTt(a); setHs(b); setSt(c); setPp(d);
  };
  useEffect(() => { load(); }, []);

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
    setSaving(true);
    try {
      await api("/tasks", { method: "POST", auth: true, body: { task_type: taskType, haus, station, description: desc, person_ids: pids, time_from: tFrom, time_to: tTo } });
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
        <div className="font-black tracking-[3px] text-sm">NEUE AUFGABE</div>
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
        <div className="flex gap-3">
          <div className="flex-1"><label className="section-label">Von</label><input type="time" value={tFrom} onChange={(e) => setTFrom(e.target.value)} className="input-base mt-2" /></div>
          <div className="flex-1"><label className="section-label">Bis</label><input type="time" value={tTo} onChange={(e) => setTTo(e.target.value)} className="input-base mt-2" /></div>
        </div>
      </div>
      <button onClick={submit} disabled={saving} className="btn-primary m-4 mt-0">{saving ? "..." : "AUFGABE ERSTELLEN"}</button>
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
  useEffect(() => { (async () => {
    const [d, p] = await Promise.all([api<{ dates: string[] }>("/tasks/archive"), api<SimpleItem[]>("/persons")]);
    setDates(d.dates); setPersons(p);
  })(); }, []);
  const loadDate = async (date: string) => { setSelected(date); const r = await api<{ tasks: Task[] }>(`/tasks/archive?date=${date}`); setTasks(r.tasks); };
  const pn = (id: string) => persons.find((x) => x.id === id)?.name || "—";
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (selected) return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => { setSelected(null); setTasks([]); }}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">{selected}</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-3">
        {tasks.length === 0 && <div className="text-white/50 text-center mt-10">Keine Aufgaben in diesem Archiv</div>}
        {tasks.map((t) => (
          <div key={t.id} className="bg-surface-card border border-surface-border p-3.5 rounded-xl space-y-1.5">
            <div className="flex gap-2 items-start">
              <div className="flex-1"><div className="font-extrabold">{t.task_type}</div><div className="text-white/50 text-xs">Haus {t.haus} · Station {t.station} · {t.time_from}–{t.time_to}</div></div>
              <div className="flex items-center gap-1.5 border rounded-full px-2.5 py-1" style={{ borderColor: STATUS_DOT[t.status] + "55", backgroundColor: STATUS_DOT[t.status] + "15" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[t.status] }} />
                <span className="text-[10px] font-bold">{STATUS_LABEL[t.status]}</span>
              </div>
            </div>
            {t.description && <div className="text-sm">{t.description}</div>}
            <div className="text-white/50 text-sm italic">{t.person_ids.map(pn).join(", ") || "—"}</div>
            {t.accepted_at && <div className="text-brand-green text-xs font-semibold">✓ Angenommen: {fmt(t.accepted_at)}</div>}
            {t.finished_at && <div className="text-brand-green text-xs font-semibold">✓ Erledigt: {fmt(t.finished_at)}</div>}
            {t.accept_reason && <div className="text-brand-orange text-xs italic">↳ Nicht annehmbar: {t.accept_reason}</div>}
            {t.not_finished_reason && <div className="text-brand-orange text-xs italic">↳ Nicht beendbar: {t.not_finished_reason}</div>}
            {t.not_done_reason && <div className="text-brand-orange text-xs italic">↳ Nicht erledigt: {t.not_done_reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <button onClick={() => nav(-1)}><Icon d={ICONS.back} size={28} /></button>
        <div className="font-black tracking-[3px] text-sm">ARCHIV</div>
        <div className="w-7" />
      </div>
      <div className="p-4 space-y-2">
        {dates.length === 0 && <div className="text-white/50 text-center mt-16">Noch keine archivierten Tage</div>}
        {dates.map((d) => (
          <button key={d} onClick={() => loadDate(d)} className="w-full bg-surface-card border border-surface-border px-4 py-4 flex items-center gap-3 rounded-xl">
            <Icon d={ICONS.calendar} size={20} color="#FFD600" />
            <span className="flex-1 text-left font-bold">{d}</span>
            <Icon d={ICONS.chevronRight} size={18} color="#71717a" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ Admin Settings ============
function AdminSettings() {
  const nav = useNavigate();
  const [s, setS] = useState<AppSettings | null>(null);
  const [pw, setPw] = useState("");
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<{ latest_version: string; download_url: string; changelog?: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "latest" | "available">("idle");

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
  const [persons, setPersons] = useState<SimpleItem[]>([]);
  const [s, setS] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [modal, setModal] = useState<null | { taskId: string; status: TaskStatus; title: string }>(null);
  const [reason, setReason] = useState("");
  const [online, setOnline] = useState(!!getServerConfigSync());

  useEffect(() => { const u = subscribeServerConfig((c) => setOnline(!!c)); return () => { u(); }; }, []);
  const load = async () => {
    try {
      const [t, p, st] = await Promise.all([api<Task[]>("/tasks/today"), api<SimpleItem[]>("/persons"), api<AppSettings>("/settings")]);
      setTasks(t); setPersons(p); setS(st);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); const it = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(it); }, []);
  useWebSocket((m) => { if (m?.type === "tasks_updated" || m?.type === "persons_updated" || m?.type === "settings_updated") load(); });

  const pn = (id: string) => persons.find((x) => x.id === id)?.name || "—";
  const updateStatus = async (id: string, status: TaskStatus, reason?: string) => { try { await api(`/tasks/${id}/status`, { method: "PATCH", body: { status, reason } }); load(); } catch {} };
  const act = (t: Task, status: TaskStatus, title: string) => {
    if (status === "cannot_accept" || status === "not_finished" || status === "not_done") { setModal({ taskId: t.id, status, title }); setReason(""); }
    else updateStatus(t.id, status);
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
            <div className="text-3xl font-black tracking-[3px]" style={{ color: dark ? "#fff" : "#000" }}>PLAN HEUTE</div>
            <div style={{ color: textMuted }}>{dateStr}</div>
            {!online && <div className="flex items-center gap-1.5 border border-brand-orange bg-orange-500/15 rounded-full px-2.5 py-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-orange" /><span className="text-brand-orange text-xs font-bold">Offline Modus</span></div>}
            <div className="ml-auto" style={{ color: textMuted }}>{timeStr}</div>
          </div>
        </div>
        <div className="p-4 space-y-3.5 pb-10">
          {loading ? <div className="flex justify-center mt-12"><Spin /></div> : tasks.length === 0 ? (
            <div className="border-2 border-dashed rounded-2xl p-12 text-center space-y-3" style={{ borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", backgroundColor: "rgba(15,15,18,0.88)" }}>
              <div className="flex justify-center"><Icon d={ICONS.clipboard} size={56} color={textMuted} /></div>
              <div className="text-xl font-bold" style={{ color: dark ? "#fff" : "#000" }}>Keine Aufgaben heute</div>
              <div style={{ color: textMuted }}>Warten auf neue Aufgaben vom Admin</div>
            </div>
          ) : tasks.map((t) => (
            <div key={t.id} className="border rounded-2xl p-4 space-y-2.5 shadow-lg" style={{ backgroundColor: dark ? "rgba(15,15,18,0.88)" : "rgba(255,255,255,0.92)", borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", color: dark ? "#fff" : "#000" }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5">
                  <span className="font-extrabold">{t.time_from}</span>
                  <span className="opacity-60">—</span>
                  <span className="font-extrabold">{t.time_to}</span>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <div className="text-lg font-extrabold">{t.task_type}</div>
                  <div className="text-xs font-bold tracking-widest" style={{ color: textMuted }}>HAUS {t.haus} · STATION {t.station}</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: STATUS_DOT[t.status] + "55", backgroundColor: STATUS_DOT[t.status] + "15" }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT[t.status] }} />
                  <span className="text-xs font-bold">{STATUS_LABEL[t.status]}</span>
                </div>
              </div>
              {t.description && <div className="text-sm">{t.description}</div>}
              <div className="text-sm italic" style={{ color: textMuted }}>{t.person_ids.map(pn).join(" · ") || "—"}</div>
              {t.accept_reason && <div className="border-l-2 pl-2.5" style={{ borderColor: "rgba(255,255,255,0.2)" }}><div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: textMuted }}>Nicht annehmbar</div><div className="text-sm italic">{t.accept_reason}</div></div>}
              {t.not_finished_reason && <div className="border-l-2 pl-2.5" style={{ borderColor: "rgba(255,255,255,0.2)" }}><div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: textMuted }}>Nicht beendbar</div><div className="text-sm italic">{t.not_finished_reason}</div></div>}
              {t.not_done_reason && <div className="border-l-2 pl-2.5" style={{ borderColor: "rgba(255,255,255,0.2)" }}><div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: textMuted }}>Nicht erledigt</div><div className="text-sm italic">{t.not_done_reason}</div></div>}
              <div className="flex flex-wrap gap-2 mt-2">
                <GBtn onClick={() => act(t, "accepted", "Annehmen")} dot="#FFD600" label="Annehmen" dark={dark} />
                <GBtn onClick={() => act(t, "finished", "Beenden")} dot="#00E676" label="Beenden" dark={dark} />
                <GBtn onClick={() => act(t, "cannot_accept", "Nicht annehmbar")} dot="#FF9500" label="Nicht annehmbar" dark={dark} />
                <GBtn onClick={() => act(t, "not_finished", "Nicht beendbar")} dot="#FF9500" label="Nicht beendbar" dark={dark} />
                <GBtn onClick={() => act(t, "not_done", "Nicht erledigt")} dot="#FF3B30" label="Nicht erledigt" dark={dark} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-xl bg-[rgba(24,24,28,0.95)] border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="text-xl font-extrabold tracking-wide">{modal.title}</div>
            <div className="text-white/60 text-sm">Bitte Grund eingeben:</div>
            <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund..." rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl p-3.5 text-white resize-none outline-none focus:border-brand-yellow" />
            <div className="flex gap-3 mt-2">
              <button onClick={() => setModal(null)} className="flex-1 h-14 border-2 border-white/10 bg-white/5 rounded-xl font-black tracking-wide">ABBRECHEN</button>
              <button onClick={() => { updateStatus(modal.taskId, modal.status, reason.trim()); setModal(null); }} className="flex-1 h-14 bg-brand-yellow text-black rounded-xl font-black tracking-wide">BESTÄTIGEN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const GBtn = ({ onClick, dot, label, dark }: any) => (
  <button onClick={onClick} className="flex items-center gap-2 px-3.5 py-2.5 rounded-full border transition active:scale-95" style={{ backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)", color: dark ? "#fff" : "#000" }}>
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
    <span className="text-xs font-semibold">{label}</span>
  </button>
);
