import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { WebSocketServer } from 'ws';
import http from 'http';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

// ===== ENV =====
const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'reinigung';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = 'admin-session-token';

// Cloudinary (signed uploads via backend ONLY — API secret never leaves server)
// IMPORTANT: trim() removes any whitespace / newlines that sneak in when env
// vars are copy-pasted into Render's UI — a frequent cause of "Invalid cloud_name".
function cleanEnv(v) {
  if (!v) return '';
  // Strip surrounding whitespace, quotes, and any trailing CR/LF
  return String(v).trim().replace(/^['"]|['"]$/g, '').trim();
}
const CLOUDINARY_CLOUD_NAME = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME);
const CLOUDINARY_API_KEY    = cleanEnv(process.env.CLOUDINARY_API_KEY);
const CLOUDINARY_API_SECRET = cleanEnv(process.env.CLOUDINARY_API_SECRET);
// If somebody set CLOUDINARY_URL we DELETE it so the SDK doesn't pick it up
// implicitly — we want only our explicit config below.
if (process.env.CLOUDINARY_URL) {
  console.warn('⚠ CLOUDINARY_URL is set in environment — REMOVING to avoid conflict with explicit config');
  delete process.env.CLOUDINARY_URL;
}
const CLOUDINARY_ENABLED = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  // Validate values look reasonable so we surface mistakes immediately.
  const cloudOk    = /^[a-zA-Z0-9_-]+$/.test(CLOUDINARY_CLOUD_NAME);
  const keyLooksOk = /^[0-9]{6,}$/.test(CLOUDINARY_API_KEY);
  console.log('✅ Cloudinary configured for cloud:', JSON.stringify(CLOUDINARY_CLOUD_NAME));
  console.log('   • cloud_name length :', CLOUDINARY_CLOUD_NAME.length, '— format ok?', cloudOk);
  console.log('   • api_key length    :', CLOUDINARY_API_KEY.length, '— numeric?', keyLooksOk);
  console.log('   • api_secret length :', CLOUDINARY_API_SECRET.length, '— present?', !!CLOUDINARY_API_SECRET);
  if (!cloudOk) console.warn('   ⚠ cloud_name contains unexpected characters – may be wrong!');
  if (!keyLooksOk) console.warn('   ⚠ api_key does not look like a typical Cloudinary numeric key!');
} else {
  console.warn('⚠ Cloudinary NOT configured — set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
  console.warn('   present? cloud=%s key=%s secret=%s',
    !!CLOUDINARY_CLOUD_NAME, !!CLOUDINARY_API_KEY, !!CLOUDINARY_API_SECRET);
}

// Multer: keep uploaded files in memory (we stream them to Cloudinary without touching disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
});

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
  // Feierabend continuation — set by `feierabend` event. `task_date` NEVER
  // changes on Feierabend (the original planned day stays intact); instead we
  // note that this task should ALSO appear on `next_work_date`, labelled
  // "Fortsetzung von gestern". When the worker clicks Fortsetzen on that day
  // we clear both flags.
  continue_tomorrow: { type: Boolean, default: false },
  next_work_date: { type: String, default: null },
  // Photos attached to this task. Binary assets live in Cloudinary; MongoDB
  // stores metadata + URLs only.
  photos: {
    type: [{
      id: { type: String, default: uuidv4 },
      url: String,            // convenience alias (= fullSizeUrl)
      fullSizeUrl: String,    // high-res original
      thumbnailUrl: String,   // ~400px wide for grid views
      public_id: String,      // Cloudinary public_id (required for deletion)
      uploadedAt: { type: String, default: () => new Date().toISOString() },
      uploadedBy: { type: String, default: '' },
      caption: { type: String, default: '' },
      width: Number,
      height: Number,
      bytes: Number,
      format: String,
    }],
    default: [],
  },
}, { versionKey: false });
const TaskModel = mongoose.model('Task', TaskSchema, 'tasks');

// =================== BESTELLUNG (Orders) ===================
const VALID_ORDER_STATUS = new Set(['offen', 'bestellt', 'geliefert']);
const OrderSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  serial_number: { type: String, default: '' },
  article_number: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  purchase_link: { type: String, default: '' },
  note: { type: String, default: '' },
  // Image: store the same shape as task photos (so we can reuse Cloudinary)
  image_url: { type: String, default: '' },           // full-size
  image_thumbnail: { type: String, default: '' },     // ~400px
  image_public_id: { type: String, default: '' },     // for deletion
  status: { type: String, enum: ['offen', 'bestellt', 'geliefert'], default: 'offen' },
  archived: { type: Boolean, default: false },
  archive_month: { type: String, default: null },     // "YYYY-MM"
  created_at: { type: String, default: () => new Date().toISOString() },
  updated_at: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });
const OrderModel = mongoose.model('Order', OrderSchema, 'orders');

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
  // Match: (task_date==today) OR (continuation from yesterday: continue_tomorrow && next_work_date==today)
  res.json(await TaskModel.find({
    archived: { $ne: true },
    $or: [
      { task_date: today },
      { continue_tomorrow: true, next_work_date: today },
    ],
  }, { _id: 0 }).lean());
});

// Generic: GET /tasks/by-date?date=YYYY-MM-DD
router.get('/tasks/by-date', async (req, res) => {
  const date = String(req.query.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ detail: 'date muss YYYY-MM-DD sein' });
  res.json(await TaskModel.find({
    archived: { $ne: true },
    $or: [
      { task_date: date },
      { continue_tomorrow: true, next_work_date: date },
    ],
  }, { _id: 0 }).lean());
});

// Alias matching the spec the user asked for: GET /api/tasks?date=YYYY-MM-DD
//   - Without ?date → returns all non-archived tasks (across every date) ordered by date
//   - With ?date    → matches task_date OR continuation (next_work_date)
router.get('/tasks', async (req, res) => {
  const date = String(req.query.date || '').trim();
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ detail: 'date muss YYYY-MM-DD sein' });
    return res.json(await TaskModel.find({
      archived: { $ne: true },
      $or: [
        { task_date: date },
        { continue_tomorrow: true, next_work_date: date },
      ],
    }, { _id: 0 }).lean());
  }
  res.json(await TaskModel.find({ archived: { $ne: true } }, { _id: 0 }).sort({ task_date: -1 }).lean());
});

// Distinct list of dates that have tasks (used by Admin date-jump UI).
router.get('/tasks/dates', async (req, res) => {
  const rows = await TaskModel.aggregate([
    { $match: { archived: { $ne: true } } },
    { $group: { _id: '$task_date', count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);
  res.json(rows.map(r => ({ date: r._id, count: r.count })));
});

// =============== DIAGNOSTIC: detect "lost" tasks ===============
// Returns tasks that may not show up in the regular day-views because of
// missing/invalid task_date or other oddities. Useful to debug issues like
// "I restored a task and it disappeared".
router.get('/debug/lost-tasks', async (req, res) => {
  const all = await TaskModel.find({}, { _id: 0 }).lean();
  const lost = {
    no_task_date: [],          // archived=false but task_date missing / empty / malformed
    archived_but_no_archive_date: [], // archived=true but archive_date missing
    archived_field_undefined: [],     // archived field is missing entirely (legacy)
    counts: { total: all.length, archived: 0, active: 0 },
  };
  const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  for (const t of all) {
    if (t.archived === true) lost.counts.archived++;
    else lost.counts.active++;
    if (t.archived === undefined || t.archived === null) {
      lost.archived_field_undefined.push({ id: t.id, task_type: t.task_type, task_date: t.task_date });
    }
    if (t.archived !== true && !isValidDate(t.task_date)) {
      lost.no_task_date.push({ id: t.id, task_type: t.task_type, task_date: t.task_date, created_at: t.created_at });
    }
    if (t.archived === true && !isValidDate(t.archive_date)) {
      lost.archived_but_no_archive_date.push({ id: t.id, task_type: t.task_type, archive_date: t.archive_date });
    }
  }
  res.json(lost);
});

// One-off cleanup endpoint: backfill missing task_date from created_at, fix
// inconsistent archived flag. Admin only — safe to run multiple times.
router.post('/debug/heal-tasks', requireAdmin, async (req, res) => {
  const all = await TaskModel.find({}, { _id: 0 }).lean();
  const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const healed = [];
  for (const t of all) {
    const update = {};
    if (!isValidDate(t.task_date)) {
      const fallback = isValidDate(String(t.created_at || '').slice(0, 10))
        ? String(t.created_at).slice(0, 10)
        : todayStr();
      update.task_date = fallback;
    }
    if (t.archived === undefined || t.archived === null) update.archived = false;
    if (Object.keys(update).length) {
      await TaskModel.updateOne({ id: t.id }, { $set: update });
      healed.push({ id: t.id, task_type: t.task_type, fix: update });
    }
  }
  broadcast({ type: 'tasks_updated' });
  res.json({ ok: true, healed_count: healed.length, healed });
});

router.post('/tasks', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.task_type || !b.haus || !b.station || !b.time_from || !b.time_to) {
    return res.status(400).json({ detail: 'Fehlende Pflichtfelder' });
  }
  // Allow Admin to set a custom task_date (today, tomorrow, or any future/past day).
  let taskDate = todayStr();
  if (b.task_date && /^\d{4}-\d{2}-\d{2}$/.test(String(b.task_date))) {
    taskDate = String(b.task_date);
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
    task_date: taskDate,
  });
  broadcast({ type: 'tasks_updated' });
  const obj = task.toObject();
  delete obj._id;
  res.json(obj);
});

// Update (Bearbeiten)
router.put('/tasks/:id', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const allowed = ['task_type', 'haus', 'station', 'description', 'person_ids', 'time_from', 'time_to', 'task_date'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  if (update.task_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(update.task_date))) {
    return res.status(400).json({ detail: 'task_date muss YYYY-MM-DD sein' });
  }
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
  // Clean up any attached photos from Cloudinary before deleting the task
  if (CLOUDINARY_ENABLED) {
    try {
      const t = await TaskModel.findOne({ id: req.params.id }, { _id: 0, photos: 1 }).lean();
      const ids = (t?.photos || []).map(p => p.public_id).filter(Boolean);
      if (ids.length) await cloudinary.api.delete_resources(ids).catch(() => {});
      // Delete the whole folder as well (empty folder can be pruned too)
      await cloudinary.api.delete_folder(`tasks/${req.params.id}`).catch(() => {});
    } catch (e) { console.warn('Cloudinary cleanup (delete_task):', e.message); }
  }
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

// =================== PHOTOS / MEDIA ===================
// Diagnostic endpoint — confirms what the running process actually sees in env.
// Safe to expose: secret length only, never the secret itself.
router.get('/cloudinary-status', (req, res) => {
  res.json({
    enabled: CLOUDINARY_ENABLED,
    cloud_name: CLOUDINARY_CLOUD_NAME || null,
    cloud_name_length: CLOUDINARY_CLOUD_NAME.length,
    cloud_name_format_ok: /^[a-zA-Z0-9_-]+$/.test(CLOUDINARY_CLOUD_NAME),
    api_key_present: !!CLOUDINARY_API_KEY,
    api_key_length: CLOUDINARY_API_KEY.length,
    api_key_numeric: /^[0-9]{6,}$/.test(CLOUDINARY_API_KEY),
    api_secret_present: !!CLOUDINARY_API_SECRET,
    api_secret_length: CLOUDINARY_API_SECRET.length,
    cloudinary_url_was_set: !!process.env.__CLOUDINARY_URL_WAS_SET, // we capture it below if it existed
    sdk_config: {
      cloud_name: cloudinary.config().cloud_name || null,
      api_key_set: !!cloudinary.config().api_key,
      secure: cloudinary.config().secure || false,
    },
  });
});

// =================== Cloudinary self-test endpoints ===================
// These let you verify, WITHOUT involving the frontend at all, whether the
// configured credentials can talk to Cloudinary. Useful to isolate "bad keys"
// from "bad upload code".

// 1) Simple presence check — same shape the user requested.
router.get('/cloudinary-test', (req, res) => {
  res.json({
    cloudName: CLOUDINARY_CLOUD_NAME || null,
    cloudNameLength: CLOUDINARY_CLOUD_NAME.length,
    hasApiKey: !!CLOUDINARY_API_KEY,
    hasApiSecret: !!CLOUDINARY_API_SECRET,
    enabled: CLOUDINARY_ENABLED,
    // What the SDK is actually using right now (to detect drift between
    // the env-derived constants and the live SDK state):
    sdkCloudName: cloudinary.config().cloud_name || null,
    sdkApiKeySet: !!cloudinary.config().api_key,
  });
});

// 2) Live upload — tries to upload a tiny 1x1 PNG generated in memory.
//    If THIS fails with "Invalid cloud_name dvv6syprg" → 100% credentials issue.
//    If THIS succeeds but /api/upload fails → bug in upload route.
//    Returns the full Cloudinary error in the JSON response and prints it to logs.
router.post('/cloudinary-test-upload', async (req, res) => {
  if (!CLOUDINARY_ENABLED) {
    return res.status(503).json({ ok: false, detail: 'Cloudinary nicht konfiguriert' });
  }
  // 1×1 transparent PNG — small valid image we generate in-memory.
  const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(tinyPngBase64, 'base64');

  console.log('[cloudinary-test-upload] ▶ start');
  console.log('[cloudinary-test-upload]   env cloud_name = "' + CLOUDINARY_CLOUD_NAME + '" (len=' + CLOUDINARY_CLOUD_NAME.length + ')');
  console.log('[cloudinary-test-upload]   sdk cloud_name = "' + (cloudinary.config().cloud_name || '') + '"');
  console.log('[cloudinary-test-upload]   api_key len    = ' + CLOUDINARY_API_KEY.length);
  console.log('[cloudinary-test-upload]   api_secret len = ' + CLOUDINARY_API_SECRET.length);
  console.log('[cloudinary-test-upload]   buffer size    = ' + buffer.length + ' bytes');

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'tasks/_diagnostic',
          resource_type: 'image',
          public_id: 'selftest_' + Date.now(),
          overwrite: true,
        },
        (err, r) => err ? reject(err) : resolve(r),
      );
      stream.end(buffer);
    });

    console.log('[cloudinary-test-upload] ✓ success — public_id=' + result.public_id);
    return res.json({
      ok: true,
      message: 'Cloudinary credentials work ✔',
      cloud_name: CLOUDINARY_CLOUD_NAME,
      public_id: result.public_id,
      url: result.secure_url,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    // Print EVERYTHING about the error so the cause is unambiguous.
    const errorDump = {
      message: err?.message,
      name: err?.name,
      http_code: err?.http_code,
      error: err?.error,                 // nested cloudinary error object
      error_message: err?.error?.message,
      error_http_code: err?.error?.http_code,
      stack: err?.stack,
    };
    console.error('[cloudinary-test-upload] ✗ FAILED — full error:');
    console.error(JSON.stringify(errorDump, null, 2));

    return res.status(500).json({
      ok: false,
      detail: err?.message || 'Unknown error',
      cloudinary_error: {
        message: err?.message,
        http_code: err?.http_code,
        nested: err?.error || null,
      },
      cloud_name_used: cloudinary.config().cloud_name || null,
      // Hint for common issues
      hint:
        /Invalid cloud_name/i.test(err?.message || '')
          ? 'Cloud name is rejected by Cloudinary. Open https://console.cloudinary.com/, copy "Cloud name" (NOT API key) and update CLOUDINARY_CLOUD_NAME in Render. Tip: type it manually instead of pasting to avoid hidden whitespace.'
          : /Invalid API key/i.test(err?.message || '')
          ? 'API key is wrong. Open Cloudinary Dashboard → Account Details → API Key.'
          : /Invalid Signature|signature/i.test(err?.message || '')
          ? 'API secret is wrong. Open Cloudinary Dashboard → Account Details → API Secret.'
          : 'Check Render env vars are exactly as on https://console.cloudinary.com/ Account Details.',
    });
  }
});

// Shared upload handler — extracts file from multer, streams to Cloudinary,
// returns either {ok:true, photo, task} (when bound to a task) or {ok:true, photo}
// (generic upload). Used by BOTH `/tasks/:id/photos` and `/upload`.
async function handleCloudinaryUpload(req, res, { taskId } = {}) {
  // ---- Diagnostic logs (request scope) ----
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[upload ${reqId}] ▶ start  path=${req.path}  taskId=${taskId || '-'}`);
  console.log(`[upload ${reqId}]   env CLOUDINARY_CLOUD_NAME = "${CLOUDINARY_CLOUD_NAME}" (len=${CLOUDINARY_CLOUD_NAME.length})`);
  console.log(`[upload ${reqId}]   env API_KEY present       = ${!!CLOUDINARY_API_KEY} (len=${CLOUDINARY_API_KEY.length})`);
  console.log(`[upload ${reqId}]   env API_SECRET present    = ${!!CLOUDINARY_API_SECRET} (len=${CLOUDINARY_API_SECRET.length})`);
  console.log(`[upload ${reqId}]   sdk.cloud_name (live)     = "${cloudinary.config().cloud_name || ''}"`);

  if (!CLOUDINARY_ENABLED) {
    console.warn(`[upload ${reqId}] ✗ Cloudinary not configured`);
    return res.status(503).json({ detail: 'Cloudinary nicht konfiguriert' });
  }
  if (!req.file || !req.file.buffer) {
    console.warn(`[upload ${reqId}] ✗ no file in request (field name must be "file")`);
    return res.status(400).json({ detail: 'Keine Datei gesendet (Feld "file" erforderlich)' });
  }
  console.log(`[upload ${reqId}]   file: ${req.file.originalname} (${req.file.mimetype}) ${req.file.size} bytes`);

  // If bound to a task, validate it exists.
  if (taskId) {
    const task = await TaskModel.findOne({ id: taskId }, { _id: 0, id: 1 }).lean();
    if (!task) {
      console.warn(`[upload ${reqId}] ✗ task ${taskId} not found`);
      return res.status(404).json({ detail: 'Aufgabe nicht gefunden' });
    }
  }
  const caption = (req.body?.caption || '').toString().slice(0, 500);
  const uploadedBy = (req.body?.uploadedBy || '').toString().slice(0, 120);

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: taskId ? `tasks/${taskId}` : 'tasks/_unbound',
          resource_type: 'image',
          quality: 'auto:best',
          fetch_format: 'auto',
        },
        (err, r) => err ? reject(err) : resolve(r),
      );
      stream.end(req.file.buffer);
    });

    const thumbnailUrl = cloudinary.url(result.public_id, {
      secure: true, width: 400, height: 400, crop: 'fill', gravity: 'auto',
      quality: 'auto', fetch_format: 'auto',
    });
    const fullSizeUrl = result.secure_url;

    const photo = {
      id: uuidv4(),
      url: fullSizeUrl,
      fullSizeUrl,
      thumbnailUrl,
      public_id: result.public_id,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      caption,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
    };

    let updated = null;
    if (taskId) {
      updated = await TaskModel.findOneAndUpdate(
        { id: taskId },
        { $push: { photos: photo } },
        { new: true, projection: { _id: 0 } },
      ).lean();
      broadcast({ type: 'tasks_updated' });
    }
    console.log(`[upload ${reqId}] ✓ ok — public_id=${result.public_id} url=${fullSizeUrl}`);
    res.json({ ok: true, photo, task: updated });
  } catch (err) {
    // Print the FULL Cloudinary error object so the cause is obvious in logs.
    console.error(`[upload ${reqId}] ✗ Cloudinary error:`, {
      message: err?.message,
      name: err?.name,
      http_code: err?.http_code,
      error: err?.error,
      stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
    });
    res.status(500).json({
      detail: 'Upload fehlgeschlagen: ' + (err?.message || 'unbekannt'),
      http_code: err?.http_code,
      cloud_name_used: cloudinary.config().cloud_name || null,
    });
  }
}

// Upload bound to a specific task (preferred — places photo metadata on the task)
router.post('/tasks/:id/photos', upload.single('file'), (req, res) =>
  handleCloudinaryUpload(req, res, { taskId: req.params.id })
);

// Generic upload alias — same handler, accepts optional ?taskId= or body.taskId.
// Frontend should send `file` field (and optional taskId/caption/uploadedBy).
router.post('/upload', upload.single('file'), (req, res) => {
  const taskId = (req.query.taskId || req.body?.taskId || '').toString().trim() || undefined;
  return handleCloudinaryUpload(req, res, { taskId });
});

// =================== BESTELLUNG (Orders) ROUTES ===================
const todayMonthStr = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// List orders. Filters: ?archived=true|false, ?status=offen|bestellt|geliefert,
// ?month=YYYY-MM (only with archived=true), ?q=search-term (matches name/serial/article).
router.get('/orders', async (req, res) => {
  const q = {};
  const archived = String(req.query.archived || '').toLowerCase();
  if (archived === 'true') q.archived = true;
  else if (archived === 'false' || archived === '') q.archived = { $ne: true };
  const status = String(req.query.status || '').toLowerCase();
  if (VALID_ORDER_STATUS.has(status)) q.status = status;
  const month = String(req.query.month || '').trim();
  if (/^\d{4}-\d{2}$/.test(month)) q.archive_month = month;
  const search = String(req.query.q || '').trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { serial_number: rx }, { article_number: rx }, { note: rx }];
  }
  const rows = await OrderModel.find(q, { _id: 0 }).sort({ created_at: -1 }).lean();
  res.json(rows);
});

// Distinct archive months for the Archive overview.
router.get('/orders/archive/months', async (req, res) => {
  const rows = await OrderModel.aggregate([
    { $match: { archived: true } },
    { $group: { _id: '$archive_month', count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);
  res.json(rows.filter(r => r._id).map(r => ({ month: r._id, count: r.count })));
});

router.get('/orders/:id', async (req, res) => {
  const o = await OrderModel.findOne({ id: req.params.id }, { _id: 0 }).lean();
  if (!o) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  res.json(o);
});

router.post('/orders', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ detail: 'Name ist Pflicht' });
  const order = await OrderModel.create({
    id: uuidv4(),
    name: String(b.name).trim(),
    serial_number: String(b.serial_number || '').trim(),
    article_number: String(b.article_number || '').trim(),
    quantity: Math.max(1, parseInt(b.quantity, 10) || 1),
    purchase_link: String(b.purchase_link || '').trim(),
    note: String(b.note || '').trim(),
    image_url: String(b.image_url || '').trim(),
    image_thumbnail: String(b.image_thumbnail || '').trim(),
    image_public_id: String(b.image_public_id || '').trim(),
    status: VALID_ORDER_STATUS.has(b.status) ? b.status : 'offen',
  });
  broadcast({ type: 'orders_updated' });
  const obj = order.toObject(); delete obj._id;
  res.json(obj);
});

router.put('/orders/:id', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const allowed = ['name', 'serial_number', 'article_number', 'quantity', 'purchase_link',
                   'note', 'image_url', 'image_thumbnail', 'image_public_id'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  update.updated_at = new Date().toISOString();
  const r = await OrderModel.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, projection: { _id: 0 } }).lean();
  if (!r) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  broadcast({ type: 'orders_updated' });
  res.json(r);
});

// Change status (Offen / Bestellt / Geliefert)
router.patch('/orders/:id/status', requireAdmin, async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!VALID_ORDER_STATUS.has(status)) return res.status(400).json({ detail: 'Ungültiger Status' });
  const r = await OrderModel.findOneAndUpdate(
    { id: req.params.id },
    { $set: { status, updated_at: new Date().toISOString() } },
    { new: true, projection: { _id: 0 } },
  ).lean();
  if (!r) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  broadcast({ type: 'orders_updated' });
  res.json(r);
});

// Archive (monthly bucket — month is current month unless ?month=YYYY-MM is provided)
router.post('/orders/:id/archive', requireAdmin, async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.body?.month || '')) ? req.body.month : todayMonthStr();
  const r = await OrderModel.findOneAndUpdate(
    { id: req.params.id },
    { $set: { archived: true, archive_month: month, updated_at: new Date().toISOString() } },
    { new: true, projection: { _id: 0 } },
  ).lean();
  if (!r) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  broadcast({ type: 'orders_updated' });
  res.json({ ok: true, order: r, archived_to_month: month });
});

// Restore from archive
router.post('/orders/:id/restore', requireAdmin, async (req, res) => {
  const r = await OrderModel.findOneAndUpdate(
    { id: req.params.id },
    { $set: { archived: false, archive_month: null, updated_at: new Date().toISOString() } },
    { new: true, projection: { _id: 0 } },
  ).lean();
  if (!r) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  broadcast({ type: 'orders_updated' });
  res.json({ ok: true, order: r });
});

// Permanent delete (Cloudinary cleanup if image was uploaded by us)
router.delete('/orders/:id', requireAdmin, async (req, res) => {
  const o = await OrderModel.findOne({ id: req.params.id }, { _id: 0 }).lean();
  if (!o) return res.status(404).json({ detail: 'Bestellung nicht gefunden' });
  if (o.image_public_id && CLOUDINARY_ENABLED) {
    try { await cloudinary.uploader.destroy(o.image_public_id, { resource_type: 'image', invalidate: true }); } catch (e) { console.warn('cloudinary destroy failed:', e?.message); }
  }
  await OrderModel.deleteOne({ id: req.params.id });
  broadcast({ type: 'orders_updated' });
  res.json({ ok: true });
});

// Image upload for orders — same Cloudinary stream pattern, but
// returns the URL/public_id directly (caller stores it on the Order).
router.post('/orders/upload-image', upload.single('file'), async (req, res) => {
  if (!CLOUDINARY_ENABLED) return res.status(503).json({ detail: 'Cloudinary nicht konfiguriert' });
  if (!req.file?.buffer) return res.status(400).json({ detail: 'Keine Datei gesendet' });
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'orders', resource_type: 'image', quality: 'auto:best', fetch_format: 'auto' },
        (err, r) => err ? reject(err) : resolve(r),
      );
      stream.end(req.file.buffer);
    });
    const thumbnail = cloudinary.url(result.public_id, {
      secure: true, width: 400, height: 400, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto',
    });
    res.json({
      ok: true,
      url: result.secure_url,
      thumbnail,
      public_id: result.public_id,
      width: result.width, height: result.height, bytes: result.bytes, format: result.format,
    });
  } catch (err) {
    console.error('[orders/upload-image] Cloudinary error:', err?.message, err?.http_code);
    res.status(500).json({ detail: 'Upload fehlgeschlagen: ' + (err?.message || 'unbekannt') });
  }
});

// List photos for a task (light endpoint — just returns the photos sub-array).
router.get('/tasks/:id/photos', async (req, res) => {
  const t = await TaskModel.findOne({ id: req.params.id }, { _id: 0, photos: 1 }).lean();
  if (!t) return res.status(404).json({ detail: 'Aufgabe nicht gefunden' });
  res.json({ photos: t.photos || [] });
});

// DELETE a single photo — Admin only. Removes from Cloudinary first, then Mongo.
router.delete('/tasks/:taskId/photos/:photoId', requireAdmin, async (req, res) => {
  const { taskId, photoId } = req.params;
  const t = await TaskModel.findOne({ id: taskId }, { _id: 0, photos: 1 }).lean();
  if (!t) return res.status(404).json({ detail: 'Aufgabe nicht gefunden' });
  const photo = (t.photos || []).find(p => p.id === photoId);
  if (!photo) return res.status(404).json({ detail: 'Foto nicht gefunden' });
  try {
    if (CLOUDINARY_ENABLED && photo.public_id) {
      await cloudinary.uploader.destroy(photo.public_id, { resource_type: 'image', invalidate: true });
    }
  } catch (e) {
    // Do NOT fail the whole operation if Cloudinary cleanup fails — log and continue.
    console.warn('Cloudinary destroy failed:', e.message);
  }
  await TaskModel.updateOne({ id: taskId }, { $pull: { photos: { id: photoId } } });
  broadcast({ type: 'tasks_updated' });
  res.json({ ok: true, deleted: photoId });
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

// Restore an archived task — sets archived=false, ensures it has a valid
// task_date so it actually appears under a day-view, and returns the full task
// (with its restored task_date) so the client can navigate to that day.
//
// Workflow/photos/timeline/persons/notes are PRESERVED VERBATIM (we never
// touch them — archiving has always been a single-flag flip). The task simply
// reappears under its original task_date.
router.post('/tasks/:id/restore', requireAdmin, async (req, res) => {
  const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const t = await TaskModel.findOne({ id: req.params.id }, { _id: 0 }).lean();
  if (!t) return res.status(404).json({ detail: 'Aufgabe nicht gefunden' });

  // Build the $set payload defensively. Always:
  //   - flip archived → false
  //   - clear archive_date
  //   - GUARANTEE a valid task_date so the task is reachable from `Plan für …`
  const update = { archived: false, archive_date: null };
  let restoredDate = isValidDate(t.task_date) ? t.task_date : null;
  let dateSource = restoredDate ? 'preserved' : null;
  if (!restoredDate) {
    // Fallback chain:
    //   1) created_at first 10 chars (YYYY-MM-DD)
    //   2) archive_date (the day it was archived)
    //   3) today as last resort
    const createdSlice = String(t.created_at || '').slice(0, 10);
    if (isValidDate(createdSlice)) { restoredDate = createdSlice; dateSource = 'created_at'; }
    else if (isValidDate(t.archive_date)) { restoredDate = t.archive_date; dateSource = 'archive_date'; }
    else { restoredDate = todayStr(); dateSource = 'today_fallback'; }
    update.task_date = restoredDate;
    console.warn(`[restore] task ${t.id} had invalid task_date="${t.task_date}" — using ${dateSource}=${restoredDate}`);
  }

  const updated = await TaskModel.findOneAndUpdate(
    { id: req.params.id },
    { $set: update },
    { new: true, projection: { _id: 0 } },
  ).lean();
  // Tablet + Admin both listen for this and refetch automatically.
  broadcast({ type: 'tasks_updated' });
  res.json({
    ok: true,
    task: updated,
    restored_to_date: restoredDate,
    date_source: dateSource,        // "preserved" | "created_at" | "archive_date" | "today_fallback"
    photos_count: Array.isArray(updated?.photos) ? updated.photos.length : 0,
  });
});

router.get('/update-info', (req, res) => {
  res.json({ latest_version: '1.0.0', download_url: '', changelog: '', mandatory: false });
});

// ===== Workflow (Tablet → Admin live sync) =====
const VALID_EVENTS = new Set(['vorbereiten', 'starten', 'pause', 'fortsetzen', 'beenden', 'feierabend']);
const USER_EVENT_TYPES = new Set(['vorbereiten', 'starten', 'pause', 'fortsetzen', 'beenden', 'feierabend']);

function tomorrowStr(fromDate) {
  const d = fromDate ? new Date(fromDate + 'T00:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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
      case 'feierabend': {
        // Like pause: closes current segment. Status → deferred (Wird morgen fortgesetzt).
        status = 'deferred';
        const last = segments[segments.length - 1];
        if (last && !last.end) last.end = ev.ts;
        paused_at = null;
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

function applyWorkflowEvent(wf, type, note, taskName, personsSnapshot) {
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
    case 'feierabend': {
      after = 'deferred';
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
    persons: Array.isArray(personsSnapshot) ? personsSnapshot : undefined,
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
  // Snapshot current person_ids of the task (so we know who worked today)
  const taskDoc = await TaskModel.findOne({ id: req.params.task_id }, { _id: 0 }).lean();
  const personsSnapshot = taskDoc?.person_ids ? [...taskDoc.person_ids] : [];
  const updated = applyWorkflowEvent({ ...base }, type, note, task_name, personsSnapshot);
  await WorkflowModel.findOneAndUpdate(
    { task_id: req.params.task_id },
    { $set: updated },
    { upsert: true, new: true },
  );
  // On Feierabend: DO NOT change task_date. Instead mark the task to continue
  // tomorrow — it will appear on tomorrow's day view as "Fortsetzung von gestern"
  // (via the $or query), and also remain visible under its original task_date.
  if (type === 'feierabend' && taskDoc) {
    const nextDay = tomorrowStr(todayStr());
    await TaskModel.updateOne(
      { id: req.params.task_id },
      { $set: { continue_tomorrow: true, next_work_date: nextDay } },
    );
    broadcast({ type: 'tasks_updated' });
  }
  // On Fortsetzen: if the task was marked to continue tomorrow, clear the flags
  // (the continuation has now happened, so it no longer needs to show on future days).
  if (type === 'fortsetzen' && taskDoc?.continue_tomorrow) {
    await TaskModel.updateOne(
      { id: req.params.task_id },
      { $set: { continue_tomorrow: false, next_work_date: null } },
    );
    broadcast({ type: 'tasks_updated' });
  }
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
    // Plain-text display values (no TZ conversion). Preserve if caller provided.
    if (typeof u.display_time === 'string' && /^\d{2}:\d{2}$/.test(u.display_time)) ev.display_time = u.display_time;
    if (typeof u.display_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(u.display_date)) ev.display_date = u.display_date;
    corrections.push({
      target_type: ev.type,
      index: idx,
      old_ts,
      new_ts: ev.ts,
      new_display_time: ev.display_time,
      new_display_date: ev.display_date,
    });
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
  // Store the user-entered values VERBATIM as plain strings (no TZ conversion).
  // This is what the UI will display. `ts` is kept only for chronological sort.
  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
  const display_date = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayISO;
  const display_time = time;
  // `ts` marked as UTC so chronological sort within a day is consistent regardless
  // of server TZ. The displayed value MUST come from display_time/display_date.
  const ts = `${display_date}T${display_time}:00.000Z`;

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
    display_time,
    display_date,
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
