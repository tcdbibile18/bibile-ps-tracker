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
    if (record.trashedAt) fail_(409);
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
    return found && !found.record.trashedAt ? [summary_(found.record)] : [];
  }
  if (action === 'stats') {
    const counts = {total: 0, pending: 0, inProgress: 0, resolved: 0};
    for (const {status, trashedAt} of rows_(sheet_())) {
      if (trashedAt) continue;
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
  if (action === 'list') {
    const view = data.view || 'active';
    if (!['active', 'bin'].includes(view)) fail_(400);
    return rows_(sheet_()).reverse().filter(record => Boolean(record.trashedAt) === (view === 'bin')).map(staffRecord_);
  }
  if (action === 'update') return update_(data);
  if (['trash', 'restore', 'purge', 'deletePhoto'].includes(action)) return mutateRecord_(action, data);
  if (action === 'report' || action === 'export') {
    const report = report_(data);
    return action === 'report' ? report : exportReport_(report, data.format);
  }
  if (action === 'history' || action === 'photo') {
    const found = find_(sheet_(), data.ticket);
    if (!found) fail_(404);
    if (action === 'history') return found.record.history;
    if (!['photo', 'proof'].includes(data.kind) || !found.record[data.kind]) fail_(404);
    const file = DriveApp.getFileById(found.record[data.kind]);
    if (file.isTrashed()) fail_(404);
    const blob = file.getBlob();
    const mime = blob.getContentType();
    if (!Object.prototype.hasOwnProperty.call(IMAGE_TYPES, mime)) fail_(404);
    return {mime, base64: Utilities.base64Encode(blob.getBytes())};
  }
  fail_(404);
}

function trashAttachment_(id) {
  if (!id) return;
  const file = DriveApp.getFileById(id);
  if (!file.isTrashed()) file.setTrashed(true);
}

function mutateRecord_(action, data) {
  if (['purge', 'deletePhoto'].includes(action) && data.confirmed !== true) fail_(400);
  if (action === 'deletePhoto' && !['photo', 'proof'].includes(data.kind)) fail_(400);
  return locked_(() => {
    const sheet = sheet_();
    const found = find_(sheet, data.ticket);
    if (!found) fail_(404);
    const {record, row} = found;
    if (action === 'purge') {
      if (!record.trashedAt) fail_(409);
      trashAttachment_(record.photo);
      trashAttachment_(record.proof);
      sheet.deleteRow(row);
      return {success: true};
    }
    if (action === 'deletePhoto') {
      if (record.trashedAt) fail_(409);
      if (record[data.kind]) {
        trashAttachment_(record[data.kind]);
        record[data.kind] = '';
        record.updatedAt = new Date().toISOString();
      }
    } else if (action === 'trash') {
      if (record.status !== 'resolved') fail_(409);
      if (!record.trashedAt) record.trashedAt = new Date().toISOString();
    } else {
      record.trashedAt = '';
    }
    writeRecord_(sheet, row, record);
    return staffRecord_(record);
  });
}

const REPORT_COLUMNS = ['ticket', 'category', 'division', 'status', 'response', 'createdAt', 'updatedAt'];
const REPORT_HEADERS = {
  en: ['Reference', 'Category', 'GN division', 'Status', 'Officer response', 'Submitted', 'Updated'],
  si: ['යොමු අංකය', 'සේවා කාණ්ඩය', 'ග්‍රාම නිලධාරී වසම', 'තත්ත්වය', 'නිලධාරී පිළිතුර', 'ඉදිරිපත් කළ දිනය', 'යාවත්කාලීන කළ දිනය'],
  ta: ['குறிப்பு எண்', 'வகை', 'கிராம அலுவலர் பிரிவு', 'நிலை', 'அலுவலர் பதில்', 'சமர்ப்பித்த தேதி', 'புதுப்பித்த தேதி']
};
const REPORT_GROUPS = {byStatus: 'status', byCategory: 'category', byDivision: 'division', byResponse: 'response'};

function report_(data) {
  const filters = {};
  for (const key of ['from', 'to', 'category', 'division', 'status', 'response', 'lang']) {
    if (data[key] != null && typeof data[key] !== 'string') fail_(400);
    filters[key] = text_(data[key], 200, true);
  }
  if (!filters.lang) filters.lang = 'si';
  for (const value of [filters.from, filters.to]) {
    if (!value) continue;
    const date = new Date(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value) fail_(400);
  }
  if ((filters.from && filters.to && filters.from > filters.to) ||
      (filters.status && !STATUSES.includes(filters.status)) ||
      (filters.response && !['responded', 'unresponded'].includes(filters.response)) ||
      !Object.prototype.hasOwnProperty.call(REPORT_HEADERS, filters.lang)) fail_(400);
  const divisionName = value => value === 'Bibile Town' ? 'Bibile' : value;
  filters.division = divisionName(filters.division);
  const rows = rows_(sheet_()).reverse().filter(record => !record.trashedAt).map(record => ({
    ...summary_(record),
    division: divisionName(record.division),
    response: (record.remarks && record.remarks.trim()) || record.proof ? 'responded' : 'unresponded'
  })).filter(row => {
    if (['category', 'division', 'status', 'response'].some(key => filters[key] && row[key] !== filters[key])) return false;
    if (!filters.from && !filters.to) return true;
    const day = Utilities.formatDate(new Date(row.createdAt), 'Asia/Colombo', 'yyyy-MM-dd');
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  });
  const charts = {};
  for (const [key, field] of Object.entries(REPORT_GROUPS)) {
    const counts = new Map();
    for (const row of rows) counts.set(row[field], (counts.get(row[field]) || 0) + 1);
    charts[key] = [...counts].map(([label, count]) => ({label, count})).sort((a, b) => a.label.localeCompare(b.label));
  }
  return {rows, charts, filters};
}

const EXPORT_MIME = {
  csv: 'text/csv', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const REPORT_MONTHS_SI = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි',
  'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'];

function exportDate_(value, lang) {
  const date = new Date(value);
  if (lang !== 'si') return Utilities.formatDate(date, 'Asia/Colombo', 'yyyy-MM-dd HH:mm');
  const [year, month, day, time] = Utilities.formatDate(date, 'Asia/Colombo', 'yyyy-M-dd-HH:mm').split('-');
  return year + ' ' + REPORT_MONTHS_SI[Number(month) - 1] + ' ' + day + ' ' + time;
}

function exportReport_(report, format) {
  if (!Object.prototype.hasOwnProperty.call(EXPORT_MIME, format)) fail_(400);
  const lang = report.filters.lang;
  const matrix = [REPORT_HEADERS[lang], ...report.rows.map(row => REPORT_COLUMNS.map(key =>
    key.endsWith('At') ? exportDate_(row[key], lang) : row[key]))];
  const mime = EXPORT_MIME[format];
  let blob;
  if (format === 'csv') {
    const csv = '\uFEFF' + matrix.map(row => row.map(value => {
      const cell = String(value == null ? '' : value);
      const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(cell) ? "'" + cell : cell;
      return '"' + safe.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n') + '\r\n';
    blob = Utilities.newBlob(csv, mime);
  } else {
    blob = exportWorkbook_(matrix, report.charts, format);
  }
  return {name: 'bibile-complaints.' + format, mime, base64: Utilities.base64Encode(blob.getBytes())};
}

function styleReportTable_(sheet, start, matrix, headerColor) {
  const width = matrix[0].length;
  const range = sheet.getRange(start, 1, matrix.length, width);
  range.setFontSize(11).setFontColor('#17364d').setWrap(true).setVerticalAlignment('middle')
    .setBackgrounds(matrix.map((row, index) =>
      row.map(() => index === 0 ? headerColor : index % 2 ? '#ffffff' : '#eaf5fc')))
    .setBorder(true, true, true, true, true, true, '#91adc1', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(start, 1, 1, width).setFontColor('#ffffff').setFontWeight('bold');
}

function styleReportTitle_(sheet, lastColumn, title) {
  sheet.setHiddenGridlines(true);
  sheet.setRowHeight(1, 34);
  sheet.getRange(1, 1, 1, lastColumn).merge().setValue(title)
    .setBackground('#0c4a6e').setFontColor('#ffffff').setFontSize(15).setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle');
}

function addReportCharts_(book, charts) {
  const sheet = book.insertSheet('Charts');
  const titles = ['By status', 'By category', 'By GN division', 'By officer response'];
  const colors = ['#0369a1', '#15803d', '#7e22ce', '#b45309'];
  styleReportTitle_(sheet, 8, 'Complaint Report - Summary and Charts');
  sheet.setColumnWidth(1, 230);
  sheet.setColumnWidth(2, 76);
  sheet.setColumnWidth(3, 16);
  sheet.setColumnWidths(4, 5, 118);
  let top = 3;
  Object.keys(REPORT_GROUPS).forEach((key, index) => {
    const entries = charts[key];
    const height = Math.max(220, 86 + entries.length * 22);
    const rows = [[titles[index], 'Count'], ...entries.map(({label, count}) => ["'" + label, count])];
    const blockRows = entries.length ? Math.max(rows.length, Math.ceil(height / 25)) : rows.length;
    const end = top + blockRows - 1;
    if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
    sheet.setRowHeights(top, blockRows, 25);
    const range = sheet.getRange(top, 1, rows.length, 2);
    range.setValues(rows);
    styleReportTable_(sheet, top, rows, colors[index]);
    sheet.getRange(top, 2, rows.length, 1).setHorizontalAlignment('center');
    sheet.autoResizeRows(top, rows.length);
    if (entries.length) {
      sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.BAR).addRange(range)
        .setNumHeaders(1).setPosition(top, 4, 0, 0).setOption('title', titles[index])
        .setOption('width', 580).setOption('height', height)
        .setOption('chartArea', {left: '37%', top: 44, width: '58%', height: '72%'})
        .setOption('legend', {position: 'none'}).setOption('colors', [colors[index]]).build());
      const tableHeight = rows.reduce((sum, _, offset) => sum + sheet.getRowHeight(top + offset), 0);
      top += rows.length + Math.ceil(Math.max(0, height - tableHeight) / 25) + 2;
    } else {
      top += rows.length + 2;
    }
  });
}

function exportWorkbook_(matrix, charts, format) {
  const book = SpreadsheetApp.create('Bibile Pradeshiya Sabha - Complaint Report');
  try {
    const sheet = book.getSheets()[0];
    sheet.setName('Complaints');
    const count = matrix.length + 2;
    if (count > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), count - sheet.getMaxRows());
    styleReportTitle_(sheet, REPORT_COLUMNS.length, 'Bibile Pradeshiya Sabha - Complaint Report');
    [272, 150, 150, 105, 131, 175, 175].forEach((width, index) => sheet.setColumnWidth(index + 1, width));
    const values = matrix.map(row => row.map(value => value == null || value === '' ? '' : "'" + value));
    sheet.getRange(3, 1, matrix.length, REPORT_COLUMNS.length).setNumberFormat('@').setValues(values);
    styleReportTable_(sheet, 3, matrix, '#0369a1');
    sheet.autoResizeRows(3, matrix.length);
    sheet.setFrozenRows(3);
    addReportCharts_(book, charts);
    SpreadsheetApp.flush();
    const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(book.getId()) +
      '/export?format=' + format + (format === 'pdf' ?
        '&size=A4&portrait=false&fitw=true&gridlines=false&fzr=true&top_margin=0.40&bottom_margin=0.40&left_margin=0.40&right_margin=0.40' : '');
    const response = UrlFetchApp.fetch(url, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    });
    const blob = response.getBlob();
    if (response.getResponseCode() !== 200 || !blob.getContentType().startsWith(EXPORT_MIME[format])) fail_(502);
    return blob;
  } finally {
    discard_(book.getId());
  }
}
