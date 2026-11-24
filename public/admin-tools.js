'use strict';

const reportForm = select('#report-form');
const reportResults = select('#report-results');
const historyList = select('#history-list');
const recordActions = select('#record-actions');
const purgeDialog = select('#purge-dialog');
const purgeForm = select('#purge-form');
const viewButtons = [...document.querySelectorAll('[data-staff-view]')];
const trashButton = select('#trash-record');
const restoreButton = select('#restore-record');
const purgeButton = select('#open-purge');

let historyEntries = [];
let historyRevision = 0;
let reportData = null;
let reportParams = null;
let reportRevision = 0;
let purgeTicket = null;

const recordPath = ticket => '/api/admin/complaints/' + encodeURIComponent(ticket);

function renderStaffView() {
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.staffView === staffView));
  }
  const heading = select('#staff-list-title');
  heading.dataset.i18n = staffView === 'bin' ? 'bin.title' : 'staff.complaints';
  heading.textContent = translated(heading.dataset.i18n, staffView === 'bin' ? 'Recycle Bin' : 'Complaints');
}

for (const button of viewButtons) {
  button.addEventListener('click', async () => {
    if (button.dataset.staffView === staffView) return;
    viewButtons.forEach(control => control.disabled = true);
    showMessage(staffPanel);
    const previous = staffView;
    staffView = button.dataset.staffView;
    try {
      await loadStaff();
    } catch {
      staffView = previous;
      showMessage(staffPanel, 'common.error', 'Something went wrong. Please try again.');
    } finally {
      viewButtons.forEach(control => control.disabled = false);
    }
  });
}

function renderTrashedAt(record) {
  const node = select('#trashed-at');
  node.hidden = !record?.trashedAt;
  node.textContent = record?.trashedAt ? translated('bin.deletedAt', 'Moved to Recycle Bin') + ' ? ' + date(record.trashedAt) : '';
}

function renderHistory() {
  historyList.replaceChildren();
  for (const entry of historyEntries) {
    const item = appendText(historyList, 'li', '');
    const type = entry.type === 'response'
      ? translated('history.response', 'Officer response')
      : translated('history.status', 'Status');
    appendText(item, 'strong', type + ' · ' + date(entry.createdAt));
    if (entry.status) appendText(item, 'p', label('status', entry.status));
    if (entry.remarks) appendText(item, 'p', entry.remarks);
  }
}

async function loadRecordTools(record) {
  const revision = ++historyRevision;
  const inBin = Boolean(record.trashedAt);
  update.hidden = inBin;
  renderTrashedAt(record);
  trashButton.hidden = inBin || record.status !== 'resolved';
  restoreButton.hidden = !inBin;
  purgeButton.hidden = !inBin;
  showMessage(recordActions);
  historyEntries = [];
  renderHistory();
  const section = historyList.parentElement;
  showMessage(section, 'history.loading', 'Loading complaint history…');
  try {
    const entries = await request(recordPath(record.ticket) + '/history');
    if (revision !== historyRevision) return;
    historyEntries = entries;
    renderHistory();
    showMessage(section, entries.length ? '' : 'history.empty', 'No history yet.');
  } catch {
    if (revision === historyRevision) showMessage(section, 'common.error', 'Something went wrong. Please try again.');
  }
}

async function refreshAfterChange() {
  invalidateReport();
  try {
    await loadStaff();
  } catch {
    records = records.filter(record => record.ticket !== selected?.ticket);
    renderStaff();
    showMessage(staffPanel, 'staff.refreshError', 'Changes saved. Reload the page to refresh the list.');
  }
}

function bindRecordAction(button, action) {
  button.addEventListener('click', async () => {
    if (!selected || button.hidden || button.disabled) return;
    button.disabled = true;
    showMessage(recordActions);
    try {
      await request(recordPath(selected.ticket) + '/' + action, {method:'POST'});
      staffDialog.close();
      await refreshAfterChange();
    } catch {
      showMessage(recordActions, 'common.error', 'Something went wrong. Please try again.');
    } finally {
      button.disabled = false;
    }
  });
}

bindRecordAction(trashButton, 'trash');
bindRecordAction(restoreButton, 'restore');
purgeButton.addEventListener('click', () => {
  if (!selected || purgeButton.hidden) return;
  purgeTicket = selected.ticket;
  select('#purge-ticket').textContent = purgeTicket;
  purgeForm.reset();
  showMessage(purgeForm);
  purgeDialog.showModal();
});

handleForm(purgeForm, async () => {
  if (!purgeTicket || !purgeForm.elements.confirmed.checked) return;
  await request(recordPath(purgeTicket), {
    method: 'DELETE',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({confirmed:true})
  });
  purgeDialog.close();
  staffDialog.close();
  await refreshAfterChange();
});

const chartDefinitions = {
  byStatus: ['report.byStatus', 'By status', 'status'],
  byCategory: ['report.byCategory', 'By category', 'category'],
  byDivision: ['report.byDivision', 'By GN division', 'division'],
  byResponse: ['report.byResponse', 'By officer response', 'response']
};

function reportLabel(type, value) {
  if (type === 'response') {
    if (value === 'responded') return translated('report.responded', 'Responded');
    if (value === 'unresponded') return translated('report.unresponded', 'Awaiting response');
    return value || '—';
  }
  return label(type, value) || '—';
}

function renderReport() {
  if (!reportData) return;
  const rows = select('#report-rows');
  const charts = select('#report-charts');
  rows.replaceChildren();
  charts.replaceChildren();
  for (const record of reportData.rows) {
    const row = document.createElement('tr');
    for (const value of [record.ticket, reportLabel('category', record.category),
      reportLabel('division', record.division), reportLabel('status', record.status),
      reportLabel('response', record.response), date(record.createdAt), date(record.updatedAt)]) {
      appendText(row, 'td', value);
    }
    rows.append(row);
  }
  select('#report-empty').textContent = reportData.rows.length ? '' : translated('report.empty', 'No complaints match these filters.');
  for (const [key, [caption, fallback, type]] of Object.entries(chartDefinitions)) {
    const series = reportData.charts[key];
    if (!series?.length) continue;
    const chart = appendText(charts, 'section', '');
    chart.className = 'report-chart';
    chart.dataset.series = key;
    appendText(chart, 'h3', translated(caption, fallback));
    const bars = appendText(chart, 'ul', '');
    bars.className = 'report-bars';
    const max = Math.max(1, ...series.map(entry => entry.count));
    for (const [index, entry] of series.entries()) {
      const item = appendText(bars, 'li', '');
      item.className = 'report-bar';
      item.dataset.color = index % 6;
      const name = reportLabel(type, entry.label);
      appendText(item, 'span', name);
      const meter = document.createElement('meter');
      meter.max = max;
      meter.value = entry.count;
      meter.setAttribute('aria-label', name);
      appendText(item, 'strong', entry.count);
      item.append(meter);
    }
  }
  const params = new URLSearchParams(reportParams);
  params.set('lang', document.documentElement.lang);
  for (const link of document.querySelectorAll('[data-report-export]')) {
    link.href = '/api/admin/report.' + link.dataset.reportExport + '?' + params;
  }
  reportResults.hidden = false;
}

handleForm(reportForm, async body => {
  const revision = ++reportRevision;
  const params = new URLSearchParams([...body].filter(([, value]) => value));
  if (params.has('from') && params.has('to') && params.get('from') > params.get('to')) {
    showMessage(reportForm, 'report.invalidRange', 'Choose an end date on or after the start date.');
    return;
  }
  const query = new URLSearchParams(params);
  query.set('lang', document.documentElement.lang);
  reportResults.hidden = true;
  reportData = null;
  const data = await request('/api/admin/report?' + query);
  if (revision !== reportRevision) return;
  reportParams = params;
  reportData = data;
  renderReport();
});

function renderReportDates() {
  for (const name of ['from', 'to']) {
    const value = reportForm.elements[name].value;
    const output = select('#report-' + name + '-date');
    output.hidden = !value;
    output.textContent = value ? date(value, true) : '';
  }
}

reportForm.addEventListener('input', renderReportDates);
reportForm.addEventListener('change', renderReportDates);
renderReportDates();

function invalidateReport() {
  reportRevision++;
  reportData = null;
  reportParams = null;
  reportResults.hidden = true;
  select('#report-rows').replaceChildren();
  select('#report-charts').replaceChildren();
}

function clearAdminTools() {
  historyRevision++;
  reportForm.reset();
  renderReportDates();
  invalidateReport();
  historyEntries = [];
  renderHistory();
  renderStaffView();
  showMessage(staffPanel);
  showMessage(reportForm);
}

document.addEventListener('languagechange', () => {
  renderReportDates();
  renderStaffView();
  renderTrashedAt(selected);
  renderHistory();
  renderReport();
});
