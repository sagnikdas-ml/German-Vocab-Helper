/** Wortwerk storage. Bind this script to the target Google Sheet, then run setup(). */
const SHEET_NAME = 'Vocabulary';
const PRACTICE_SHEET_NAME = 'Practice';
const PRACTICE_HEADERS = ['Practice ID', 'Entry ID', 'German sentence', 'English translation', 'Difficulty', 'Inflected form', 'Written at', 'Companion entry ID'];
const HEADERS = ['ID', 'Type', 'Word', 'Meaning', 'Article', 'Plural', 'Plural pattern', 'Memory route', 'Mnemonic', 'Story group', 'Example', 'Notes', 'Source', 'Tags', 'Confidence', 'Difficulty', 'Streak', 'Review count', 'Due at', 'Created at', 'Updated at', 'Variants JSON', 'Verb forms JSON'];
const KEYS = ['id', 'type', 'word', 'meaning', 'article', 'plural', 'pluralPattern', 'memoryRoute', 'mnemonic', 'storyGroup', 'example', 'notes', 'source', 'tags', 'confidence', 'difficulty', 'streak', 'reviewCount', 'dueAt', 'createdAt', 'updatedAt', 'variants', 'verbForms'];
const FIELDS = ['type', 'word', 'meaning', 'article', 'plural', 'pluralPattern', 'memoryRoute', 'mnemonic', 'storyGroup', 'example', 'notes', 'source', 'tags'];
const PLURALS = ['none', 'umlaut', 'e', 'umlaut-e', 'er', 'umlaut-er', 'n', 'en', 'nen', 's', 'irregular'];

function setup() {
  const sheet = sheet_();
  sheet.setFrozenRows(1);
  sheet.getRange(1, HEADERS.length - 1, 1, 2).setValues([[HEADERS[HEADERS.length - 2], HEADERS[HEADERS.length - 1]]]);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#202e45').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('S:U').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.autoResizeColumns(1, HEADERS.length);
  const practice = practiceSheet_();
  practice.setFrozenRows(1);
  practice.getRange(1, PRACTICE_HEADERS.length, 1, 1).setValues([[PRACTICE_HEADERS[PRACTICE_HEADERS.length - 1]]]);
  practice.getRange(1, 1, 1, PRACTICE_HEADERS.length).setBackground('#365b72').setFontColor('#ffffff').setFontWeight('bold');
  practice.autoResizeColumns(1, PRACTICE_HEADERS.length);
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
      case 'practice': result = practice_(p.id, p.sentence, p.translation, p.rating, p.usedInflectedForm, p.companionWordId); break;
      case 'history': result = { practices: history_(p.id) }; break;
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
function practiceSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRACTICE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PRACTICE_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(PRACTICE_HEADERS);
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
  if (entry.variants.length > 12) throw new Error('A word can have up to 12 linked forms.');
  entry.variants.forEach(function (v) {
    if (!v.word) throw new Error('Each linked form needs a German word.');
    if (!['der', 'die', 'das', ''].includes(v.article)) throw new Error('Invalid linked form article.');
    if (v.pluralPattern && !PLURALS.includes(v.pluralPattern)) throw new Error('Invalid linked form plural pattern.');
  });
  if (entry.type !== 'noun' && entry.variants.length) throw new Error('Linked noun forms require a noun entry.');
}
function fromRow_(row) {
  const e = {};
  KEYS.forEach(function (key, i) { e[key] = row[i] instanceof Date ? row[i].toISOString() : row[i]; });
  e.reviewCount = Number(e.reviewCount) || 0; e.streak = Number(e.streak) || 0; e.difficulty = e.difficulty || 'unrated';
  try { e.variants = JSON.parse(e.variants || '[]'); } catch (_) { e.variants = []; }
  if (!Array.isArray(e.variants)) e.variants = [];
  try { e.verbForms = JSON.parse(e.verbForms || '{}'); } catch (_) { e.verbForms = {}; }
  if (!e.verbForms || typeof e.verbForms !== 'object' || Array.isArray(e.verbForms)) e.verbForms = {};
  return e;
}
function toRow_(e) { return KEYS.map(function (key) { if (key === 'variants' || key === 'verbForms') return JSON.stringify(e[key]); return e[key] == null ? '' : e[key]; }); }
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
  const variants = Array.isArray(input.variants) ? input.variants.slice(0, 13) : [];
  e.variants = e.type === 'noun' ? variants.map(function (v) { return {
    word: clean_(v.word, 500), article: clean_(v.article, 10), meaning: clean_(v.meaning, 500),
    plural: clean_(v.plural, 500), pluralPattern: clean_(v.pluralPattern, 30), label: clean_(v.label, 100)
  }; }) : [];
  const vf = input.verbForms || {};
  e.verbForms = e.type === 'verb' ? {
    thirdPerson: clean_(vf.thirdPerson, 500), preterite: clean_(vf.preterite, 500),
    perfectAuxiliary: clean_(vf.perfectAuxiliary, 50), pastParticiple: clean_(vf.pastParticiple, 500)
  } : {};
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
function targetForms_(e) {
  const words = [e.word, e.plural];
  (e.variants || []).forEach(function (v) { words.push(v.word, v.plural); });
  const vf = e.verbForms || {};
  words.push(vf.thirdPerson, vf.preterite, vf.pastParticiple);
  return words.filter(Boolean).map(function (v) { return String(v).toLocaleLowerCase(); });
}
function mentionsTarget_(sentence, e) {
  const tokens = (String(sentence).toLocaleLowerCase().match(/[a-zäöüß]+/g) || []);
  return targetForms_(e).some(function (form) {
    const formTokens = form.match(/[a-zäöüß]+/g) || [];
    return formTokens.some(function (part) {
      return part.length >= 3 && tokens.indexOf(part) !== -1;
    });
  });
}
function practice_(id, sentenceInput, translationInput, rating, usedInflectedForm, companionWordId) {
  if (!['hard', 'medium', 'easy'].includes(rating)) throw new Error('Choose Hard, Medium, or Easy.');
  return withLock_(function () {
    const sheet = sheet_(), found = find_(sheet, id), e = found.entry;
    const sentence = clean_(sentenceInput, 1000);
    const translation = clean_(translationInput, 1000);
    if (sentence.length < 12 || (sentence.match(/\S+/g) || []).length < 4) throw new Error('Write a German sentence of at least four words.');
    if (!mentionsTarget_(sentence, e) && !usedInflectedForm) throw new Error('Use this word in your sentence, or tick the inflected-form option.');
    let companion = null;
    if (companionWordId) {
      if (companionWordId === id) throw new Error('Choose a different companion word.');
      companion = find_(sheet, companionWordId).entry;
      if (!mentionsTarget_(sentence, companion) && !usedInflectedForm) throw new Error('Use both words in your sentence, or tick the inflected-form option.');
    }
    const streak = Number(e.streak) || 0;
    e.reviewCount = (Number(e.reviewCount) || 0) + 1;
    e.difficulty = rating;
    e.streak = rating === 'hard' ? 0 : streak + 1;
    e.confidence = e.streak >= 4 && rating === 'easy' ? 'proficient' : 'learning';
    const days = rating === 'hard' ? 0 : rating === 'medium' ? Math.min(7, Math.max(1, e.streak)) : Math.min(21, Math.pow(2, e.streak + 1));
    e.dueAt = e.confidence === 'proficient' ? '' : new Date(Date.now() + (days === 0 ? 10 * 60 * 1000 : days * 86400000)).toISOString();
    e.updatedAt = new Date().toISOString();
    const attempt = { id: Utilities.getUuid(), entryId: id, sentence: sentence, translation: translation,
      rating: rating, usedInflectedForm: Boolean(usedInflectedForm), companionWordId: companion ? companion.id : '', createdAt: e.updatedAt };
    practiceSheet_().appendRow([attempt.id, attempt.entryId, attempt.sentence, attempt.translation, attempt.rating, attempt.usedInflectedForm, attempt.createdAt, attempt.companionWordId]);
    sheet.getRange(found.rowNumber, 1, 1, KEYS.length).setValues([toRow_(e)]);
    return { entry: e, attempt: attempt };
  });
}
function history_(id) {
  if (!id) throw new Error('ID is required.');
  const sheet = practiceSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, PRACTICE_HEADERS.length).getValues()
    .filter(function (row) { return row[1] === id; })
    .map(function (row) { return { id: row[0], entryId: row[1], sentence: row[2], translation: row[3],
      rating: row[4], usedInflectedForm: Boolean(row[5]), createdAt: row[6] instanceof Date ? row[6].toISOString() : row[6], companionWordId: row[7] || '' }; })
    .reverse();
}
function delete_(id) {
  return withLock_(function () {
    const sheet = sheet_(), found = find_(sheet, id);
    const practice = practiceSheet_();
    if (practice.getLastRow() > 1) {
      const entryIds = practice.getRange(2, 2, practice.getLastRow() - 1, 1).getValues();
      for (let i = entryIds.length - 1; i >= 0; i--) { if (entryIds[i][0] === id) practice.deleteRow(i + 2); }
    }
    sheet.deleteRow(found.rowNumber);
    return id;
  });
}
