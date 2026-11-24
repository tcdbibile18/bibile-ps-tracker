'use strict';

const select = (selector, root = document) => root.querySelector(selector);
const translated = (key, fallback) => {
  const value = window.t?.(key);
  return value && value !== key ? value : fallback;
};

const statuses = {pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved'};
const options = {
  status: Object.keys(statuses),
  division: window.gnDivisions,
  category: window.serviceCategories
};
const divisionName = value => value === 'Bibile Town' ? 'Bibile' : value;
const optionKey = (type, value) => ({
  status: 'status.' + statuses[value],
  division: 'divisions.' + divisionName(value),
  category: 'categories.' + value
})[type];
const label = (type, value) => translated(optionKey(type, value), statuses[value] || value);
for (const menu of document.querySelectorAll('[data-options]')) {
  const type = menu.dataset.options;
  for (const value of options[type]) {
    const option = new Option(label(type, value), value);
    option.dataset.i18n = optionKey(type, value);
    menu.add(option);
  }
}

async function request(path, config) {
  if (staticBackend) return appsScriptRequest(path, config);
  const response = await fetch(path, { credentials: 'same-origin', ...config });
  if (!response.ok) {
    const error = new Error('Request failed');
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
}

function showMessage(root, key = '', fallback = '') {
  const node = select('[data-message]', root);
  node.dataset.messageKey = key;
  node.dataset.messageFallback = fallback;
  node.textContent = key ? translated(key, fallback) : '';
}

function handleForm(form, action, errorText = 'Something went wrong. Please try again.') {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter || select('button', form);
    if (button.disabled) return;
    button.disabled = true;
    showMessage(form);
    try {
      await action(new FormData(form));
    } catch (error) {
      const unauthorized = form.id === 'login-form' && [401, 403].includes(error.status);
      if (error.setup) showMessage(form, 'static.setup', 'The complaint service has not been configured.');
      else if (error.code === 'reference_exhausted') showMessage(form, 'complaint.referenceExhausted', 'No complaint reference numbers are available. Please contact the council.');
      else if (staticBackend && error.status === 413) showMessage(form, 'static.photoSize', 'Use a photo up to 2 MB.');
      else if (staticBackend && error.status === 401 && !unauthorized) {
        showMessage(form, 'static.session', 'Reload the page and sign in again.');
      } else showMessage(form, unauthorized ? 'staff.invalidLogin' : 'common.error',
        unauthorized ? 'Check your username and password.' : errorText);
    } finally {
      button.disabled = false;
    }
  });
}

function appendText(parent, tag, content) {
  const node = document.createElement(tag);
  node.textContent = content;
  parent.append(node);
  return node;
}

function date(value, dateOnly = false) {
  return window.formatTrackerDate(document.documentElement.lang || 'si', value, {dateOnly});
}

function photo(parent, path, key, fallback) {
  if (typeof path !== 'string' || !path.trim()) return;
  let url;
  try {
    url = new URL('/' + path.replace(/^\/+/, ''), location.origin);
  } catch {
    return;
  }
  if (url.origin !== location.origin || !/^\/api\/admin\/photos\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(url.pathname)) return;
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = url.href;
  image.alt = '';
  image.loading = 'lazy';
  image.width = 280;
  image.addEventListener('error', () => figure.remove());
  figure.append(image);
  appendText(figure, 'figcaption', translated(key, fallback));
  parent.append(figure);
}

function renderEvidence(parent, record) {
  if (record.remarks) appendText(parent, 'p', translated('field.remarks', 'Officer remarks') + ' — ' + record.remarks);
  if (staticBackend) {
    if (record.photo) void privatePhoto(parent, record.ticket, 'photo', 'track.originalPhoto', 'Original photo');
    if (record.proof) void privatePhoto(parent, record.ticket, 'proof', 'field.proof', 'Resolution photo');
    return;
  }
  photo(parent, record.photo, 'track.originalPhoto', 'Original photo');
  photo(parent, record.proof, 'field.proof', 'Resolution photo');
}

async function privatePhoto(parent, ticket, kind, key, fallback) {
  const figure = document.createElement('figure');
  const caption = appendText(figure, 'figcaption', translated(key, fallback));
  parent.append(figure);
  if (selected?.ticket === ticket && !selected.trashedAt) {
    const remove = appendText(figure, 'button', translated('attachment.delete', 'Delete photo'));
    remove.type = 'button';
    remove.className = 'btn btn-danger';
    remove.addEventListener('click', () => deleteStaffPhoto(remove, ticket, kind));
  }
  try {
    const params = new URLSearchParams({ticket, kind});
    const {mime, base64} = await request('/api/admin/photo?' + params);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid photo');
    const image = document.createElement('img');
    image.src = 'data:' + mime + ';base64,' + base64;
    image.alt = '';
    image.width = 280;
    figure.prepend(image);
  } catch {
    caption.textContent += ' — ' + translated('common.error', 'Could not load the photo.');
  }
}

async function refreshStats() {
  try {
    const stats = await request('/api/stats');
    for (const node of document.querySelectorAll('[data-count]')) {
      node.textContent = stats[node.dataset.count] ?? '—';
    }
  } catch {
    // Leave unavailable counts as dashes.
  }
}

const complaint = select('#complaint-form');
const tracker = select('#track-form');
const ticketDialog = select('#ticket-dialog');
const ticketNumber = select('#receipt-ticket');
const receiptDate = select('#receipt-date');
let receiptTimestamp;

function renderReceiptDate() {
  if (!receiptDate) return;
  receiptDate.textContent = date(receiptTimestamp);
  if (receiptTimestamp) receiptDate.dateTime = receiptTimestamp;
}
let tracked = null;

function renderTracking() {
  if (tracked === null) return;
  const results = select('#track-results');
  results.replaceChildren();
  if (!tracked.length) appendText(results, 'p', translated('track.empty', 'No complaints found.'));
  for (const record of tracked) {
    const card = document.createElement('article');
    card.className = 'card';
    appendText(card, 'h3', record.ticket);
    appendText(card, 'p', label('category', record.category) + ' · ' + date(record.createdAt));
    const timeline = document.createElement('ol');
    const steps = Object.keys(statuses);
    for (const step of steps) {
      const item = appendText(timeline, 'li', label('status', step));
      if (record.status === step) {
        item.setAttribute('aria-current', 'step');
        const strong = document.createElement('strong');
        strong.textContent = item.textContent;
        item.replaceChildren(strong);
      }
    }
    card.append(timeline);
    results.append(card);
  }
}

if (complaint) {
  if (staticBackend) {
    select('[data-i18n="track.query"]', tracker).dataset.i18n = 'static.reference';
    tracker.elements.q.dataset.i18nPlaceholder = 'static.referencePlaceholder';
  }
  handleForm(complaint, async body => {
    if (!body.get('nic')?.trim()) body.delete('nic');
    if (!body.get('photo')?.size) body.delete('photo');
    if (staticBackend) body.set('lang', document.documentElement.lang);
    const result = await request('/api/complaints', {method: 'POST', body});
    if (!result?.ticket) throw new Error('Missing ticket');
    ticketNumber.textContent = result.ticket;
    receiptTimestamp = result.createdAt;
    renderReceiptDate();
    showMessage(ticketDialog);
    complaint.reset();
    ticketDialog.showModal();
    void refreshStats();
  });
  handleForm(tracker, async body => {
    tracked = null;
    select('#track-results').replaceChildren();
    tracked = await request('/api/track?' + new URLSearchParams({q: body.get('q').trim()}));
    renderTracking();
  });
  select('#copy-ticket').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ticketNumber.textContent);
      showMessage(ticketDialog, 'receipt.copied', 'Ticket ID copied.');
    } catch {
      showMessage(ticketDialog, 'receipt.copyError', 'Select the ticket ID to copy it manually.');
    }
  });
  select('#print-ticket').addEventListener('click', () => window.print());
  void refreshStats();
}

const login = select('#login-form');
const staffPanel = select('#staff-panel');
const filters = select('#filter-form');
const staffDialog = select('#staff-dialog');
const update = select('#update-form');
let records = [];
let selected = null;
let staffView = "active";
let staffRequest = 0;

function renderDetails(record) {
  const root = select('#staff-details');
  root.replaceChildren();
  const details = document.createElement('dl');
  const fields = {ticket:'Ticket ID', name:'Name', phone:'Phone number', nic:'NIC', address:'Address',
    division:'GN division', category:'Category', description:'Description', createdAt:'Submitted'};
  for (const [key, fallback] of Object.entries(fields)) {
    let value = record[key] || '—';
    if (key === 'category' || key === 'division') value = label(key, value);
    if (key === 'createdAt') value = date(record.createdAt);
    appendText(details, 'dt', translated('field.' + key, fallback));
    appendText(details, 'dd', value);
  }
  root.append(details);
  renderEvidence(root, record);
}

function openRecord(record) {
  selected = record;
  update.reset();
  update.elements.status.value = record.status;
  update.elements.remarks.value = record.remarks || '';
  showMessage(update);
  renderDetails(record);
  staffDialog.showModal();
  loadRecordTools(record);
}

function renderStaff() {
  const rows = select('#staff-rows');
  rows.replaceChildren();
  const active = [...new FormData(filters)].filter(([, value]) => value);
  const visible = records.filter(record => active.every(([field, value]) =>
    (field === 'division' ? divisionName(record[field]) : record[field]) === value));
  select('#staff-empty').textContent = visible.length ? '' : translated('staff.empty', 'No matching complaints.');
  for (const record of visible) {
    const row = document.createElement('tr');
    for (const value of [record.ticket, record.name, label('division', record.division),
      label('category', record.category), label('status', record.status), date(record.createdAt)]) {
      appendText(row, 'td', value);
    }
    const button = appendText(appendText(row, 'td', ''), 'button', translated('staff.view', 'View'));
    button.className = 'btn btn-secondary';
    button.addEventListener('click', () => openRecord(record));
    rows.append(row);
  }
}

async function loadStaff() {
  const revision = ++staffRequest;
  const complaints = await request('/api/admin/complaints' + (staffView === 'bin' ? '?view=bin' : ''));
  if (revision !== staffRequest) return;
  records = complaints;
  renderStaffView();
  select('#login-panel').hidden = true;
  staffPanel.hidden = false;
  renderStaff();
}

if (login) {
  handleForm(login, async body => {
    await request('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(Object.fromEntries(body))
    });
    await loadStaff();
    login.reset();
  });
  filters.addEventListener('change', renderStaff);
  select('#logout').addEventListener('click', async () => {
    try {
      await request('/api/logout', {method: 'POST'});
      staffRequest++;
      staffView = "active";
      clearAdminTools();
      records = [];
      selected = null;
      select('#staff-rows').replaceChildren();
      select('#staff-details').replaceChildren();
      update.reset();
      filters.reset();
      staffPanel.hidden = true;
      select('#login-panel').hidden = false;
      login.elements.username.focus();
    } catch {
      showMessage(staffPanel, 'common.error', 'Something went wrong. Please try again.');
    }
  });
  handleForm(update, async body => {
    if (!body.get('proof')?.size) body.delete('proof');
    await request('/api/admin/complaints/' + encodeURIComponent(selected.ticket), {method: 'PATCH', body});
    invalidateReport();
    staffDialog.close();
    try {
      await loadStaff();
    } catch {
      showMessage(staffPanel, 'staff.refreshError', 'Changes saved. Reload the page to refresh the list.');
    }
  });
  document.addEventListener('DOMContentLoaded', () => request('/api/session').then(session => {
    if (session.authenticated) return loadStaff();
  }).catch(error => {
    if (![401, 403].includes(error.status)) showMessage(login, 'common.error', 'Something went wrong. Please try again.');
  }), {once:true});
}

function refreshLanguage() {
  const language = document.documentElement.lang || 'si';
  for (const button of document.querySelectorAll('.language-switcher button')) {
    button.setAttribute('aria-pressed', String(button.lang === language));
  }
  for (const node of document.querySelectorAll('[data-message-key]')) {
    if (node.dataset.messageKey) node.textContent = translated(node.dataset.messageKey, node.dataset.messageFallback);
  }
  const stats = select('.stats-grid');
  if (stats) stats.setAttribute('aria-label', translated('stats.title', 'Statistics'));
  if (tracker) renderTracking();
  renderReceiptDate();
  if (staffPanel && !staffPanel.hidden) renderStaff();
  if (staffDialog?.open && selected) renderDetails(selected);
}

document.addEventListener('languagechange', refreshLanguage);
window.setLanguage?.('si');
refreshLanguage();
