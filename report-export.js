'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');
const Excel = require('exceljs');
const { chromium } = require('playwright-core');
const { translate, formatTrackerDate } = require('./public/lang.js');

const palette = ['#0369a1', '#0f766e', '#a21caf', '#b45309', '#4338ca'];
const headings = {
  ticket: 'field.ticket', category: 'field.category', division: 'field.division',
  status: 'field.status', response: 'report.response', createdAt: 'field.createdAt',
  updatedAt: 'report.updatedAt'
};
const statuses = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };
const groups = [
  ['byStatus', 'status'], ['byCategory', 'category'],
  ['byDivision', 'division'], ['byResponse', 'response']
];
const font = 'Nirmala UI';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function reportContent(model) {
  const { rows, charts, filters } = model;
  const lang = filters.lang || 'si';
  const t = (key, fallback) => {
    const value = translate(lang, key);
    return value === key ? fallback : value;
  };
  const localize = (key, value) => {
    if (key === 'status') return t('status.' + statuses[value], value);
    if (key === 'category') return t('categories.' + value, value);
    if (key === 'division') return t('divisions.' + (value === 'Bibile Town' ? 'Bibile' : value), value);
    if (key === 'response') return t('report.' + value, value);
    return value;
  };
  const columnLabels = {
    ticket: 'Ticket ID', category: 'Category', division: 'GN division',
    status: 'Status', response: 'Officer response', createdAt: 'Submitted', updatedAt: 'Updated'
  };
  const titleFor = key => t(headings[key], columnLabels[key]);
  const date = (value, dateOnly = false) => formatTrackerDate(lang, value, { dateOnly });
  return {
    lang,
    site: t('site.name', 'Bibile Pradeshiya Sabha'),
    title: t('report.title', 'Complaint progress report'),
    generated: t('report.generated', 'Generated') + ' · ' + date(new Date()),
    filters: [
      [t('report.from', 'From'), date(filters.from, true)], [t('report.to', 'To'), date(filters.to, true)],
      ...groups.map(([, key]) => [titleFor(key), filters[key] && localize(key, filters[key])])
    ].map(([label, value]) => [label, value || t('report.any', 'All')]),
    columns: Object.keys(headings).map(titleFor),
    rows: rows.map(row => Object.keys(headings).map(key => {
      if ((key === 'createdAt' || key === 'updatedAt') && row[key] && Number.isFinite(Date.parse(row[key]))) {
        return date(row[key]);
      }
      return localize(key, row[key]) ?? '';
    })),
    charts: groups.map(([group, key], index) => ({
      title: t('report.' + group, titleFor(key)),
      color: palette[index],
      entries: (charts[group] || []).map(({label, count}) => ({
        label: localize(key, label), count
      }))
    })),
    empty: t('report.empty', 'No matching complaints')
  };
}

function chartMarkup(chart, empty) {
  const max = Math.max(1, ...chart.entries.map(entry => entry.count));
  const items = chart.entries.map(({ label, count }) =>
    '<div class="bar-row"><span>' + escape(label) + '</span><div class="track"><div class="bar" style="background:' +
    chart.color + ';width:' + (100 * count / max) + '%"></div></div><strong>' + escape(count) + '</strong></div>'
  ).join('');
  return '<section class="chart"><h2>' + escape(chart.title) + '</h2>' + (items || '<p>' + escape(empty) + '</p>') + '</section>';
}

function html(content, body) {
  return '<!doctype html><html lang="' + escape(content.lang) + '"><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;color:#153650;font:14px "' + font +
    '","Iskoola Pota",Latha,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    'h1{margin:4px 0;color:#0c4a6e}h2{font-size:17px;margin:0 0 10px}p{margin:5px 0 12px}' +
    'table{width:100%;border-collapse:collapse;margin:16px 0}thead{display:table-header-group}' +
    'th{background:#0c4a6e;color:white;text-align:left}th,td{padding:7px 6px;border-bottom:1px solid #bfdbef;overflow-wrap:anywhere}' +
    'tr,.bar-row{break-inside:avoid}tbody tr:nth-child(even){background:#f0f9ff}' +
    '.chart{padding:14px 16px;margin:0 0 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px}' +
    '.bar-row{display:grid;grid-template-columns:minmax(0,230px) 1fr 36px;gap:8px;align-items:center;margin:5px 0;overflow-wrap:anywhere}' +
    '.track{background:#dbeafe;border-radius:4px}.bar{border-radius:4px;height:12px}' +
    '</style><body>' + body + '</body></html>';
}

async function render(renderPage) {
  const installed = [
    process.env.REPORT_BROWSER_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe')
  ].find(candidate => candidate && existsSync(candidate));
  if (!installed) throw new Error('Install Edge or Chrome, or set REPORT_BROWSER_PATH.');
  const browser = await chromium.launch({ executablePath: installed, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 750, height: 720 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    return await renderPage(page);
  } finally {
    await browser.close();
  }
}

async function generatePdf(model) {
  const content = reportContent(model);
  const cells = (values, tag) => values.map(value => '<' + tag + '>' + escape(value) + '</' + tag + '>').join('');
  const filters = content.filters.map(([label, value]) => escape(label) + ' · ' + escape(value)).join(' &nbsp;|&nbsp; ');
  const rows = content.rows.map(row => '<tr>' + cells(row, 'td') + '</tr>').join('');
  const body = '<strong>' + escape(content.site) + '</strong><h1>' + escape(content.title) + '</h1><p>' +
    escape(content.generated) + '</p><p>' + filters + '</p><table><thead><tr>' + cells(content.columns, 'th') +
    '</tr></thead><tbody>' + rows + '</tbody></table>' + (rows ? '' : '<p>' + escape(content.empty) + '</p>') +
    content.charts.map(chart => chartMarkup(chart, content.empty)).join('');
  return render(async page => {
    await page.setContent(html(content, body));
    await page.evaluate(() => document.fonts.ready);
    return page.pdf({ preferCSSPageSize: true, printBackground: true });
  });
}

async function generateXlsx(model) {
  const content = reportContent(model);
  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = [22, 33, 31, 24, 27, 29, 29].map(width => ({
    width, style: { font: { name: font, size: 12 }, alignment: { vertical: 'middle', wrapText: true } }
  }));
  const wide = (text, strong = false) => {
    const row = sheet.addRow([String(text)]);
    sheet.mergeCells(row.number, 1, row.number, content.columns.length);
    row.getCell(1).font = { name: font, size: strong ? 16 : 12, bold: strong, color: { argb: 'FF0C4A6E' } };
    row.height = strong ? 28 : 23;
  };
  wide(content.site);
  wide(content.title, true);
  wide(content.generated);
  for (const [label, value] of content.filters) wide(label + ' · ' + value);
  sheet.addRow([]);
  const header = sheet.addRow(content.columns);
  header.height = 26;
  header.eachCell(cell => {
    cell.font = { name: font, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C4A6E' } };
  });
  for (const [index, values] of content.rows.entries()) {
    // Assign text cells, including values starting with spreadsheet formula markers.
    const row = sheet.addRow(values.map(String));
    row.height = 34;
    if (index % 2 === 0) row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
    });
  }
  if (!content.rows.length) wide(content.empty);
  await render(async page => {
    for (const chart of content.charts) {
      await page.setContent(html(content, chartMarkup(chart, content.empty)));
      await page.evaluate(() => document.fonts.ready);
      const panel = page.locator('.chart');
      const size = await panel.boundingBox();
      const png = await panel.screenshot();
      const index = workbook.addImage({ buffer: png, extension: 'png' });
      const row = sheet.addRow([]);
      sheet.addImage(index, {
        tl: { col: 0, row: row.number - 1 },
        ext: { width: size.width, height: size.height },
        editAs: 'oneCell'
      });
      // Keep the chart values available as spreadsheet text and numbers alongside the image.
      sheet.getCell(row.number, 6).value = chart.title;
      for (const entry of chart.entries) sheet.addRow([null, null, null, null, entry.count, entry.label]);
      const end = row.number + Math.ceil(size.height / 22) + 2;
      while (sheet.rowCount < end) sheet.addRow([null, null, null, null, null, ' ']);
    }
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { generatePdf, generateXlsx };
