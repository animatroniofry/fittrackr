/**
 * FITNESS TRACKER — backend pre mobilnú appku
 * Tento skript sa vloží do Google Apps Scriptu NAVIAZANÉHO na tvoj Fitness Tracker Sheet
 * (Extensions → Apps Script v tom istom Sheete) a nasadí sa ako Web App.
 *
 * v3: ľubovoľný počet profilov (do MAX_PROFILES), prihlásenie cez meno+PIN,
 * vlastné vytvorenie profilu (bez pevných slotov v UI), profilová fotka (Google Drive),
 * a kompletná história/porovnanie pre profilovú stránku. Profily sú stále uložené
 * v Script Properties (nie v Sheete) — Sheet obsahuje len denné/týždenné dáta.
 */

/* ================= CONFIG ================= */

var MAX_PROFILES = 6;   // koľko ľudí appka podporuje naraz (dá sa zvýšiť, treba tomu prispôsobiť aj Sheet)
var COLOR_CHOICES = ['#B6FF3B', '#33E39A', '#F0785A', '#5AA9F0', '#F0C75A', '#C77DF0', '#5AF0C7', '#F05A8C'];

var START_DATE = new Date(2026, 6, 6); // 6. júla 2026 — pondelok, 1. deň 1. týždňa

var MIERY_SHEET = 'Miery';
var MIERY_START_ROW = 4;               // riadok hlavičky 1. týždňa
var MIERY_BLOCK = 2 + MAX_PROFILES;    // header, N riadkov ľudí, prázdny riadok
var MEASURE_LABELS = ['Krk', 'Ramená', 'Prsia', 'L Biceps', 'P Biceps', 'L Predlaktie',
  'P Predlaktie', 'Pás', 'Brucho', 'Boky', 'L Stehno', 'P Stehno', 'L Lýtko', 'P Lýtko', 'Tuk %', 'LBM'];
var MEASURE_COL_START = 11; // stĺpec K

var STRAVA_SHEET = 'Strava';
var STRAVA_START_ROW = 10;
var STRAVA_PERSON_ROWS = 6;                       // meno + 4 makrá + prázdny riadok
var STRAVA_BLOCK = 2 + MAX_PROFILES * STRAVA_PERSON_ROWS; // header+blank, potom N ľudí
var STRAVA_GOAL_START_ROW = 6;                    // "DENNÉ CIELE" — 1 riadok na profil od tohto riadku

var CVIC_SHEET = 'Cvičenie';
var CVIC_START_ROW = 7;
var CVIC_BLOCK = 2 + MAX_PROFILES;
var CVIC_OPTIONS = ['💪 Lower Body', '🔥 Upper Body', '🏃 Kardio', '⚡ Full Body', '😴 Voľno', '❌ Nie'];

var PHOTO_FOLDER_NAME = 'FitnessTracker Fotky';

/* ================= SHEET MENU — jednoduchá správa profilov priamo v Google Sheete ================= */

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('🏋️ Fitness Tracker')
    .addItem('Spravovať profily (vymazať)', 'showManageProfilesDialog_')
    .addToUi();
}

function showManageProfilesDialog_() {
  var profiles = allProfiles_();
  var rows = profiles.map(function (entry) {
    var p = entry.profile;
    var safeName = String(p.name || '').replace(/'/g, "\\'");
    return '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding:10px 0;border-bottom:1px solid #e5e5e5;">' +
      '<div><b>' + p.name + '</b><br>' +
      '<span style="color:#888;font-size:12px;">slot ' + entry.slot + ' &middot; člen od ' + (p.createdAt || '—') + '</span></div>' +
      '<button onclick="delProfile(' + entry.slot + ", '" + safeName + "')\" " +
      'style="background:#e05353;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:bold;">' +
      'Vymazať</button></div>';
  }).join('');
  if (!rows) rows = '<p style="color:#888;">Zatiaľ žiadne profily.</p>';

  var html = HtmlService.createHtmlOutput(
    '<base target="_top">' +
    '<div style="font-family:Arial,sans-serif;padding:2px 4px;">' +
    '<p style="color:#666;font-size:12.5px;line-height:1.4;">' +
    'Vymazanie uvoľní slot pre nový profil (napr. keď niekto prestane byť aktívny). ' +
    'Historické dáta vo Vašich hárkoch (Miery / Strava / Cvičenie) ostanú zachované pod pôvodným menom v minulých týždňoch — mažú sa len prihlasovacie údaje profilu.' +
    '</p>' +
    rows +
    '<p id="ftMsg" style="color:#2a8a2a;font-weight:bold;"></p>' +
    '</div>' +
    '<script>' +
    'function delProfile(slot, name){' +
    '  if(!confirm("Naozaj natrvalo vymazať profil " + name + "?")) return;' +
    '  google.script.run.withSuccessHandler(function(){' +
    '    document.getElementById("ftMsg").textContent = "Profil " + name + " vymazaný. Zavri toto okno a znova otvor menu pre aktuálny zoznam.";' +
    '  }).adminDeleteProfile_(slot);' +
    '}' +
    '</script>'
  ).setWidth(420).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, 'Profily — Fitness Tracker');
}

function adminDeleteProfile_(slot) {
  PropertiesService.getScriptProperties().deleteProperty('profile_' + slot);
  return { ok: true };
}

/* ================= ENTRY POINTS ================= */

function doGet(e) {
  return handle(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var params = {};
  try {
    params = JSON.parse(e.postData.contents);
  } catch (err) {
    params = e.parameter || {};
  }
  return handle(params);
}

function handle(p) {
  var result;
  try {
    switch (p.action) {
      case 'init': result = actionInit(); break;
      case 'login': result = actionLogin(p.name, p.pin); break;
      case 'createProfile': result = actionCreateProfile(p); break;
      case 'updateProfile': result = actionUpdateProfile(Number(p.slot), p); break;
      case 'savePhoto': result = actionSavePhoto(Number(p.slot), p.pin, p.base64, p.mime); break;
      case 'entry': result = actionGetEntry(Number(p.slot), p.date); break;
      case 'saveEntry': result = actionSaveEntry(Number(p.slot), p.date, p); break;
      case 'measurements': result = actionGetMeasurements(Number(p.slot), Number(p.week)); break;
      case 'saveMeasurements': result = actionSaveMeasurements(Number(p.slot), Number(p.week), p); break;
      case 'goals': result = actionGetGoals(Number(p.slot)); break;
      case 'saveGoals': result = actionSaveGoals(Number(p.slot), p); break;
      case 'dashboard': result = actionDashboard(Number(p.slot)); break;
      case 'leaderboard': result = actionLeaderboard(); break;
      case 'profile': result = actionProfile(Number(p.slot), p.viewSlot !== undefined && p.viewSlot !== '' ? Number(p.viewSlot) : Number(p.slot)); break;
      case 'dashboardCompare': result = actionDashboardCompare(); break;
      case 'deleteProfile': result = actionDeleteProfile(Number(p.slot), p.pin); break;
      default: result = { error: 'Neznáma akcia: ' + p.action };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= HELPERS ================= */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function todayStr_() {
  return Utilities.formatDate(new Date(), 'Europe/Bratislava', 'yyyy-MM-dd');
}

function weekInfo_(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var diffDays = Math.round((d - START_DATE) / 86400000);
  var week = Math.floor(diffDays / 7) + 1;
  var dayIndex = ((diffDays % 7) + 7) % 7; // 0 = pondelok ... 6 = nedeľa
  return { week: week, dayIndex: dayIndex };
}

function clampWeek_(week) {
  if (!week || isNaN(week)) week = 1;
  return Math.max(1, week); // žiadny horný limit — týždne sú nekonečné
}

function validSlot_(slot) {
  return slot === 0 || (slot > 0 && slot < MAX_PROFILES && Number.isInteger(slot));
}

function num_(v) {
  if (v === '' || v === undefined || v === null) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function dateLabel_(d) {
  var day = d.getDate(), month = d.getMonth() + 1, year = d.getFullYear();
  var label = day + '.' + month;
  if (year !== START_DATE.getFullYear()) label += '.' + year;
  return label;
}

function weekDate_(week, dayIndex) {
  var d = new Date(START_DATE.getTime());
  d.setDate(d.getDate() + (week - 1) * 7 + dayIndex);
  return d;
}

function weekLabel_(week) {
  return dateLabel_(weekDate_(week, 0));
}

function weekRangeLabel_(week) {
  return dateLabel_(weekDate_(week, 0)) + '–' + dateLabel_(weekDate_(week, 6));
}

/* ================= PROFILY (meno / farba / PIN / foto) ================= */

function getProfile_(slot) {
  var raw = PropertiesService.getScriptProperties().getProperty('profile_' + slot);
  return raw ? JSON.parse(raw) : null;
}

function setProfile_(slot, obj) {
  PropertiesService.getScriptProperties().setProperty('profile_' + slot, JSON.stringify(obj));
}

function allProfiles_() {
  var out = [];
  for (var s = 0; s < MAX_PROFILES; s++) {
    var p = getProfile_(s);
    if (p) out.push({ slot: s, profile: p });
  }
  return out;
}

function profileName_(slot) {
  var p = getProfile_(slot);
  return p && p.name ? p.name : '';
}

function profileColor_(slot) {
  var p = getProfile_(slot);
  return (p && p.color) ? p.color : COLOR_CHOICES[slot % COLOR_CHOICES.length];
}

function firstFreeSlot_() {
  for (var s = 0; s < MAX_PROFILES; s++) {
    if (!getProfile_(s)) return s;
  }
  return -1;
}

function findSlotByName_(name) {
  var target = String(name || '').trim().toLowerCase();
  if (!target) return -1;
  for (var s = 0; s < MAX_PROFILES; s++) {
    var p = getProfile_(s);
    if (p && String(p.name || '').trim().toLowerCase() === target) return s;
  }
  return -1;
}

function actionLogin(name, pin) {
  var slot = findSlotByName_(name);
  if (slot === -1) return { error: 'Profil s týmto menom neexistuje. Vytvor si nový profil.' };
  var p = getProfile_(slot);
  if (String(p.pin) !== String(pin || '')) return { error: 'Nesprávny PIN' };
  return { ok: true, slot: slot, name: p.name, color: p.color, photoUrl: p.photoUrl || '' };
}

function requiredSheetsOk_() {
  var ss = ss_();
  var missing = [MIERY_SHEET, STRAVA_SHEET, CVIC_SHEET].filter(function (n) { return !ss.getSheetByName(n); });
  if (missing.length) {
    return 'V tomto Google Sheete chýbajú hárky: ' + missing.join(', ') + '. Over, že si Fitness_Tracker_2026_v3.xlsx otvoril/a cez "Otvoriť pomocou → Google Sheety" (nie len ako Excel súbor na Disku) a že Code.gs vkladáš do TOHTO súboru (Rozšírenia → Apps Script priamo v ňom).';
  }
  return null;
}

function actionCreateProfile(p) {
  var sheetsErr = requiredSheetsOk_();
  if (sheetsErr) return { error: sheetsErr };

  var name = String(p.name || '').trim();
  var color = String(p.color || COLOR_CHOICES[0]);
  var pin = String(p.pin || '').trim();

  if (!name) return { error: 'Zadaj meno' };
  if (!pin || pin.length < 4) return { error: 'PIN musí mať aspoň 4 znaky' };

  // LockService zabráni tomu, aby dva rýchle po sebe idúce kliknutia (napr. dvojklik)
  // vytvorili dva profily naraz alebo obsadili ten istý slot.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { error: 'Appka je práve zaneprázdnená (iný požadavok beží). Skús o pár sekúnd znova.' };
  }
  try {
    if (findSlotByName_(name) !== -1) return { error: 'Toto meno už niekto v appke používa. Skús iné (napr. s priezviskom).' };

    var slot = firstFreeSlot_();
    if (slot === -1) return { error: 'Appka už má plný počet profilov (' + MAX_PROFILES + '). Ozvi sa autorovi appky, treba zväčšiť kapacitu.' };

    setProfile_(slot, { name: name, color: color, pin: pin, photoUrl: '', photoFileId: '', createdAt: todayStr_() });

    // aby sa nová osoba hneď objavila v aktuálnom a pár najbližších týždňoch
    var wi = weekInfo_(todayStr_());
    ensureWeeksExist_(clampWeek_(wi.week));

    // dopíš meno do všetkých existujúcich (aj starších) týždňov, nech tam nie sú len čísla bez mena
    backfillProfileNameEverywhere_(slot);

    return { ok: true, slot: slot, name: name, color: color, photoUrl: '' };
  } catch (err) {
    return { error: 'Vytvorenie profilu zlyhalo: ' + String(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dopíše meno profilu do stĺpca A vo VŠETKÝCH už existujúcich týždňoch
 * (Miery, Strava, Cvičenie) + do tabuľky "Denné ciele" v hárku Strava.
 * Bez tohto by sa meno zapísalo iba do týždňov, ktoré ensureWeeksExist_
 * vytvorí PO vytvorení profilu — existujúce (staršie/aktuálny) týždne
 * by ostali so slotom bez mena (iba čísla).
 * Volá sa pri vytvorení profilu aj pri jeho premenovaní.
 */
function backfillProfileNameEverywhere_(slot) {
  var name = profileName_(slot);
  var ss = ss_();

  var mierySheet = ss.getSheetByName(MIERY_SHEET);
  var mieryWeeks = Math.floor((mierySheet.getLastRow() - MIERY_START_ROW + 1) / MIERY_BLOCK);
  for (var w1 = 1; w1 <= mieryWeeks; w1++) {
    var mRow = MIERY_START_ROW + (w1 - 1) * MIERY_BLOCK + 1 + slot;
    mierySheet.getRange(mRow, 1).setValue(name);
  }

  var cvicSheet = ss.getSheetByName(CVIC_SHEET);
  var cvicWeeks = Math.floor((cvicSheet.getLastRow() - CVIC_START_ROW + 1) / CVIC_BLOCK);
  for (var w2 = 1; w2 <= cvicWeeks; w2++) {
    var cRow = CVIC_START_ROW + (w2 - 1) * CVIC_BLOCK + 1 + slot;
    cvicSheet.getRange(cRow, 1).setValue(name);
  }

  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  var stravaWeeks = Math.floor((stravaSheet.getLastRow() - STRAVA_START_ROW + 1) / STRAVA_BLOCK);
  for (var w3 = 1; w3 <= stravaWeeks; w3++) {
    var baseRow = STRAVA_START_ROW + (w3 - 1) * STRAVA_BLOCK;
    var nameRow = baseRow + 2 + slot * STRAVA_PERSON_ROWS;
    stravaSheet.getRange(nameRow, 1).setValue(name);
  }

  // tabuľka "Denné ciele" — jeden pevný riadok na slot (nie po týždňoch)
  stravaSheet.getRange(STRAVA_GOAL_START_ROW + slot, 1).setValue(name);
}

function actionUpdateProfile(slot, p) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var existing = getProfile_(slot);
  if (!existing) return { error: 'Tento profil ešte neexistuje' };
  if (String(existing.pin) !== String(p.currentPin || '')) {
    return { error: 'Na úpravu profilu treba zadať súčasný PIN' };
  }
  var name = p.name !== undefined && String(p.name).trim() ? String(p.name).trim() : existing.name;
  var otherSlot = findSlotByName_(name);
  if (otherSlot !== -1 && otherSlot !== slot) return { error: 'Toto meno už niekto používa' };
  var color = p.color ? String(p.color) : existing.color;
  var pin = (p.newPin && String(p.newPin).trim().length >= 4) ? String(p.newPin).trim() : existing.pin;

  setProfile_(slot, {
    name: name, color: color, pin: pin,
    photoUrl: existing.photoUrl || '', photoFileId: existing.photoFileId || '',
    createdAt: existing.createdAt || todayStr_()
  });

  // ak sa zmenilo meno, premietni ho aj do už zapísaných týždňov v Sheete
  if (name !== existing.name) backfillProfileNameEverywhere_(slot);

  return { ok: true, slot: slot, name: name, color: color, photoUrl: existing.photoUrl || '' };
}

function actionDeleteProfile(slot, pin) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var existing = getProfile_(slot);
  if (!existing) return { error: 'Tento profil už neexistuje' };
  if (String(existing.pin) !== String(pin || '')) return { error: 'Nesprávny PIN' };
  PropertiesService.getScriptProperties().deleteProperty('profile_' + slot);
  return { ok: true };
}

function photoFolder_() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

function actionSavePhoto(slot, pin, base64, mime) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var existing = getProfile_(slot);
  if (!existing) return { error: 'Tento profil ešte neexistuje' };
  if (String(existing.pin) !== String(pin || '')) return { error: 'Nesprávny PIN' };
  if (!base64) return { error: 'Chýba obrázok' };

  try {
    var contentType = mime || 'image/jpeg';
    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, contentType, 'profil_' + slot + '.jpg');
    var folder = photoFolder_();

    // starú fotku zmažeme, aby sa v Drive nehromadili súbory
    if (existing.photoFileId) {
      try { DriveApp.getFileById(existing.photoFileId).setTrashed(true); } catch (e2) { /* ignore */ }
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';

    existing.photoUrl = url;
    existing.photoFileId = file.getId();
    setProfile_(slot, existing);

    return { ok: true, photoUrl: url };
  } catch (err) {
    return { error: 'Nahrávanie fotky zlyhalo: ' + String(err) };
  }
}

/* ================= INIT ================= */

function actionInit() {
  var sheetsErr = requiredSheetsOk_();
  if (sheetsErr) return { error: sheetsErr };
  var t = todayStr_();
  var wi = weekInfo_(t);
  var profiles = [];
  for (var s = 0; s < MAX_PROFILES; s++) {
    var p = getProfile_(s);
    if (p) profiles.push({ slot: s, name: p.name, color: p.color, photoUrl: p.photoUrl || '' });
  }
  return {
    today: t,
    week: wi.week,
    dayIndex: wi.dayIndex,
    profiles: profiles,
    freeSlots: MAX_PROFILES - profiles.length,
    maxProfiles: MAX_PROFILES,
    colorChoices: COLOR_CHOICES,
    trainingOptions: CVIC_OPTIONS,
    measureLabels: MEASURE_LABELS,
    startDate: Utilities.formatDate(START_DATE, 'Europe/Bratislava', 'yyyy-MM-dd')
  };
}

/* ================= NEKONEČNÉ TÝŽDNE — auto-rozšírenie hárkov ================= */

function ensureWeeksExist_(week) {
  ensureCvicWeeks_(week);
  ensureStravaWeeks_(week);
  ensureMieryWeeks_(week);
}

function ensureCvicWeeks_(targetWeek) {
  var sheet = ss_().getSheetByName(CVIC_SHEET);
  var existingWeeks = Math.round((sheet.getLastRow() - CVIC_START_ROW + 1) / CVIC_BLOCK);
  if (targetWeek <= existingWeeks) return;
  for (var w = existingWeeks + 1; w <= targetWeek; w++) {
    var row = CVIC_START_ROW + (w - 1) * CVIC_BLOCK;
    sheet.insertRowsAfter(sheet.getLastRow(), CVIC_BLOCK);
    var dates = [];
    for (var d = 0; d <= 6; d++) dates.push(dateLabel_(weekDate_(w, d)));
    sheet.getRange(row, 1, 1, 9).setValues([[w + '. Týždeň', dates[0], dates[1], dates[2], dates[3], dates[4], dates[5], dates[6], '']]);
    for (var s = 0; s < MAX_PROFILES; s++) {
      var r = row + 1 + s;
      sheet.getRange(r, 1).setValue(profileName_(s));
      sheet.getRange(r, 9).setFormula('=IF(A' + r + '="","",COUNTA(B' + r + ':H' + r + ')-COUNTIF(B' + r + ':H' + r + ',"*Voľno*")-COUNTIF(B' + r + ':H' + r + ',"*Nie*"))');
    }
    if (w > 1) {
      var prevRow = row - CVIC_BLOCK;
      sheet.getRange(prevRow, 1, CVIC_BLOCK, 9).copyTo(sheet.getRange(row, 1, CVIC_BLOCK, 9), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
  }
}

function ensureStravaWeeks_(targetWeek) {
  var sheet = ss_().getSheetByName(STRAVA_SHEET);
  var existingWeeks = Math.round((sheet.getLastRow() - STRAVA_START_ROW + 1) / STRAVA_BLOCK);
  if (targetWeek <= existingWeeks) return;
  var macroLabels = ['Kalórie', 'Bielkoviny', 'Sacharidy', 'Tuky'];
  for (var w = existingWeeks + 1; w <= targetWeek; w++) {
    var row = STRAVA_START_ROW + (w - 1) * STRAVA_BLOCK;
    sheet.insertRowsAfter(sheet.getLastRow(), STRAVA_BLOCK);
    var dates = [];
    for (var d = 0; d <= 6; d++) dates.push(dateLabel_(weekDate_(w, d)));
    sheet.getRange(row, 1, 1, 9).setValues([[w + '. Týždeň', dates[0], dates[1], dates[2], dates[3], dates[4], dates[5], dates[6], 'Priemer']]);
    for (var s = 0; s < MAX_PROFILES; s++) {
      var nameRow = row + 2 + s * STRAVA_PERSON_ROWS;
      sheet.getRange(nameRow, 1).setValue(profileName_(s));
      for (var m = 0; m < 4; m++) {
        var r = nameRow + 1 + m;
        sheet.getRange(r, 1).setValue(macroLabels[m]);
        sheet.getRange(r, 9).setFormula('=IFERROR(AVERAGE(B' + r + ':H' + r + '),"")');
      }
    }
    if (w > 1) {
      var prevRow = row - STRAVA_BLOCK;
      sheet.getRange(prevRow, 1, STRAVA_BLOCK, 9).copyTo(sheet.getRange(row, 1, STRAVA_BLOCK, 9), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
  }
}

function ensureMieryWeeks_(targetWeek) {
  var sheet = ss_().getSheetByName(MIERY_SHEET);
  var existingWeeks = Math.round((sheet.getLastRow() - MIERY_START_ROW + 1) / MIERY_BLOCK);
  if (targetWeek <= existingWeeks) return;
  for (var w = existingWeeks + 1; w <= targetWeek; w++) {
    var row = MIERY_START_ROW + (w - 1) * MIERY_BLOCK;
    sheet.insertRowsAfter(sheet.getLastRow(), MIERY_BLOCK);
    var dates = [];
    for (var d = 0; d <= 6; d++) dates.push(dateLabel_(weekDate_(w, d)));
    sheet.getRange(row, 1, 1, 9).setValues([[w + '. Týždeň', dates[0], dates[1], dates[2], dates[3], dates[4], dates[5], dates[6], 'Priemer']]);
    for (var s = 0; s < MAX_PROFILES; s++) {
      var r = row + 1 + s;
      sheet.getRange(r, 1).setValue(profileName_(s));
      sheet.getRange(r, 9).setFormula('=IFERROR(AVERAGE(B' + r + ':H' + r + '),"")');
    }
    sheet.getRange(MIERY_START_ROW, MEASURE_COL_START, 1, MEASURE_LABELS.length)
      .copyTo(sheet.getRange(row, MEASURE_COL_START, 1, MEASURE_LABELS.length), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
    if (w > 1) {
      var prevRow = row - MIERY_BLOCK;
      sheet.getRange(prevRow, 1, MIERY_BLOCK, 9 + MEASURE_LABELS.length).copyTo(sheet.getRange(row, 1, MIERY_BLOCK, 9 + MEASURE_LABELS.length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
  }
}

/* ================= DENNÝ ZÁPIS (váha / tréning / strava) ================= */

function stravaBaseRow_(week, slot) {
  return STRAVA_START_ROW + (week - 1) * STRAVA_BLOCK + 2 + slot * STRAVA_PERSON_ROWS + 1; // +1 = riadok "Kalórie"
}

function actionGetEntry(slot, dateStr) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var wi = weekInfo_(dateStr);
  var week = clampWeek_(wi.week);
  ensureWeeksExist_(week);
  var dayCol = 2 + wi.dayIndex;

  var ss = ss_();
  var mieryRow = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
  var weight = ss.getSheetByName(MIERY_SHEET).getRange(mieryRow, dayCol).getValue();

  var cvicRow = CVIC_START_ROW + (week - 1) * CVIC_BLOCK + 1 + slot;
  var training = ss.getSheetByName(CVIC_SHEET).getRange(cvicRow, dayCol).getValue();

  var stravaBase = stravaBaseRow_(week, slot);
  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  var kcal = stravaSheet.getRange(stravaBase, dayCol).getValue();
  var protein = stravaSheet.getRange(stravaBase + 1, dayCol).getValue();
  var carbs = stravaSheet.getRange(stravaBase + 2, dayCol).getValue();
  var fat = stravaSheet.getRange(stravaBase + 3, dayCol).getValue();

  return {
    week: week, dayIndex: wi.dayIndex,
    weight: weight || '', training: training || '',
    kcal: kcal || '', protein: protein || '', carbs: carbs || '', fat: fat || ''
  };
}

function actionSaveEntry(slot, dateStr, p) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var wi = weekInfo_(dateStr);
  var week = clampWeek_(wi.week);
  ensureWeeksExist_(week);
  var dayCol = 2 + wi.dayIndex;
  var ss = ss_();

  if (p.weight !== undefined && p.weight !== '') {
    var mieryRow = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
    ss.getSheetByName(MIERY_SHEET).getRange(mieryRow, dayCol).setValue(num_(p.weight));
  }
  if (p.training !== undefined && p.training !== '') {
    var cvicRow = CVIC_START_ROW + (week - 1) * CVIC_BLOCK + 1 + slot;
    ss.getSheetByName(CVIC_SHEET).getRange(cvicRow, dayCol).setValue(p.training);
  }
  var stravaBase = stravaBaseRow_(week, slot);
  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  if (p.kcal !== undefined && p.kcal !== '') stravaSheet.getRange(stravaBase, dayCol).setValue(num_(p.kcal));
  if (p.protein !== undefined && p.protein !== '') stravaSheet.getRange(stravaBase + 1, dayCol).setValue(num_(p.protein));
  if (p.carbs !== undefined && p.carbs !== '') stravaSheet.getRange(stravaBase + 2, dayCol).setValue(num_(p.carbs));
  if (p.fat !== undefined && p.fat !== '') stravaSheet.getRange(stravaBase + 3, dayCol).setValue(num_(p.fat));

  return { ok: true, week: week, dayIndex: wi.dayIndex };
}

/* ================= MIERY: týždenné obvody ================= */

function actionGetMeasurements(slot, week) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  week = clampWeek_(week);
  ensureWeeksExist_(week);
  var row = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
  var sheet = ss_().getSheetByName(MIERY_SHEET);
  var values = sheet.getRange(row, MEASURE_COL_START, 1, MEASURE_LABELS.length).getValues()[0];
  var out = { week: week };
  MEASURE_LABELS.forEach(function (label, i) { out[label] = values[i] === '' ? '' : values[i]; });
  return out;
}

function actionSaveMeasurements(slot, week, p) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  week = clampWeek_(week);
  ensureWeeksExist_(week);
  var row = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
  var sheet = ss_().getSheetByName(MIERY_SHEET);
  var values = MEASURE_LABELS.map(function (label) { return num_(p[label]); });
  sheet.getRange(row, MEASURE_COL_START, 1, values.length).setValues([values]);
  return { ok: true };
}

/* ================= STRAVA: denné ciele ================= */

function actionGetGoals(slot) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var row = STRAVA_GOAL_START_ROW + slot;
  var vals = ss_().getSheetByName(STRAVA_SHEET).getRange(row, 2, 1, 4).getValues()[0];
  return { kcal: vals[0] || '', protein: vals[1] || '', carbs: vals[2] || '', fat: vals[3] || '' };
}

function actionSaveGoals(slot, p) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var row = STRAVA_GOAL_START_ROW + slot;
  var sheet = ss_().getSheetByName(STRAVA_SHEET);
  sheet.getRange(row, 1, 1, 5).setValues([[profileName_(slot), num_(p.kcal), num_(p.protein), num_(p.carbs), num_(p.fat)]]);
  return { ok: true };
}

/* ================= PROGNÓZA (jednoduchá lineárna regresia) ================= */

function linearRegression_(points) {
  var n = points.length;
  if (n < 2) return null;
  var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  points.forEach(function (pt) {
    sumX += pt.week; sumY += pt.avg; sumXY += pt.week * pt.avg; sumXX += pt.week * pt.week;
  });
  var denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  var slope = (n * sumXY - sumX * sumY) / denom;
  var intercept = (sumY - slope * sumX) / n;
  return { slope: slope, intercept: intercept };
}

function weightForecast_(weightTrend, aheadWeeks) {
  var reg = linearRegression_(weightTrend);
  if (!reg) return { weeklyRate: null, forecast: [] };
  var lastWeek = weightTrend[weightTrend.length - 1].week;
  var forecast = [];
  for (var fw = lastWeek + 1; fw <= lastWeek + aheadWeeks; fw++) {
    forecast.push({ week: fw, projected: Number((reg.slope * fw + reg.intercept).toFixed(1)) });
  }
  return { weeklyRate: Number(reg.slope.toFixed(2)), forecast: forecast };
}

/* ================= DASHBOARD ================= */

function actionDashboard(slot) {
  if (!validSlot_(slot)) return { error: 'Neplatný profil' };
  var ss = ss_();
  var wi = weekInfo_(todayStr_());
  var curWeek = clampWeek_(wi.week);
  ensureWeeksExist_(curWeek);

  var mierySheet = ss.getSheetByName(MIERY_SHEET);
  var wantedRows = curWeek * MIERY_BLOCK;
  var availableRows = Math.max(0, Math.min(wantedRows, mierySheet.getLastRow() - MIERY_START_ROW + 1));
  var mieryData = availableRows > 0
    ? mierySheet.getRange(MIERY_START_ROW, 1, availableRows, 9).getValues()
    : [];

  var weightTrend = [];
  var latestWeight = null;
  var startWeight = null;

  for (var w = 1; w <= curWeek; w++) {
    var rowOffset = (w - 1) * MIERY_BLOCK + 1 + slot;
    if (rowOffset >= mieryData.length) break;
    var rowVals = mieryData[rowOffset];
    var avg = rowVals[8];
    if (avg !== '' && avg !== null && !isNaN(avg)) {
      weightTrend.push({ week: w, avg: Number(avg) });
      if (startWeight === null) startWeight = Number(avg);
    }
    for (var c = 0; c <= 6; c++) {
      var v = rowVals[1 + c];
      if (v !== '' && v !== null && !isNaN(v)) latestWeight = Number(v);
    }
  }

  var cvicSheet = ss.getSheetByName(CVIC_SHEET);
  var cvicRow = CVIC_START_ROW + (curWeek - 1) * CVIC_BLOCK + 1 + slot;
  var trainingsDone = 0;
  var cvicVals = [];
  if (cvicRow <= cvicSheet.getLastRow()) {
    cvicVals = cvicSheet.getRange(cvicRow, 2, 1, 7).getValues()[0];
    cvicVals.forEach(function (v) {
      var s = String(v || '');
      if (s && s.indexOf('Voľno') === -1 && s.indexOf('Nie') === -1) trainingsDone++;
    });
  }

  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  var stravaBase = stravaBaseRow_(curWeek, slot);
  var kcalAvg = null, proteinAvg = null, carbsAvg = null, fatAvg = null;
  if (stravaBase + 3 <= stravaSheet.getLastRow()) {
    kcalAvg = stravaSheet.getRange(stravaBase, 9).getValue() || null;
    proteinAvg = stravaSheet.getRange(stravaBase + 1, 9).getValue() || null;
    carbsAvg = stravaSheet.getRange(stravaBase + 2, 9).getValue() || null;
    fatAvg = stravaSheet.getRange(stravaBase + 3, 9).getValue() || null;
  }

  var goals = actionGetGoals(slot);

  var fc = weightForecast_(weightTrend, 4);

  var trainingsHistory = [];
  for (var tw = 1; tw <= curWeek; tw++) {
    var tRow = CVIC_START_ROW + (tw - 1) * CVIC_BLOCK + 1 + slot;
    var tDone = 0;
    if (tRow <= cvicSheet.getLastRow()) {
      var tVals = cvicSheet.getRange(tRow, 2, 1, 7).getValues()[0];
      tVals.forEach(function (v) {
        var s = String(v || '');
        if (s && s.indexOf('Voľno') === -1 && s.indexOf('Nie') === -1) tDone++;
      });
    }
    trainingsHistory.push({ week: tw, done: tDone });
  }

  return {
    latestWeight: latestWeight,
    startWeight: startWeight,
    weightChange: (latestWeight !== null && startWeight !== null)
      ? Number((latestWeight - startWeight).toFixed(1)) : null,
    weightTrend: weightTrend,
    weeklyRate: fc.weeklyRate,
    forecast: fc.forecast,
    trainingsHistory: trainingsHistory,
    currentWeek: curWeek,
    trainingsDone: trainingsDone,
    trainingsTotal: 7,
    week: { kcalAvg: kcalAvg, proteinAvg: proteinAvg, carbsAvg: carbsAvg, fatAvg: fatAvg },
    goals: goals
  };
}

/* ================= DASHBOARD — porovnanie s ostatnými ================= */

function actionDashboardCompare() {
  var ss = ss_();
  var wi = weekInfo_(todayStr_());
  var curWeek = clampWeek_(wi.week);
  ensureWeeksExist_(curWeek);
  var mierySheet = ss.getSheetByName(MIERY_SHEET);

  var lb = actionLeaderboard();
  var lbBySlot = {};
  lb.slots.forEach(function (s) { lbBySlot[s.slot] = s; });

  var configured = allProfiles_();
  var profiles = configured.map(function (entry) {
    var slot = entry.slot;
    var trend = [];
    for (var w = 1; w <= curWeek; w++) {
      var row = MIERY_START_ROW + (w - 1) * MIERY_BLOCK + 1 + slot;
      if (row > mierySheet.getLastRow()) continue;
      var avg = mierySheet.getRange(row, 9).getValue();
      if (avg !== '' && avg !== null && !isNaN(avg)) trend.push({ week: w, avg: Number(avg) });
    }
    var l = lbBySlot[slot] || {};
    return {
      slot: slot,
      name: entry.profile.name,
      color: entry.profile.color,
      weightTrend: trend,
      totalPoints: l.totalPoints || 0,
      monthPoints: l.monthPoints || 0,
      rank: l.rankOverall || null
    };
  });

  return { currentWeek: curWeek, profiles: profiles };
}

/* ================= LEADERBOARD / BODY ================= */

function weekPoints_(ss, week, slot) {
  var cvicSheet = ss.getSheetByName(CVIC_SHEET);
  var cvicRow = CVIC_START_ROW + (week - 1) * CVIC_BLOCK + 1 + slot;
  var trainingsDone = 0;
  if (cvicRow <= cvicSheet.getLastRow()) {
    var cvicVals = cvicSheet.getRange(cvicRow, 2, 1, 7).getValues()[0];
    cvicVals.forEach(function (v) {
      var s = String(v || '');
      if (s && s.indexOf('Voľno') === -1 && s.indexOf('Nie') === -1) trainingsDone++;
    });
  }

  var mierySheet = ss.getSheetByName(MIERY_SHEET);
  var mieryRow = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
  var weightDays = 0;
  if (mieryRow <= mierySheet.getLastRow()) {
    var mVals = mierySheet.getRange(mieryRow, 2, 1, 7).getValues()[0];
    mVals.forEach(function (v) { if (v !== '' && v !== null && !isNaN(v)) weightDays++; });
  }

  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  var stravaBase = stravaBaseRow_(week, slot);
  var nutritionDays = 0;
  if (stravaBase <= stravaSheet.getLastRow()) {
    var sVals = stravaSheet.getRange(stravaBase, 2, 1, 7).getValues()[0];
    sVals.forEach(function (v) { if (v !== '' && v !== null && !isNaN(v)) nutritionDays++; });
  }

  var points = trainingsDone * 2 + weightDays * 1 + nutritionDays * 1 + (trainingsDone >= 7 ? 5 : 0);
  return { points: points, trainingsDone: trainingsDone, weightDays: weightDays, nutritionDays: nutritionDays };
}

function weekPointsInRange_(ss, week, slot, filterFn) {
  var empty7 = ['', '', '', '', '', '', ''];

  var cvicSheet = ss.getSheetByName(CVIC_SHEET);
  var cvicRow = CVIC_START_ROW + (week - 1) * CVIC_BLOCK + 1 + slot;
  var cvicVals = (cvicRow <= cvicSheet.getLastRow())
    ? cvicSheet.getRange(cvicRow, 2, 1, 7).getValues()[0] : empty7;

  var mierySheet = ss.getSheetByName(MIERY_SHEET);
  var mieryRow = MIERY_START_ROW + (week - 1) * MIERY_BLOCK + 1 + slot;
  var mVals = (mieryRow <= mierySheet.getLastRow())
    ? mierySheet.getRange(mieryRow, 2, 1, 7).getValues()[0] : empty7;

  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);
  var stravaBase = stravaBaseRow_(week, slot);
  var sVals = (stravaBase <= stravaSheet.getLastRow())
    ? stravaSheet.getRange(stravaBase, 2, 1, 7).getValues()[0] : empty7;

  var points = 0, trainingsDone = 0, daysInRange = 0;
  for (var d = 0; d <= 6; d++) {
    var date = weekDate_(week, d);
    if (!filterFn(date)) continue;
    daysInRange++;
    var cv = String(cvicVals[d] || '');
    var trained = cv && cv.indexOf('Voľno') === -1 && cv.indexOf('Nie') === -1;
    if (trained) { points += 2; trainingsDone++; }
    if (mVals[d] !== '' && mVals[d] !== null && !isNaN(mVals[d])) points += 1;
    if (sVals[d] !== '' && sVals[d] !== null && !isNaN(sVals[d])) points += 1;
  }
  // bonus za 7/7 tréningov sa počíta len ak je celý týždeň (všetkých 7 dní) v danom rozsahu
  if (daysInRange === 7 && trainingsDone === 7) points += 5;
  return points;
}

function monthPoints_(ss, slot, month, year) {
  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);
  var wFirst = clampWeek_(weekInfo_(Utilities.formatDate(firstDay, 'Europe/Bratislava', 'yyyy-MM-dd')).week);
  var wLast = clampWeek_(weekInfo_(Utilities.formatDate(lastDay, 'Europe/Bratislava', 'yyyy-MM-dd')).week);
  var total = 0;
  for (var w = wFirst; w <= wLast; w++) {
    total += weekPointsInRange_(ss, w, slot, function (date) {
      return date.getMonth() === month && date.getFullYear() === year;
    });
  }
  return total;
}

function actionLeaderboard() {
  var ss = ss_();
  var wi = weekInfo_(todayStr_());
  var curWeek = clampWeek_(wi.week);
  ensureWeeksExist_(curWeek);

  var now = new Date();
  var month = now.getMonth(), year = now.getFullYear();

  var base = [];
  var configured = allProfiles_();
  configured.forEach(function (entry) {
    var slot = entry.slot;
    var total = 0;
    for (var w = 1; w <= curWeek; w++) {
      total += weekPoints_(ss, w, slot).points;
    }
    var thisMonth = monthPoints_(ss, slot, month, year);
    base.push({
      slot: slot,
      name: entry.profile.name,
      color: entry.profile.color,
      photoUrl: entry.profile.photoUrl || '',
      totalPoints: total,
      monthPoints: thisMonth
    });
  });

  // rebríček "Celkovo"
  var overall = base.slice().sort(function (a, b) { return b.totalPoints - a.totalPoints; });
  overall.forEach(function (r, i) { r.rankOverall = i + 1; });

  // rebríček "Tento mesiac"
  var byMonth = base.slice().sort(function (a, b) { return b.monthPoints - a.monthPoints; });
  byMonth.forEach(function (r, i) { r.rankMonth = i + 1; });

  return { slots: overall, slotsMonth: byMonth };
}

/* ================= PROFIL — história a porovnanie (vidno aj ostatným) ================= */

function actionProfile(requesterSlot, viewSlot) {
  if (!validSlot_(requesterSlot)) return { error: 'Neplatný profil' };
  var targetSlot = validSlot_(viewSlot) ? viewSlot : requesterSlot;
  var p = getProfile_(targetSlot);
  if (!p) return { error: 'Tento profil neexistuje' };

  var ss = ss_();
  var wi = weekInfo_(todayStr_());
  var curWeek = clampWeek_(wi.week);
  ensureWeeksExist_(curWeek);

  var mierySheet = ss.getSheetByName(MIERY_SHEET);
  var cvicSheet = ss.getSheetByName(CVIC_SHEET);
  var stravaSheet = ss.getSheetByName(STRAVA_SHEET);

  var weeklyHistory = [];
  for (var w = 1; w <= curWeek; w++) {
    var mieryRow = MIERY_START_ROW + (w - 1) * MIERY_BLOCK + 1 + targetSlot;
    var weightAvg = (mieryRow <= mierySheet.getLastRow()) ? mierySheet.getRange(mieryRow, 9).getValue() : '';

    var cvicRow = CVIC_START_ROW + (w - 1) * CVIC_BLOCK + 1 + targetSlot;
    var trainingsDone = 0;
    if (cvicRow <= cvicSheet.getLastRow()) {
      var cvicVals = cvicSheet.getRange(cvicRow, 2, 1, 7).getValues()[0];
      cvicVals.forEach(function (v) {
        var s = String(v || '');
        if (s && s.indexOf('Voľno') === -1 && s.indexOf('Nie') === -1) trainingsDone++;
      });
    }

    var stravaBase = stravaBaseRow_(w, targetSlot);
    var kcalAvg = '';
    if (stravaBase <= stravaSheet.getLastRow()) {
      kcalAvg = stravaSheet.getRange(stravaBase, 9).getValue() || '';
    }

    if (weightAvg !== '' || trainingsDone > 0 || kcalAvg !== '') {
      weeklyHistory.push({
        week: w,
        weightAvg: (weightAvg === '' || isNaN(weightAvg)) ? null : Number(weightAvg),
        trainingsDone: trainingsDone,
        kcalAvg: (kcalAvg === '' || isNaN(kcalAvg)) ? null : Math.round(Number(kcalAvg))
      });
    }
  }

  var lb = actionLeaderboard();
  var comparison = lb.slots.map(function (s) {
    return {
      slot: s.slot, name: s.name, color: s.color, photoUrl: s.photoUrl,
      totalPoints: s.totalPoints, rank: s.rankOverall, isSelf: s.slot === targetSlot
    };
  });

  return {
    slot: targetSlot,
    isOwn: targetSlot === requesterSlot,
    name: p.name,
    color: p.color,
    photoUrl: p.photoUrl || '',
    memberSince: p.createdAt || '',
    weeklyHistory: weeklyHistory,
    comparison: comparison
  };
}
