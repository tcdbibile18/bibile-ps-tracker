'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');
const Excel = require('exceljs');
const { chromium } = require('playwright-core');
const { translate, formatTrackerDate, gnDivisionLabel } = require('./public/lang.js');

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
const columnWidths = [39, 25, 25, 20, 24, 28, 28];
const printWidths = [23, 13, 13, 9, 12, 15, 15];
const border = { style: 'thin', color: { argb: 'FF91ADC1' } };
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
    if (key === 'division') return gnDivisionLabel(value, lang);
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
    '@page{size:A4 landscape;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#153650;font:14px "' + font +
    '","Iskoola Pota",Latha,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    'h1{margin:4px 0;color:#0c4a6e}h2{font-size:17px;margin:0 0 10px}p{margin:5px 0 12px}' +
    'table{width:100%;table-layout:fixed;border-collapse:collapse;margin:16px 0}thead{display:table-header-group}' +
    'th{background:#0c4a6e;color:white;text-align:left;font-weight:bold}' +
    'th,td{padding:7px 6px;border:1px solid #91adc1;overflow-wrap:anywhere;vertical-align:middle}' +
    'tr,.bar-row{break-inside:avoid}tbody tr:nth-child(odd){background:#fff}tbody tr:nth-child(even){background:#eaf5fc}' +
    '.chart h2{break-after:avoid}' +
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
  const widths = '<colgroup>' + printWidths.map(width => '<col style="width:' + width + '%">').join('') + '</colgroup>';
  const body = '<strong>' + escape(content.site) + '</strong><h1>' + escape(content.title) + '</h1><p>' +
    escape(content.generated) + '</p><p>' + filters + '</p><table>' + widths + '<thead><tr>' + cells(content.columns, 'th') +
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
  const pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const sheet = workbook.addWorksheet('Report', { pageSetup });
  sheet.columns = columnWidths.map(width => ({
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
  sheet.pageSetup.printTitlesRow = header.number + ':' + header.number;
  sheet.views = [{ state: 'frozen', ySplit: header.number, showGridLines: false }];
  styleExcelRow(header, content.columns.length, '#0C4A6E', true);
  header.height = 38;
  for (const [index, values] of content.rows.entries()) {
    // Assign text cells, including values starting with spreadsheet formula markers.
    const row = sheet.addRow(values.map(String));
    const lines = Math.max(...values.map((value, col) => wrappedLines(value, columnWidths[col])));
    row.height = Math.max(30, 12 + lines * 17);
    styleExcelRow(row, content.columns.length, index % 2 ? '#EAF5FC' : '#FFFFFF');
  }
  if (!content.rows.length) wide(content.empty);
  const summary = workbook.addWorksheet('Charts', { pageSetup, views: [{ showGridLines: false }] });
  summary.columns = [32, 10, 3, 24, 24, 24, 24].map(width => ({ width }));
  let start = 2;
  await render(async page => {
    for (const chart of content.charts) {
      await page.setContent(html(content, chartMarkup(chart, content.empty)));
      await page.evaluate(() => document.fonts.ready);
      const panel = page.locator('.chart');
      const size = await panel.boundingBox();
      const png = await panel.screenshot();
      const index = workbook.addImage({ buffer: png, extension: 'png' });
      const header = summary.getRow(start);
      header.values = [chart.title, 'Count'];
      header.height = 34;
      styleExcelRow(header, 2, chart.color, true);
      let tableHeight = header.height;
      chart.entries.forEach((entry, offset) => {
        const row = summary.getRow(start + offset + 1);
        row.values = [entry.label, entry.count];
        row.height = Math.max(24, 10 + wrappedLines(entry.label, 32) * 17);
        tableHeight += row.height;
        styleExcelRow(row, 2, offset % 2 ? '#EAF5FC' : '#FFFFFF');
      });
      const imageWidth = 600;
      const imageHeight = Math.ceil(size.height * imageWidth / size.width);
      summary.addImage(index, {
        tl: { col: 3, row: start - 1 },
        ext: { width: imageWidth, height: imageHeight },
        editAs: 'oneCell'
      });
      const extraRows = Math.ceil(Math.max(0, imageHeight * 0.75 - tableHeight) / 15);
      start += chart.entries.length + extraRows + 3;
    }
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function styleExcelRow(row, width, color, header = false) {
  for (let index = 1; index <= width; index++) {
    const cell = row.getCell(index);
    cell.font = { name: font, size: 12, bold: header, color: { argb: header ? 'FFFFFFFF' : 'FF17364D' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { top: border, right: border, bottom: border, left: border };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color.slice(1).toUpperCase() } };
  }
}

function wrappedLines(value, width) {
  return String(value).split('\n').reduce((count, text) => {
    const length = [...text].reduce((size, char) => size + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
    return count + Math.max(1, Math.ceil(length / (width - 3)));
  }, 0);
}

module.exports = { generatePdf, generateXlsx };
