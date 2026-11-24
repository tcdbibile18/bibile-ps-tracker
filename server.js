'use strict';

const express = require('express');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
app.disable('x-powered-by');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '.data'));
const publicDir = path.join(__dirname, 'public');
const relativeData = path.relative(publicDir, dataDir);
if (!relativeData || (!relativeData.startsWith('..' + path.sep) && relativeData !== '..' && !path.isAbsolute(relativeData))) {
  throw new Error('DATA_DIR must be outside the public directory.');
}
const photoDir = path.join(dataDir, 'uploads');
fs.mkdirSync(photoDir, { recursive: true, mode: 0o700 });
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
const statuses = ['pending', 'in_progress', 'resolved'];
const formFields = ['name', 'phone', 'nic', 'division', 'category', 'address', 'description'];
const requiredFields = formFields.filter(field => field !== 'nic');

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS complaints (
    ticket TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
    nic TEXT NOT NULL DEFAULT '', division TEXT NOT NULL, category TEXT NOT NULL,
    address TEXT NOT NULL, description TEXT NOT NULL, photo TEXT, proof TEXT,
    status TEXT NOT NULL DEFAULT 'pending', remarks TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
`);
function normalizePhone(value) {
  if (!/^\+?[\d ().-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  if (/^(?:00)?94\d{9}$/.test(digits)) return '0' + digits.slice(-9);
  return /^\d{7,15}$/.test(digits) ? digits : '';
}
db.function('normalized_phone', { deterministic: true }, normalizePhone);
db.exec('CREATE INDEX IF NOT EXISTS complaints_phone_lookup ON complaints(normalized_phone(phone))');
function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
transaction(() => {
  if (!db.prepare('PRAGMA table_info(complaints)').all().some(column => column.name === 'trashedAt')) {
    db.exec('ALTER TABLE complaints ADD COLUMN trashedAt TEXT');
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS complaint_history (' +
    'id INTEGER PRIMARY KEY, ticket TEXT NOT NULL REFERENCES complaints(ticket) ON DELETE CASCADE, ' +
    'type TEXT NOT NULL, status TEXT, remarks TEXT, createdAt TEXT NOT NULL); ' +
    'CREATE INDEX IF NOT EXISTS complaint_history_ticket ON complaint_history(ticket,id); ' +
    'CREATE TABLE IF NOT EXISTS retired_photos (filename TEXT PRIMARY KEY)'
  );
});
const insert = db.prepare(`
  INSERT INTO complaints (ticket,name,phone,nic,division,category,address,description,photo,status,createdAt,updatedAt)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`);
const now = () => new Date().toISOString();

// Set ADMIN_PASSWORD for deployment. Local installations can use a private password file.
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const localPasswordFile = path.join(dataDir, 'admin-password');
const adminPassword = process.env.ADMIN_PASSWORD
  || (fs.existsSync(localPasswordFile) ? fs.readFileSync(localPasswordFile, 'utf8') : '');
const digest = value => createHash('sha256').update(value).digest();
const matches = (input, expected) => typeof input === 'string' && timingSafeEqual(digest(input), digest(expected));
const sessions = new Map();
const attempts = new Map();
const trackingAttempts = new Map();
const ttl = 8 * 60 * 60 * 1000;
const cookie = { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === '1', path: '/api' };
const sessionId = req => (req.headers.cookie || '').match(/(?:^|;\s*)bps_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const cleanup = setInterval(() => {
  for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
  for (const limits of [attempts, trackingAttempts]) {
    for (const [key, attempt] of limits) if (attempt.expiry <= Date.now()) limits.delete(key);
  }
}, 60_000);
cleanup.unref();

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.post('/api/login', (req, res) => {
  const key = req.ip;
  let attempt = attempts.get(key);
  if (!attempt || attempt.expiry <= Date.now()) {
    attempt = { count: 0, expiry: Date.now() + 60_000 };
    attempts.set(key, attempt);
  }
  if (attempt.count >= 10) return res.status(429).json({ error: 'Try again in one minute.' });
  const { username, password } = req.body || {};
  const validUser = matches(typeof username === 'string' ? username.trim() : username, adminUsername);
  const validPassword = Boolean(adminPassword) && matches(password, adminPassword);
  if (!validUser || !validPassword) {
    attempt.count++;
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  attempts.delete(key);
  sessions.delete(sessionId(req));
  const id = randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + ttl);
  res.cookie('bps_session', id, { ...cookie, maxAge: ttl }).json({ success: true });
});
app.post('/api/logout', (req, res) => {
  sessions.delete(sessionId(req));
  res.clearCookie('bps_session', cookie).json({ success: true });
});
app.get('/api/session', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ authenticated: (sessions.get(sessionId(req)) || 0) > Date.now() });
});
function requireAdmin(req, res, next) {
  if ((sessions.get(sessionId(req)) || 0) <= Date.now()) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  next();
}
app.use('/api/admin', requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 8192, parts: 14 } });
function savePhoto(file) {
  if (!file) return null;
  const bytes = file.buffer;
  let extension;
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) extension = 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) extension = 'gif';
  if (!extension) throw Object.assign(new Error('Upload a JPEG, PNG, WebP or GIF image.'), { status: 400 });
  const filename = randomBytes(16).toString('hex') + '.' + extension;
  fs.writeFileSync(path.join(photoDir, filename), bytes, { flag: 'wx', mode: 0o600 });
  return filename;
}
function removePhoto(filename) {
  if (filename) fs.rmSync(path.join(photoDir, filename), { force: true });
}
const photoUrl = filename => filename ? '/api/admin/photos/' + filename : null;
const record = row => ({ ...row, photo: photoUrl(row.photo), proof: photoUrl(row.proof) });
const byTicket = db.prepare('SELECT * FROM complaints WHERE ticket = ?');
const all = db.prepare('SELECT * FROM complaints WHERE trashedAt IS NULL ORDER BY createdAt DESC, ticket');
const bin = db.prepare('SELECT * FROM complaints WHERE trashedAt IS NOT NULL ORDER BY trashedAt DESC, ticket');
const activeByTicket = db.prepare('SELECT * FROM complaints WHERE ticket = ? AND trashedAt IS NULL');
const addHistory = db.prepare('INSERT INTO complaint_history(ticket,type,status,remarks,createdAt) VALUES (?,?,?,?,?)');
const photoFilename = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;
const referencedPhoto = db.prepare('SELECT 1 FROM complaints WHERE photo = ? OR proof = ? LIMIT 1');
const retirePhoto = db.prepare('INSERT OR IGNORE INTO retired_photos(filename) VALUES (?)');
function schedulePhotoRemoval(filename) {
  if (filename && photoFilename.test(filename)) retirePhoto.run(filename);
}
function cleanRetiredPhotos() {
  for (const { filename } of db.prepare('SELECT filename FROM retired_photos').all()) {
    try {
      if (photoFilename.test(filename) && !referencedPhoto.get(filename, filename)) removePhoto(filename);
      db.prepare('DELETE FROM retired_photos WHERE filename = ?').run(filename);
    } catch (error) {
      console.error('Could not remove retired upload:', error.code);
    }
  }
}
cleanRetiredPhotos();
setInterval(cleanRetiredPhotos, 60_000).unref();
function requestError(status, message) {
  return Object.assign(new Error(message), { status });
}
function requireComplaint(ticket) {
  const row = byTicket.get(ticket);
  if (!row) throw requestError(404, 'Complaint not found.');
  return row;
}
const publicRecord = ({ ticket, status, category, createdAt, updatedAt }) => ({ ticket, status, category, createdAt, updatedAt });

app.get('/api/stats', (req, res) => {
  const counts = { total: 0, pending: 0, inProgress: 0, resolved: 0 };
  for (const { status, count } of db.prepare('SELECT status, COUNT(*) AS count FROM complaints WHERE trashedAt IS NULL GROUP BY status').all()) {
    counts[status === 'in_progress' ? 'inProgress' : status] = count;
    counts.total += count;
  }
  res.json(counts);
});
app.post('/api/complaints', upload.single('photo'), (req, res) => {
  const fields = formFields.map(field => typeof req.body?.[field] === 'string' ? req.body[field].trim() : '');
  if (requiredFields.some(field => !fields[formFields.indexOf(field)])) {
    return res.status(400).json({ error: 'Complete all required complaint fields.' });
  }
  const ticket = 'BPS-' + randomBytes(8).toString('hex').toUpperCase();
  const photo = savePhoto(req.file);
  const timestamp = now();
  try {
    transaction(() => {
      insert.run(ticket, ...fields, photo, 'pending', timestamp, timestamp);
      addHistory.run(ticket, 'status', 'pending', null, timestamp);
    });
  } catch (error) {
    removePhoto(photo);
    throw error;
  }
  res.status(201).json(publicRecord(byTicket.get(ticket)));
});
const byPhone = db.prepare('SELECT * FROM complaints WHERE trashedAt IS NULL AND normalized_phone(phone) = ? ORDER BY createdAt DESC, ticket');

app.get('/api/track', (req, res) => {
  let attempt = trackingAttempts.get(req.ip);
  if (!attempt || attempt.expiry <= Date.now()) {
    attempt = { count: 0, expiry: Date.now() + 60_000 };
    trackingAttempts.set(req.ip, attempt);
  }
  if (attempt.count++ >= 30) {
    return res.set('Retry-After', String(Math.ceil((attempt.expiry - Date.now()) / 1000)))
      .status(429).json({ error: 'Too many tracking requests. Try again shortly.' });
  }
  const query = typeof req.query.q === 'string' ? req.query.q.trim().toUpperCase() : '';
  const phone = normalizePhone(query);
  const ticket = query ? activeByTicket.get(query) : undefined;
  const rows = ticket ? [ticket] : phone ? byPhone.all(phone) : [];
  res.json(rows.map(publicRecord));
});
app.get('/api/admin/complaints', (req, res) => {
  const { view } = req.query;
  if (view !== undefined && view !== 'active' && view !== 'bin') {
    throw requestError(400, 'Use view=active or view=bin.');
  }
  res.json((view === 'bin' ? bin : all).all().map(record));
});
app.get('/api/admin/complaints/:ticket/history', (req, res) => {
  const { ticket } = requireComplaint(req.params.ticket);
  res.json(db.prepare('SELECT * FROM complaint_history WHERE ticket = ? ORDER BY id').all(ticket));
});
app.patch('/api/admin/complaints/:ticket', upload.single('proof'), (req, res) => {
  let proof;
  const ticket = req.params.ticket;
  try {
    transaction(() => {
      const row = requireComplaint(ticket);
      if (row.trashedAt) throw requestError(409, 'Restore this complaint before editing.');
      const { status = row.status, remarks = row.remarks } = req.body || {};
      if (!statuses.includes(status) || typeof remarks !== 'string' || remarks.length > 8192) {
        throw requestError(400, 'Invalid status or remarks.');
      }
      const response = remarks.trim();
      proof = savePhoto(req.file);
      if (status === row.status && response === row.remarks && !proof) return;
      const timestamp = now();
      db.prepare('UPDATE complaints SET status=?, remarks=?, proof=?, updatedAt=? WHERE ticket=?')
        .run(status, response, proof || row.proof, timestamp, ticket);
      if (status !== row.status) addHistory.run(ticket, 'status', status, null, timestamp);
      if (response !== row.remarks || proof) addHistory.run(ticket, 'response', null, response, timestamp);
      if (proof) schedulePhotoRemoval(row.proof);
    });
  } catch (error) {
    removePhoto(proof);
    throw error;
  }
  cleanRetiredPhotos();
  res.json(record(byTicket.get(ticket)));
});
app.post('/api/admin/complaints/:ticket/trash', (req, res) => {
  const updated = transaction(() => {
    const row = requireComplaint(req.params.ticket);
    if (row.trashedAt || row.status !== 'resolved') throw requestError(409, 'Only active resolved complaints can be moved to the bin.');
    db.prepare('UPDATE complaints SET trashedAt=? WHERE ticket=?').run(now(), row.ticket);
    return byTicket.get(row.ticket);
  });
  res.json(record(updated));
});
app.post('/api/admin/complaints/:ticket/restore', (req, res) => {
  const updated = transaction(() => {
    const row = requireComplaint(req.params.ticket);
    if (!row.trashedAt) throw requestError(409, 'Complaint must be in the bin.');
    db.prepare('UPDATE complaints SET trashedAt=NULL WHERE ticket=?').run(row.ticket);
    return byTicket.get(row.ticket);
  });
  res.json(record(updated));
});
app.delete('/api/admin/complaints/:ticket', (req, res) => {
  if (req.body?.confirmed !== true) throw requestError(400, 'Purge requires confirmed: true.');
  transaction(() => {
    const row = requireComplaint(req.params.ticket);
    if (!row.trashedAt) throw requestError(409, 'Complaint must be in the bin.');
    schedulePhotoRemoval(row.photo);
    schedulePhotoRemoval(row.proof);
    db.prepare('DELETE FROM complaints WHERE ticket=?').run(row.ticket);
  });
  cleanRetiredPhotos();
  res.json({ success: true });
});
app.get('/api/admin/photos/:filename', (req, res, next) => {
  const { filename } = req.params;
  if (!photoFilename.test(filename) || !referencedPhoto.get(filename, filename)) return res.sendStatus(404);
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(filename, { root: photoDir }, error => { if (error) next(error); });
});
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const reportFields = ['ticket', 'category', 'division', 'status', 'response', 'createdAt', 'updatedAt'];
const canonicalDivision = value => value === 'Bibile Town' ? 'Bibile' : value;
function reportRow({ ticket, category, division, status, remarks, proof, createdAt, updatedAt }) {
  return { ticket, category, division: canonicalDivision(division), status, response: remarks?.trim() || proof ? 'responded' : 'unresponded', createdAt, updatedAt };
}
function reportFilters(query) {
  const filters = {};
  for (const field of ['from', 'to', 'category', 'division', 'status', 'response', 'lang']) {
    const value = query[field] ?? '';
    if (typeof value !== 'string' || value.length > 200) throw requestError(400, 'Invalid ' + field + '.');
    filters[field] = value.trim();
  }
  for (const field of ['from', 'to']) {
    const value = filters[field];
    if (!value) continue;
    const date = new Date(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.valueOf())
        || date.toISOString().slice(0, 10) !== value) throw requestError(400, 'Use YYYY-MM-DD for ' + field + '.');
  }
  if (filters.from && filters.to && filters.from > filters.to) throw requestError(400, 'From must be on or before to.');
  if (filters.status && !statuses.includes(filters.status)) throw requestError(400, 'Invalid status.');
  if (filters.response && !['responded', 'unresponded'].includes(filters.response)) throw requestError(400, 'Invalid response.');
  filters.division = canonicalDivision(filters.division);
  filters.lang ||= 'si';
  if (!['si', 'ta', 'en'].includes(filters.lang)) throw requestError(400, 'Invalid language.');
  return filters;
}
function chartCounts(rows, field) {
  const counts = new Map();
  for (const row of rows) counts.set(row[field], (counts.get(row[field]) || 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
}
const reportDateKey = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function reportModel(query) {
  const filters = reportFilters(query);
  const rows = all.all().map(reportRow).filter(row => {
    if (['category', 'division', 'status', 'response'].some(field => filters[field] && row[field] !== filters[field])) return false;
    if (!filters.from && !filters.to) return true;
    const timestamp = new Date(row.createdAt);
    if (!Number.isFinite(timestamp.valueOf())) return false;
    const date = reportDateKey.format(timestamp);
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  });
  const charts = {
    byStatus: chartCounts(rows, 'status'),
    byCategory: chartCounts(rows, 'category'),
    byDivision: chartCounts(rows, 'division'),
    byResponse: chartCounts(rows, 'response'),
  };
  return { rows, charts, filters };
}
function sendCsv(res, rows) {
  const csv = rows.map(row => reportFields.map(field => csvCell(row[field])).join(','));
  res.attachment('complaints.csv').type('text/csv').send('\uFEFF' + [reportFields.join(','), ...csv].join('\r\n') + '\r\n');
}
app.get('/api/admin/export', (req, res) => {
  const { month } = req.query;
  if (month !== undefined && (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    throw requestError(400, 'Use month=YYYY-MM.');
  }
  const rows = all.all().filter(row => !month || row.createdAt.startsWith(month)).map(reportRow);
  sendCsv(res, rows);
});
app.get('/api/admin/report', (req, res) => res.json(reportModel(req.query)));
app.get('/api/admin/report.csv', (req, res) => {
  const { rows, filters } = reportModel(req.query);
  if (filters.lang !== 'si') return sendCsv(res, rows);

  const { formatTrackerDate } = require('./public/lang.js');
  sendCsv(res, rows.map(row => ({
    ...row,
    createdAt: formatTrackerDate('si', row.createdAt, { dateOnly: false }),
    updatedAt: formatTrackerDate('si', row.updatedAt, { dateOnly: false }),
  })));
});
function sendReportFile(method, extension, mime) {
  return async (req, res) => {
    const model = reportModel(req.query);
    const filename = path.join(__dirname, 'report-export.js');
    if (!fs.existsSync(filename)) throw requestError(503, 'Report file generator is unavailable.');
    const contents = await require(filename)[method](model);
    res.attachment('complaints.' + extension).type(mime).send(contents);
  };
}
app.get('/api/admin/report.pdf', sendReportFile('generatePdf', 'pdf', 'application/pdf'));
app.get('/api/admin/report.xlsx', sendReportFile('generateXlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

app.use(express.static(publicDir, { dotfiles: 'deny' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error instanceof multer.MulterError ? 400 : error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Server error.' : error.message });
});
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.RENDER === 'true' ? '0.0.0.0' : 'localhost');
app.listen(port, host, function () {
  console.log('Bibile tracker listening on port ' + this.address().port);
});
