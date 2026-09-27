/** Wortwerk storage. Bind this script to the target Google Sheet, then run setup(). */
const SHEET_NAME = 'Vocabulary';
const HEADERS = ['ID', 'Type', 'Word', 'Meaning', 'Article', 'Plural', 'Plural pattern', 'Memory route', 'Mnemonic', 'Story group', 'Example', 'Notes', 'Source', 'Tags', 'Confidence', 'Difficulty', 'Streak', 'Review count', 'Due at', 'Created at', 'Updated at'];
const KEYS = ['id', 'type', 'word', 'meaning', 'article', 'plural', 'pluralPattern', 'memoryRoute', 'mnemonic', 'storyGroup', 'example', 'notes', 'source', 'tags', 'confidence', 'difficulty', 'streak', 'reviewCount', 'dueAt', 'createdAt', 'updatedAt'];
const FIELDS = ['type', 'word', 'meaning', 'article', 'plural', 'pluralPattern', 'memoryRoute', 'mnemonic', 'storyGroup', 'example', 'notes', 'source', 'tags'];
const PLURALS = ['none', 'umlaut', 'e', 'umlaut-e', 'er', 'umlaut-er', 'n', 'en', 'nen', 's', 'irregular'];

function setup() {
  const sheet = sheet_();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#202e45').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('S:U').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.autoResizeColumns(1, HEADERS.length);
  return 'Vocabulary sheet ready. Set the API token, then deploy as a Web App.';
}

/** Run once in the Apps Script editor with the same token used in Cloudflare. */
function setApiToken(token) {
  if (!token || String(token).length < 24) throw new Error('Use a random token of at least 24 characters.');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', String(token));
}

function doGet() { return output_({ ok: true, service: 'Wortwerk storage' }); }
function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || p.token !== expected) throw new Error('Unauthorized');
    let result;
    switch (p.action) {
      case 'list': result = { entries: list_() }; break;
      case 'create': result = { entry: create_(p.entry || {}) }; break;
      case 'update': result = { entry: update_(p.id, p.entry || {}) }; break;
      case 'review': result = { entry: review_(p.id, p.rating) }; break;
      case 'delete': result = { deleted: delete_(p.id) }; break;
      default: throw new Error('Unsupported action');
    }
    return output_(Object.assign({ ok: true }, result));
  } catch (err) { return output_({ ok: false, error: err && err.message || 'Unknown error' }); }
}
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Bind this script to a Google Sheet.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}
function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max || 4000);
  // Prevent spreadsheet formula execution while preserving the entered text.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function check_(entry) {
  if (!entry.word || !entry.meaning) throw new Error('Word and meaning are required.');
  if (!['noun', 'verb', 'other'].includes(entry.type)) throw new Error('Invalid word type.');
  if (entry.type === 'noun' && !['der', 'die', 'das', ''].includes(entry.article)) throw new Error('Invalid article.');
  if (entry.memoryRoute && !['E', 'T', 'S'].includes(entry.memoryRoute)) throw new Error('Invalid memory route.');
  if (entry.pluralPattern && !PLURALS.includes(entry.pluralPattern)) throw new Error('Invalid plural pattern.');
}
function fromRow_(row) {
  const e = {};
  KEYS.forEach(function (key, i) { e[key] = row[i] instanceof Date ? row[i].toISOString() : row[i]; });
  e.reviewCount = Number(e.reviewCount) || 0; e.streak = Number(e.streak) || 0; e.difficulty = e.difficulty || 'unrated';
  return e;
}
function toRow_(e) { return KEYS.map(function (key) { return e[key] == null ? '' : e[key]; }); }
function list_() {
  const sheet = sheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, KEYS.length).getValues().map(fromRow_).reverse();
}
function find_(sheet, id) {
  if (!id) throw new Error('ID is required.');
  const last = sheet.getLastRow();
  if (last < 2) throw new Error('Entry not found.');
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  const index = ids.findIndex(function (r) { return r[0] === id; });
  if (index < 0) throw new Error('Entry not found.');
  const rowNumber = index + 2;
  return { rowNumber: rowNumber, entry: fromRow_(sheet.getRange(rowNumber, 1, 1, KEYS.length).getValues()[0]) };
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function fromInput_(input, existing) {
  const e = existing || {};
  FIELDS.forEach(function (field) { e[field] = clean_(input[field], field === 'notes' || field === 'mnemonic' || field === 'example' ? 4000 : 500); });
  e.type = e.type || 'noun';
  if (e.type !== 'noun') { e.article = ''; e.plural = ''; e.pluralPattern = ''; e.memoryRoute = ''; e.storyGroup = ''; }
  check_(e);
  return e;
}
function create_(input) {
  return withLock_(function () {
    const now = new Date().toISOString();
    const e = fromInput_(input, {});
    e.id = Utilities.getUuid(); e.confidence = 'new'; e.difficulty = 'unrated'; e.streak = 0; e.reviewCount = 0;
    e.dueAt = now; e.createdAt = now; e.updatedAt = now;
    sheet_().appendRow(toRow_(e));
    return e;
  });
}
function update_(id, input) {
  return withLock_(function () {
    const sheet = sheet_(), found = find_(sheet, id);
    const e = fromInput_(input, found.entry);
    e.updatedAt = new Date().toISOString();
    sheet.getRange(found.rowNumber, 1, 1, KEYS.length).setValues([toRow_(e)]);
    return e;
  });
}
function review_(id, rating) {
  if (!['hard', 'medium', 'easy'].includes(rating)) throw new Error('Invalid review rating.');
  return withLock_(function () {
    const sheet = sheet_(), found = find_(sheet, id), e = found.entry;
    const streak = Number(e.streak) || 0;
    e.reviewCount = (Number(e.reviewCount) || 0) + 1;
    e.difficulty = rating;
    e.streak = rating === 'hard' ? 0 : streak + 1;
    e.confidence = e.streak >= 4 && rating === 'easy' ? 'proficient' : 'learning';
    const days = rating === 'hard' ? 0 : rating === 'medium' ? Math.min(7, Math.max(1, e.streak)) : Math.min(21, Math.pow(2, e.streak + 1));
    e.dueAt = e.confidence === 'proficient' ? '' : new Date(Date.now() + (days === 0 ? 10 * 60 * 1000 : days * 86400000)).toISOString();
    e.updatedAt = new Date().toISOString();
    sheet.getRange(found.rowNumber, 1, 1, KEYS.length).setValues([toRow_(e)]);
    return e;
  });
}
function delete_(id) {
  return withLock_(function () { const sheet = sheet_(), found = find_(sheet, id); sheet.deleteRow(found.rowNumber); return id; });
}
