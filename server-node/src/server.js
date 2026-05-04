import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { WebSocketServer } from 'ws';
import http from 'http';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';

// ===== ENV =====
const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'reinigung';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = 'admin-session-token';

if (!MONGO_URL) {
  console.error('❌ MONGO_URL ist nicht gesetzt');
  process.exit(1);
}

// ===== Mongoose Schemas =====
const SimpleItemSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4 },
  name: String,
}, { versionKey: false });

const TaskTypeModel = mongoose.model('TaskType', SimpleItemSchema, 'task_types');
const HouseModel    = mongoose.model('House',    SimpleItemSchema, 'houses');
const StationModel  = mongoose.model('Station',  SimpleItemSchema, 'stations');
const PersonModel   = mongoose.model('Person',   SimpleItemSchema, 'persons');

const TaskSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  task_type: String,
  haus: String,
  station: String,
  description: { type: String, default: '' },
  person_ids: { type: [String], default: [] },
  time_from: String,
  time_to: String,
  status: { type: String, default: 'pending' },
  accept_reason: { type: String, default: null },
  not_finished_reason: { type: String, default: null },
  not_done_reason: { type: String, default: null },
  accepted_at: { type: String, default: null },
  finished_at: { type: String, default: null },
  created_at: { type: String, default: () => new Date().toISOString() },
  archived: { type: Boolean, default: false },
  archive_date: { type: String, default: null },
  task_date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
}, { versionKey: false });
const TaskModel = mongoose.model('Task', TaskSchema, 'tasks');

const SettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'singleton' },
  password: { type: String, default: DEFAULT_PASSWORD },
  logo_base64: { type: String, default: null },
  background_type: { type: String, default: 'preset' },
  background_value: { type: String, default: 'dark' },
}, { versionKey: false, _id: false });
const SettingsModel = mongoose.model('Settings', SettingsSchema, 'settings');

const WorkflowSchema = new mongoose.Schema({
  task_id: { type: String, unique: true, index: true },
  status: { type: String, default: 'idle' },
  events: { type: Array, default: [] },
  segments: { type: Array, default: [] },
  prepared_at: { type: String, default: null },
  started_at: { type: String, default: null },
  paused_at: { type: String, default: null },
  finished_at: { type: String, default: null },
  last_note: { type: String, default: '' },
  last_event_type: { type: String, default: null },
}, { versionKey: false });
const WorkflowModel = mongoose.model('Workflow', WorkflowSchema, 'workflows');

// ===== Helpers =====
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

async function getSettings() {
  let doc = await SettingsModel.findById('singleton').lean();
  if (!doc) {
    await SettingsModel.create({ _id: 'singleton' });
    doc = await SettingsModel.findById('singleton').lean();
  }
  return doc;
}

const publicSettings = (s) => ({
  logo_base64: s.logo_base64 || null,
  background_type: s.background_type || 'preset',
  background_value: s.background_value || 'dark',
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${ADMIN_TOKEN}`) return next();
  return res.status(401).json({ detail: 'Unauthorized' });
}

const KIND_MODEL = {
  'task-types': TaskTypeModel,
  'houses': HouseModel,
  'stations': StationModel,
  'persons': PersonModel,
};

// ===== App =====
const app = express();
app.use(cors());                              // CORS für alle Origins erlauben
app.use(express.json({ limit: '10mb' }));

// Fallback root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server running' });
});

// ===== API Router =====
const router = express.Router();

// Health
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Reinigung API' });
});

// Login
router.post('/admin/login', async (req, res) => {
  const { password } = req.body || {};
  const s = await getSettings();
  if (password === (s.password || DEFAULT_PASSWORD)) return res.json({ token: ADMIN_TOKEN });
  return res.status(401).json({ detail: 'Falsches Passwort' });
});

// Settings
router.get('/settings', async (req, res) => {
  res.json(publicSettings(await getSettings()));
});
router.put('/settings', requireAdmin, async (req, res) => {
  const allowed = ['password', 'logo_base64', 'background_type', 'background_value'];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
  await SettingsModel.updateOne({ _id: 'singleton' }, { $set: update }, { upsert: true });
  const s = await getSettings();
  broadcast({ type: 'settings_updated' });
  res.json(publicSettings(s));
});

// CRUD: simple lists
function mountKind(kind) {
  const Model = KIND_MODEL[kind];
  router.get(`/${kind}`, async (req, res) => {
    res.json(await Model.find({}, { _id: 0 }).lean());
  });
  router.post(`/${kind}`, requireAdmin, async (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Name required' });
    const doc = await Model.create({ id: uuidv4(), name });
    broadcast({ type: `${kind}_updated` });
    res.json({ id: doc.id, name: doc.name });
  });
  router.delete(`/${kind}/:id`, requireAdmin, async (req, res) => {
    await Model.deleteOne({ id: req.params.id });
    broadcast({ type: `${kind}_updated` });
    res.json({ ok: true });
  });
}
for (const kind of Object.keys(KIND_MODEL)) mountKind(kind);

// Tasks
router.get('/tasks/today', async (req, res) => {
  const today = todayStr();
  res.json(await TaskModel.find({ archived: false, task_date: today }, { _id: 0 }).lean());
});

router.post('/tasks', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.task_type || !b.haus || !b.station || !b.time_from || !b.time_to) {
    return res.status(400).json({ detail: 'Fehlende Pflichtfelder' });
  }
  const task = await TaskModel.create({
    id: uuidv4(),
    task_type: b.task_type,
    haus: b.haus,
    station: b.station,
    description: b.description || '',
    person_ids: b.person_ids || [],
    time_from: b.time_from,
    time_to: b.time_to,
    task_date: todayStr(),
  });
  broadcast({ type: 'tasks_updated' });
  const obj = task.toObject();
  delete obj._id;
  res.json(obj);
});

// Update (Bearbeiten)
router.put('/tasks/:id', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const allowed = ['task_type', 'haus', 'station', 'description', 'person_ids', 'time_from', 'time_to'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  const r = await TaskModel.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, projection: { _id: 0 } }).lean();
  if (!r) return res.status(404).json({ detail: 'Task not found' });
  broadcast({ type: 'tasks_updated' });
  res.json(r);
});

router.patch('/tasks/:id/status', async (req, res) => {
  const valid = new Set(['pending', 'accepted', 'finished', 'cannot_accept', 'not_finished', 'not_done']);
  const status = req.body?.status;
  const reason = req.body?.reason || '';
  if (!valid.has(status)) return res.status(400).json({ detail: 'Invalid status' });
  const update = { status };
  if (status === 'accepted') update.accepted_at = nowIso();
  else if (status === 'finished') update.finished_at = nowIso();
  else if (status === 'cannot_accept') update.accept_reason = reason;
  else if (status === 'not_finished') update.not_finished_reason = reason;
  else if (status === 'not_done') update.not_done_reason = reason;
  const r = await TaskModel.updateOne({ id: req.params.id }, { $set: update });
  if (r.matchedCount === 0) return res.status(404).json({ detail: 'Task not found' });
  broadcast({ type: 'tasks_updated' });
  res.json({ ok: true });
});

router.delete('/tasks/:id', requireAdmin, async (req, res) => {
  const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
  if (permanent) {
    await TaskModel.deleteOne({ id: req.params.id });
    await WorkflowModel.deleteOne({ task_id: req.params.id });
    broadcast({ type: 'tasks_updated' });
    return res.json({ ok: true, deleted: true });
  }
  await TaskModel.updateOne({ id: req.params.id }, { $set: { archived: true, archive_date: todayStr() } });
  broadcast({ type: 'tasks_updated' });
  res.json({ ok: true, archived: true });
});

// Reset archive – löscht NUR archivierte Aufgaben + zugehörige Workflows
router.delete('/tasks/archive/all', requireAdmin, async (req, res) => {
  const archivedIds = (await TaskModel.find({ archived: true }, { id: 1, _id: 0 }).lean()).map((t) => t.id);
  const delT = await TaskModel.deleteMany({ archived: true });
  const delW = archivedIds.length ? await WorkflowModel.deleteMany({ task_id: { $in: archivedIds } }) : { deletedCount: 0 };
  broadcast({ type: 'tasks_updated' });
  res.json({ ok: true, deleted_tasks: delT.deletedCount, deleted_workflows: delW.deletedCount });
});

router.post('/tasks/archive-now', requireAdmin, async (req, res) => {
  const r = await TaskModel.updateMany({ archived: false }, { $set: { archived: true, archive_date: todayStr() } });
  broadcast({ type: 'tasks_updated' });
  res.json({ archived: r.modifiedCount });
});

router.get('/tasks/archive', async (req, res) => {
  const date = req.query.date;
  if (date) {
    const tasks = await TaskModel.find({ archived: true, archive_date: date }, { _id: 0 }).lean();
    return res.json({ date, tasks });
  }
  const dates = await TaskModel.distinct('archive_date', { archived: true });
  res.json({ dates: dates.filter(Boolean).sort().reverse(), tasks: [] });
});

router.get('/update-info', (req, res) => {
  res.json({ latest_version: '1.0.0', download_url: '', changelog: '', mandatory: false });
});

// ===== Workflow (Tablet → Admin live sync) =====
const VALID_EVENTS = new Set(['vorbereiten', 'starten', 'pause', 'fortsetzen', 'beenden']);
const USER_EVENT_TYPES = new Set(['vorbereiten', 'starten', 'pause', 'fortsetzen', 'beenden']);

// Rebuilds a workflow's state (status, segments, timestamps) from its events array.
// Admin events (admin_zeitkorrektur, admin_beenden_rueckgaengig) and `undone` events are ignored
// for state but kept in the history.
function recomputeWorkflow(wf) {
  const events = Array.isArray(wf.events) ? wf.events : [];
  const active = events.filter((e) => !e.undone && USER_EVENT_TYPES.has(e.type));
  active.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  let status = 'idle';
  const segments = [];
  let prepared_at = null, started_at = null, paused_at = null, finished_at = null;
  for (const ev of active) {
    switch (ev.type) {
      case 'vorbereiten':
        status = 'prepared';
        prepared_at = ev.ts;
        break;
      case 'starten': {
        status = 'running';
        started_at = started_at || ev.ts;
        paused_at = null;
        segments.push({ start: ev.ts, end: null });
        break;
      }
      case 'pause': {
        status = 'paused';
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        paused_at = ev.ts;
        break;
      }
      case 'fortsetzen': {
        status = 'running';
        segments.push({ start: ev.ts, end: null });
        paused_at = null;
        break;
      }
      case 'beenden': {
        status = 'finished';
        finished_at = ev.ts;
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        break;
      }
    }
  }
  // last note = last non-admin, non-undone event
  const userEvents = events.filter((e) => !e.undone && USER_EVENT_TYPES.has(e.type));
  const lastUser = userEvents[userEvents.length - 1];
  return {
    ...wf,
    status,
    segments,
    prepared_at,
    started_at,
    paused_at: status === 'paused' ? paused_at : null,
    finished_at,
    last_note: lastUser ? (lastUser.note || '') : (wf.last_note || ''),
    last_event_type: lastUser ? lastUser.type : (wf.last_event_type || null),
  };
}

function applyWorkflowEvent(wf, type, note, taskName) {
  const before = wf.status || 'idle';
  const now = new Date().toISOString();
  let after = before;

  switch (type) {
    case 'vorbereiten':
      after = 'prepared';
      wf.prepared_at = now;
      break;
    case 'starten': {
      after = 'running';
      if (!wf.started_at) wf.started_at = now;
      wf.paused_at = null;
      wf.segments = wf.segments || [];
      wf.segments.push({ start: now, end: null });
      break;
    }
    case 'pause': {
      after = 'paused';
      const last = wf.segments?.[wf.segments.length - 1];
      if (last && !last.end) last.end = now;
      wf.paused_at = now;
      break;
    }
    case 'fortsetzen': {
      after = 'running';
      wf.segments = wf.segments || [];
      wf.segments.push({ start: now, end: null });
      wf.paused_at = null;
      break;
    }
    case 'beenden': {
      after = 'finished';
      wf.finished_at = now;
      const last = wf.segments?.[wf.segments.length - 1];
      if (last && !last.end) last.end = now;
      wf.paused_at = null;
      break;
    }
  }
  wf.status = after;
  wf.last_note = note || '';
  wf.last_event_type = type;
  wf.events = wf.events || [];
  wf.events.push({
    type, ts: now, note: note || '',
    status_before: before, status_after: after, task_name: taskName || '',
  });
  return wf;
}

// GET all workflows (for Admin / Tablet on initial load)
router.get('/workflows', async (req, res) => {
  const list = await WorkflowModel.find({}, { _id: 0 }).lean();
  res.json(list);
});

// GET single workflow
router.get('/workflows/:task_id', async (req, res) => {
  const wf = await WorkflowModel.findOne({ task_id: req.params.task_id }, { _id: 0 }).lean();
  if (!wf) return res.json({
    task_id: req.params.task_id, status: 'idle', events: [], segments: [],
    prepared_at: null, started_at: null, paused_at: null, finished_at: null,
    last_note: '', last_event_type: null,
  });
  res.json(wf);
});

// POST event → apply, persist, broadcast
router.post('/workflows/:task_id/event', async (req, res) => {
  const { type, note, task_name } = req.body || {};
  if (!VALID_EVENTS.has(type)) return res.status(400).json({ detail: 'Invalid event type' });
  const existing = await WorkflowModel.findOne({ task_id: req.params.task_id }, { _id: 0 }).lean();
  const base = existing || {
    task_id: req.params.task_id, status: 'idle', events: [], segments: [],
    prepared_at: null, started_at: null, paused_at: null, finished_at: null,
    last_note: '', last_event_type: null,
  };
  const updated = applyWorkflowEvent({ ...base }, type, note, task_name);
  await WorkflowModel.findOneAndUpdate(
    { task_id: req.params.task_id },
    { $set: updated },
    { upsert: true, new: true },
  );
  broadcast({ type: 'workflow_updated', workflow: updated });
  res.json(updated);
});

// DELETE workflow (when admin deletes a task we can clean it up)
router.delete('/workflows/:task_id', requireAdmin, async (req, res) => {
  await WorkflowModel.deleteOne({ task_id: req.params.task_id });
  broadcast({ type: 'workflow_updated', workflow: { task_id: req.params.task_id, deleted: true } });
  res.json({ ok: true });
});

// Admin: Zeit-Korrektur (mehrere Event-Zeitpunkte auf einmal editieren)
router.post('/workflows/:task_id/admin-correct-times', requireAdmin, async (req, res) => {
  const { updates, admin_note, task_name } = req.body || {};
  if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ detail: 'updates required' });
  const existing = await WorkflowModel.findOne({ task_id: req.params.task_id }, { _id: 0 }).lean();
  if (!existing) return res.status(404).json({ detail: 'Workflow not found' });
  const wf = JSON.parse(JSON.stringify(existing));
  wf.events = wf.events || [];
  const corrections = [];
  for (const u of updates) {
    const idx = Number(u.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= wf.events.length) continue;
    if (!u.ts) continue;
    const ev = wf.events[idx];
    if (!USER_EVENT_TYPES.has(ev.type)) continue; // nur Arbeits-Events korrigierbar
    const old_ts = ev.ts;
    ev.ts = new Date(u.ts).toISOString();
    corrections.push({ target_type: ev.type, index: idx, old_ts, new_ts: ev.ts });
  }
  // Admin-Audit-Event anhängen
  wf.events.push({
    type: 'admin_zeitkorrektur',
    ts: new Date().toISOString(),
    note: admin_note || '',
    status_before: wf.status,
    status_after: wf.status, // wird gleich neu berechnet
    task_name: task_name || '',
    corrections,
  });
  const recomputed = recomputeWorkflow(wf);
  recomputed.events[recomputed.events.length - 1].status_after = recomputed.status;
  await WorkflowModel.findOneAndUpdate({ task_id: req.params.task_id }, { $set: recomputed }, { upsert: true });
  broadcast({ type: 'workflow_updated', workflow: recomputed });
  res.json(recomputed);
});

// Admin: Beenden rückgängig machen
router.post('/workflows/:task_id/admin-undo-finish', requireAdmin, async (req, res) => {
  const { admin_note, task_name } = req.body || {};
  const existing = await WorkflowModel.findOne({ task_id: req.params.task_id }, { _id: 0 }).lean();
  if (!existing) return res.status(404).json({ detail: 'Workflow not found' });
  if (existing.status !== 'finished') return res.status(400).json({ detail: 'Nur beendete Aufgaben können rückgängig gemacht werden' });
  const wf = JSON.parse(JSON.stringify(existing));
  wf.events = wf.events || [];
  // find LAST non-undone beenden event and mark undone
  for (let i = wf.events.length - 1; i >= 0; i--) {
    if (wf.events[i].type === 'beenden' && !wf.events[i].undone) {
      wf.events[i].undone = true;
      wf.events[i].undone_at = new Date().toISOString();
      break;
    }
  }
  const statusBefore = wf.status;
  const recomputed = recomputeWorkflow(wf);
  // Admin-Audit-Event anhängen
  recomputed.events.push({
    type: 'admin_beenden_rueckgaengig',
    ts: new Date().toISOString(),
    note: admin_note || '',
    status_before: statusBefore,
    status_after: recomputed.status,
    task_name: task_name || '',
  });
  await WorkflowModel.findOneAndUpdate({ task_id: req.params.task_id }, { $set: recomputed }, { upsert: true });
  broadcast({ type: 'workflow_updated', workflow: recomputed });
  res.json(recomputed);
});

// Mitarbeiter: Timeline-Eintrag hinzufügen (informativ, ändert weder Status noch Zeitberechnung)
router.post('/workflows/:task_id/timeline', async (req, res) => {
  const { time, date, note, task_name, created_by } = req.body || {};
  const m = typeof time === 'string' && time.match(/^(\d{2}):(\d{2})$/);
  if (!m) return res.status(400).json({ detail: 'time muss HH:MM sein' });
  const h = parseInt(m[1], 10); const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return res.status(400).json({ detail: 'Ungültige Uhrzeit' });
  const baseDate = date ? new Date(date + 'T00:00:00') : new Date();
  baseDate.setHours(h, min, 0, 0);
  const ts = baseDate.toISOString();

  const existing = await WorkflowModel.findOne({ task_id: req.params.task_id }, { _id: 0 }).lean();
  const base = existing || {
    task_id: req.params.task_id, status: 'idle', events: [], segments: [],
    prepared_at: null, started_at: null, paused_at: null, finished_at: null,
    last_note: '', last_event_type: null,
  };
  const wf = JSON.parse(JSON.stringify(base));
  wf.events = wf.events || [];
  wf.events.push({
    type: 'timeline',
    ts,
    note: note || '',
    status_before: wf.status,
    status_after: wf.status, // unverändert
    task_name: task_name || '',
    created_by: created_by || 'Mitarbeiter',
  });
  // WICHTIG: Status, Segmente und Zeiten bleiben unverändert
  await WorkflowModel.findOneAndUpdate({ task_id: req.params.task_id }, { $set: wf }, { upsert: true });
  broadcast({ type: 'workflow_updated', workflow: wf });
  res.json(wf);
});

// Mount router under /api
app.use('/api', router);

// 404 handler
app.use((req, res) => res.status(404).json({ detail: 'Route not found', path: req.path }));

// ===== HTTP + WebSocket =====
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', () => { /* keep alive */ });
  ws.on('error', () => { try { ws.close(); } catch {} });
});

// Auto-archive at midnight UTC
cron.schedule('0 0 * * *', async () => {
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const r = await TaskModel.updateMany({ archived: false }, { $set: { archived: true, archive_date: yesterday } });
    broadcast({ type: 'tasks_updated' });
    console.log(`🌙 Auto-archived ${r.modifiedCount} Aufgaben um Mitternacht`);
  } catch (e) { console.error('Auto-archive Fehler', e); }
}, { timezone: 'UTC' });

// ===== Seed defaults =====
async function seedDefaults() {
  const seed = async (Model, names) => {
    const c = await Model.estimatedDocumentCount();
    if (c === 0) await Model.insertMany(names.map((name) => ({ id: uuidv4(), name })));
  };
  await seed(TaskTypeModel, ['Grundreiniger', 'Glasreiniger', 'Baureiniger', 'Endbaureiniger']);
  await seed(HouseModel, ['A', 'B', 'C']);
  await seed(StationModel, ['10', '11', '12']);
  await getSettings();
}

// ===== Start =====
(async () => {
  try {
    await mongoose.connect(MONGO_URL, { dbName: DB_NAME });
    console.log('✅ MongoDB verbunden:', DB_NAME);
    await seedDefaults();
    server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Reinigung Backend läuft auf Port ${PORT}`));
  } catch (e) {
    console.error('Startfehler:', e);
    process.exit(1);
  }
})();

process.on('SIGTERM', () => { server.close(); mongoose.disconnect(); });
