const TABLE = 'BPS Complaints';
const FIELDS = ['name', 'phone', 'nic', 'address', 'division', 'category', 'description'];
const STATUSES = ['pending', 'in_progress', 'resolved'];
const IMAGE_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif'};
const MAX_PHOTO = 2 * 1024 * 1024;
const COLUMNS = ['ticket', 'status', 'division', 'category', 'createdAt', 'updatedAt', 'name', 'phone',
  'nic', 'address', 'description', 'remarks'];
const RECORD_COLUMN = COLUMNS.length + 1;

function settings_() {
  return PropertiesService.getScriptProperties();
}

function resourceId_(value, pathPrefix) {
  const input = (value || '').trim();
  const urlPrefix = 'https://' + pathPrefix;
  const id = input.startsWith(urlPrefix) ? input.slice(urlPrefix.length).split(/[/?#]/, 1)[0] : input;
  return /^[A-Za-z0-9_-]{15,}$/.test(id) ? id : '';
}

function spreadsheetId_(properties) {
  return resourceId_(properties.getProperty('SPREADSHEET_ID'), 'docs.google.com/spreadsheets/d/');
}

function folderId_(properties) {
  return resourceId_(properties.getProperty('UPLOAD_FOLDER_ID'), 'drive.google.com/drive/folders/');
}

function sheet_() {
  const id = spreadsheetId_(settings_());
  if (!id) setupRequired_();
  let spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(id); }
  catch (_) { setupRequired_(); }
  const sheet = spreadsheet.getSheetByName(TABLE);
  if (!sheet) setupRequired_();
  return sheet;
}

function setupRequired_() {
  throw Object.assign(new Error('Run setup in the Apps Script editor.'), {status: 503, code: 'setup_required'});
}

function spreadsheetForSetup_(id) {
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (_) { console.warn('Could not open SPREADSHEET_ID. Checking for a bound spreadsheet.'); }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Set SPREADSHEET_ID to an accessible spreadsheet, or run setup from a script bound to a spreadsheet.');
}

function folderForSetup_(id) {
  if (!id) return DriveApp.createFolder('Bibile Pradeshiya Sabha Complaint Uploads');
  try { return DriveApp.getFolderById(id); }
  catch (_) { throw new Error('UPLOAD_FOLDER_ID is inaccessible. Correct it or clear it to create a private folder.'); }
}

function uploadFolder_() {
  const id = folderId_(settings_());
  if (!id) setupRequired_();
  try { return DriveApp.getFolderById(id); }
  catch (_) { setupRequired_(); }
}

// Run once in the Apps Script editor as the owner.
function setup() {
  const properties = settings_();
  const password = properties.getProperty('ADMIN_PASSWORD');
  if (!password || password.length < 16 || password.length > 512) {
    throw new Error('Set ADMIN_PASSWORD to 16–512 characters.');
  }
  locked_(() => {
    const spreadsheet = spreadsheetForSetup_(spreadsheetId_(properties));
    const folder = folderForSetup_(folderId_(properties));
    let sheet = spreadsheet.getSheetByName(TABLE);
    if (!sheet) sheet = spreadsheet.insertSheet(TABLE);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Reference number', 'Status', 'GN division', 'Category', 'Submitted (UTC)', 'Updated (UTC)',
        'Name', 'Phone', 'NIC', 'Address', 'Description', 'Officer remarks', 'Application record (JSON)']);
      sheet.setFrozenRows(1);
      sheet.hideColumns(RECORD_COLUMN);
    }
    SpreadsheetApp.flush();
    properties.setProperties({SPREADSHEET_ID: spreadsheet.getId(), UPLOAD_FOLDER_ID: folder.getId()});
  });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ok: true, service: 'Bibile complaint tracker'});
}

function doPost(event) {
  try {
    const raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > 3 * 1024 * 1024) fail_(400);
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { fail_(400); }
    if (!payload || typeof payload !== 'object') fail_(400);
    return json_({ok: true, data: dispatch_(payload.action, payload.token, payload.data || {})});
  } catch (error) {
    if (!error.status) console.error('Complaint API operation failed.');
    return json_({ok: false, status: error.status || 500, code: error.code});
  }
}

function fail_(status) {
  throw Object.assign(new Error('Request failed'), {status});
}

function locked_(operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_(503);
  try {
    const result = operation();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function digest_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
}

function matches_(value, expected) {
  const left = digest_(typeof value === 'string' && value.length <= 512 ? value : '');
  const right = digest_(expected);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function login_(data) {
  const properties = settings_();
  const password = properties.getProperty('ADMIN_PASSWORD');
  if (!password || password.length < 16) fail_(503);
  const cache = CacheService.getScriptCache();
  // Global failed-login limit since anonymous Apps Script requests lack a trusted client IP.
  return locked_(() => {
    const key = 'bps-login-failures';
    const failures = Number(cache.get(key) || 0);
    if (failures >= 15) fail_(429);
    const userOk = matches_(data.username, properties.getProperty('ADMIN_USERNAME') || 'admin');
    const passwordOk = matches_(data.password, password);
    if (!userOk || !passwordOk) {
      cache.put(key, String(failures + 1), 60);
      fail_(401);
    }
    cache.remove(key);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('session:' + digest_(token), digest_(password), 3600);
    return {token};
  });
}

function authorize_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{72}$/i.test(token)) fail_(401);
  const key = 'session:' + digest_(token);
  const password = settings_().getProperty('ADMIN_PASSWORD');
  if (!password || CacheService.getScriptCache().get(key) !== digest_(password)) fail_(401);
  return key;
}

function rows_(sheet) {
  const count = sheet.getLastRow() - 1;
  return count > 0 ? sheet.getRange(2, RECORD_COLUMN, count, 1).getValues().map(([value]) => JSON.parse(value)) : [];
}

function find_(sheet, ticket) {
  const count = sheet.getLastRow() - 1;
  if (count < 1 || typeof ticket !== 'string' || !/^BPS-[A-F0-9]{32}$/.test(ticket)) return null;
  const cell = sheet.getRange(2, 1, count, 1).createTextFinder(ticket).matchEntireCell(true).findNext();
  if (!cell) return null;
  const row = cell.getRow();
  return {row, record: JSON.parse(sheet.getRange(row, RECORD_COLUMN).getValue())};
}

function writeRecord_(sheet, row, record) {
  // Plain text columns and a leading apostrophe keep citizen input from becoming a Sheets formula.
  const cells = COLUMNS.map(key => record[key] ? "'" + record[key] : '');
  const serialized = JSON.stringify(record);
  if (serialized.length > 45000) fail_(400);
  cells.push(serialized);
  sheet.getRange(row, 1, 1, RECORD_COLUMN).setNumberFormat('@').setValues([cells]);
}

function summary_({ticket, status, category, createdAt, updatedAt}) {
  return {ticket, status, category, createdAt, updatedAt};
}

function staffRecord_(record) {
  const {history, photo, proof, ...fields} = record;
  return {...fields, photo: Boolean(photo), proof: Boolean(proof)};
}

function text_(value, max, optional = false) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (cleaned.length > max || (!optional && !cleaned)) fail_(400);
  return cleaned;
}

function image_(upload, name) {
  if (!upload) return '';
  const {mime, base64} = upload;
  if (!Object.prototype.hasOwnProperty.call(IMAGE_TYPES, mime) ||
      typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PHOTO / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail_(400);
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (_) { fail_(400); }
  if (!bytes.length || bytes.length > MAX_PHOTO || !imageSignature_(bytes, mime)) fail_(400);
  return uploadFolder_()
    .createFile(Utilities.newBlob(bytes, mime, name + IMAGE_TYPES[mime])).getId();
}

function imageSignature_(bytes, mime) {
  const prefix = bytes.slice(0, 12).map(byte => byte & 255);
  const starts = (...expected) => expected.every((byte, index) => prefix[index] === byte);
  if (mime === 'image/jpeg') return starts(255, 216, 255);
  if (mime === 'image/png') return starts(137, 80, 78, 71, 13, 10, 26, 10);
  const ascii = String.fromCharCode(...prefix);
  if (mime === 'image/gif') return /^GIF8[79]a/.test(ascii);
  return ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP';
}

function discard_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (_) { console.error('Drive file cleanup failed.'); }
}

function submit_(data) {
  const fields = {};
  for (const field of FIELDS) {
    fields[field] = text_(data[field], field === 'description' ? 8000 : 300, field === 'nic');
  }
  const ticket = 'BPS-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
  const timestamp = new Date().toISOString();
  const record = {ticket, ...fields, status: 'pending', remarks: '', createdAt: timestamp, updatedAt: timestamp,
    photo: '', proof: '', history: [{type: 'status', status: 'pending', createdAt: timestamp}]};
  try {
    record.photo = image_(data.photo, ticket + '-submission');
    locked_(() => {
      const sheet = sheet_();
      const row = sheet.getLastRow() + 1;
      const capacity = sheet.getMaxRows();
      if (row > capacity) sheet.insertRowsAfter(capacity, 1000);
      writeRecord_(sheet, row, record);
    });
  } catch (error) {
    discard_(record.photo);
    throw error;
  }
  return summary_(record);
}

function update_(data) {
  if (!STATUSES.includes(data.status)) fail_(400);
  const remarks = text_(data.remarks, 4000, true);
  return locked_(() => {
    const sheet = sheet_();
    const found = find_(sheet, data.ticket);
    if (!found) fail_(404);
    const {record, row} = found;
    const timestamp = new Date().toISOString();
    const oldProof = record.proof;
    let proof = '';
    try {
      proof = image_(data.proof, record.ticket + '-resolution');
      if (record.status !== data.status) record.history.push({type: 'status', status: data.status, createdAt: timestamp});
      if (record.remarks !== remarks || proof) record.history.push({type: 'response', remarks, createdAt: timestamp});
      Object.assign(record, {status: data.status, remarks, updatedAt: timestamp, proof: proof || oldProof});
      // A Sheets cell can contain at most 50,000 characters. The latest record always remains intact.
      while (JSON.stringify(record).length > 45000 && record.history.length > 1) record.history.shift();
      writeRecord_(sheet, row, record);
      SpreadsheetApp.flush();
    } catch (error) {
      discard_(proof);
      throw error;
    }
    if (proof) discard_(oldProof);
    return staffRecord_(record);
  });
}

function dispatch_(action, token, data) {
  if (action === 'login') return login_(data);
  if (action === 'submit') return submit_(data);
  if (action === 'track') {
    const ticket = typeof data.q === 'string' ? data.q.trim().toUpperCase() : '';
    const found = find_(sheet_(), ticket);
    return found ? [summary_(found.record)] : [];
  }
  if (action === 'stats') {
    const counts = {total: 0, pending: 0, inProgress: 0, resolved: 0};
    for (const {status} of rows_(sheet_())) {
      counts.total++;
      counts[status === 'in_progress' ? 'inProgress' : status]++;
    }
    return counts;
  }

  const session = authorize_(token);
  if (action === 'logout') {
    CacheService.getScriptCache().remove(session);
    return null;
  }
  if (action === 'list') return rows_(sheet_()).reverse().map(staffRecord_);
  if (action === 'update') return update_(data);
  if (action === 'history' || action === 'photo') {
    const found = find_(sheet_(), data.ticket);
    if (!found) fail_(404);
    if (action === 'history') return found.record.history;
    if (!['photo', 'proof'].includes(data.kind) || !found.record[data.kind]) fail_(404);
    const blob = DriveApp.getFileById(found.record[data.kind]).getBlob();
    const mime = blob.getContentType();
    if (!Object.prototype.hasOwnProperty.call(IMAGE_TYPES, mime)) fail_(404);
    return {mime, base64: Utilities.base64Encode(blob.getBytes())};
  }
  fail_(404);
}
