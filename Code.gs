/**
 * Fraktalex — Система сбора отчётности
 * Backend: Google Apps Script (Web App) + Google Sheets как хранилище.
 * Развёртывание: см. SETUP.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// НАСТРОЙКИ
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  ADMIN_PASSCODE: 'CHANGE-ME-admin-pin',
  EMPLOYEE_BASE_URL: 'https://USERNAME.github.io/REPO/employee.html',
  ADMIN_BASE_URL:    'https://USERNAME.github.io/REPO/admin.html',
  // Почта администратора для уведомлений о готовых отчётах.
  // Если пусто — берётся адрес владельца скрипта.
  ADMIN_EMAIL: '',
  SHEET_ID: '',
  COMPANY_NAME: 'Fraktalex Limited'
};

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { projects: 'Projects', employees: 'Employees', assignments: 'Assignments', entries: 'Entries' };

const HEADERS = {
  projects:    ['ProjectID', 'Name', 'Customer', 'Currency', 'TotalAmount', 'Rate', 'Hours',
                'StartDate', 'EndDate', 'CreatedAt'],
  employees:   ['Email', 'FullName', 'Rate', 'Currency', 'CreatedAt'],
  assignments: ['AssignmentID', 'ProjectID', 'ProjectName', 'Customer', 'EmployeeEmail', 'EmployeeName',
                'Currency', 'Rate', 'AllocatedAmount', 'AllocatedHours', 'StartDate', 'EndDate',
                'Comment', 'Status', 'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt'],
  entries:     ['EntryID', 'AssignmentID', 'EmployeeEmail', 'ProjectName', 'Currency',
                'ItemDescription', 'Hours', 'Amount', 'CreatedAt']
};

const CURRENCIES = ['USD', 'EUR'];
// Статусы: created (не виден сотруднику) → released (передан) → draft (в работе) → submitted (отправлен)

// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') return jsonOut_({ ok: true, service: 'fraktalex-reports', time: new Date().toISOString() }, e);
  try { return jsonOut_(route_(action, e.parameter || {}), e); }
  catch (err) { return jsonOut_({ ok: false, error: String(err && err.message || err) }, e); }
}
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    return jsonOut_(route_(body.action, body), e);
  } catch (err) { return jsonOut_({ ok: false, error: String(err && err.message || err) }, e); }
}

function route_(action, d) {
  switch (action) {
    case 'admin_login':        requireAdmin_(d); return { ok: true };
    // Проекты
    case 'create_project':     return adminCreateProject_(d);
    case 'list_projects':      requireAdmin_(d); return { ok: true, projects: readAll_(SHEETS.projects) };
    // Сотрудники
    case 'create_employee':    return adminCreateEmployee_(d);
    case 'list_employees':     requireAdmin_(d); return { ok: true, employees: readAll_(SHEETS.employees) };
    case 'delete_employee':    return adminDeleteEmployee_(d);
    // Назначения
    case 'create_assignment':  return adminCreateAssignment_(d);
    case 'list_assignments':   requireAdmin_(d); return { ok: true, assignments: readAll_(SHEETS.assignments) };
    case 'release':            return adminRelease_(d);
    case 'recall':             return adminRecall_(d);
    case 'admin_get_report':   return adminGetReport_(d);
    case 'list_entries':       requireAdmin_(d); return { ok: true, entries: readAll_(SHEETS.entries) };
    // Сотрудник
    case 'list_my_assignments': return employeeListAssignments_(d);
    case 'get_assignment':      return employeeGetAssignment_(d);
    case 'save_draft':          return employeeWrite_(d, false);
    case 'submit_report':       return employeeWrite_(d, true);
    default: return { ok: false, error: 'Неизвестное действие: ' + action };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Проекты
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateProject_(d) {
  requireAdmin_(d);
  var name = trim_(d.name);
  if (!name) return { ok: false, error: 'Укажите название проекта' };
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  var total = num_(d.totalAmount), rate = num_(d.rate);
  if (rate <= 0) return { ok: false, error: 'Укажите рейт больше нуля' };
  var row = {
    ProjectID: Utilities.getUuid(), Name: name, Customer: trim_(d.customer),
    Currency: currency, TotalAmount: total, Rate: rate, Hours: round2_(total / rate),
    StartDate: trim_(d.startDate), EndDate: trim_(d.endDate), CreatedAt: new Date().toISOString()
  };
  appendRow_(SHEETS.projects, row);
  return { ok: true, project: row };
}

// ─────────────────────────────────────────────────────────────────────────────
// Сотрудники
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateEmployee_(d) {
  requireAdmin_(d);
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Некорректный email' };
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  var rate = num_(d.rate);
  var existing = findRow_(SHEETS.employees, 'Email', email);
  if (existing) { // обновляем существующего
    updateRow_(SHEETS.employees, 'Email', email,
      { FullName: trim_(d.fullName), Rate: rate, Currency: currency });
    return { ok: true, updated: true };
  }
  appendRow_(SHEETS.employees, {
    Email: email, FullName: trim_(d.fullName), Rate: rate, Currency: currency, CreatedAt: new Date().toISOString()
  });
  return { ok: true };
}
function adminDeleteEmployee_(d) {
  requireAdmin_(d);
  var email = normEmail_(d.email);
  var sh = getSheet_(SHEETS.employees), values = sh.getDataRange().getValues(), col = values[0].indexOf('Email');
  for (var i = values.length - 1; i >= 1; i--) if (normEmail_(values[i][col]) === email) sh.deleteRow(i + 1);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Назначения
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateAssignment_(d) {
  requireAdmin_(d);
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Некорректный email сотрудника' };
  var project = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!project) return { ok: false, error: 'Проект не найден' };
  var emp = findRow_(SHEETS.employees, 'Email', email);

  // Рейт и валюта — из сотрудника (можно переопределить). Сумма — из проекта (можно переопределить).
  var rate = (d.rate === '' || d.rate == null)
    ? num_(emp ? emp.Rate : project.Rate) : num_(d.rate);
  if (rate <= 0) return { ok: false, error: 'Рейт должен быть больше нуля' };
  var currency = trim_(d.currency) || (emp ? emp.Currency : project.Currency) || 'USD';
  if (CURRENCIES.indexOf(currency) < 0) currency = 'USD';
  var amount = (d.allocatedAmount === '' || d.allocatedAmount == null)
    ? num_(project.TotalAmount) : num_(d.allocatedAmount);

  var row = {
    AssignmentID: Utilities.getUuid(), ProjectID: project.ProjectID, ProjectName: project.Name,
    Customer: project.Customer, EmployeeEmail: email, EmployeeName: emp ? emp.FullName : '',
    Currency: currency, Rate: rate, AllocatedAmount: amount, AllocatedHours: round2_(amount / rate),
    StartDate: project.StartDate, EndDate: project.EndDate, Comment: trim_(d.comment),
    Status: 'created', ReleasedAt: '', SubmittedAt: '', UpdatedAt: '', CreatedAt: new Date().toISOString()
  };
  appendRow_(SHEETS.assignments, row);
  return { ok: true, assignment: row };
}

function adminRelease_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Задание не найдено' };

  var sym = curSym_(a.Currency);
  var link = CONFIG.EMPLOYEE_BASE_URL + '?email=' + encodeURIComponent(a.EmployeeEmail) +
             '&aid=' + encodeURIComponent(a.AssignmentID);
  var hello = a.EmployeeName ? ('Здравствуйте, ' + esc_(a.EmployeeName) + '!') : 'Здравствуйте!';
  var subject = 'Новое задание: ' + a.ProjectName + ' (' + CONFIG.COMPANY_NAME + ')';
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p>' + hello + '</p>' +
    '<p>Вам передан в работу отчёт по проекту <b>' + esc_(a.ProjectName) + '</b>' +
    (a.Customer ? ' (заказчик: ' + esc_(a.Customer) + ')' : '') + '.</p>' +
    '<p>Нужно отчитаться за <b>' + a.AllocatedHours + ' ч</b> (рейт ' + sym + a.Rate + '/час, всего ' + sym + a.AllocatedAmount + ').</p>' +
    (a.Comment ? '<p>Комментарий: ' + esc_(a.Comment) + '</p>' : '') +
    '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Открыть отчёт</a></p>' +
    '<p style="color:#5B6671;font-size:12px">Если кнопка не работает, скопируйте ссылку:<br>' + link + '</p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: a.EmployeeEmail, subject: subject, htmlBody: html });

  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID,
    { Status: 'released', ReleasedAt: new Date().toISOString() });
  return { ok: true };
}

function adminRecall_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Задание не найдено' };
  // Возвращаем себе: становится недоступно сотруднику. Черновик (Entries) сохраняется.
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { Status: 'created', ReleasedAt: '' });
  return { ok: true };
}

function adminGetReport_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Отчёт не найден' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.AssignmentID === a.AssignmentID; });
  return { ok: true, assignment: a, items: items };
}

// ─────────────────────────────────────────────────────────────────────────────
// Сотрудник
// ─────────────────────────────────────────────────────────────────────────────
function employeeListAssignments_(d) {
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Введите корректный email' };
  var rows = readAll_(SHEETS.assignments).filter(function (r) {
    return normEmail_(r.EmployeeEmail) === email && r.Status !== 'created'; // только переданные
  });
  return { ok: true, email: email, assignments: rows };
}

function employeeGetAssignment_(d) {
  var email = normEmail_(d.email);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Отчёт не найден' };
  if (normEmail_(a.EmployeeEmail) !== email) return { ok: false, error: 'Нет доступа к этому отчёту' };
  if (a.Status === 'created') return { ok: false, error: 'Задание недоступно (не передано или отозвано администратором)' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.AssignmentID === a.AssignmentID; });
  return { ok: true, assignment: a, items: items };
}

function employeeWrite_(d, finalize) {
  var email = normEmail_(d.email);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Отчёт не найден' };
  if (normEmail_(a.EmployeeEmail) !== email) return { ok: false, error: 'Нет доступа к этому отчёту' };
  if (a.Status === 'created') return { ok: false, error: 'Задание отозвано администратором — изменения недоступны' };

  var items = (Array.isArray(d.items) ? d.items : [])
    .map(function (it) { return { description: trim_(it.description), hours: num_(it.hours) }; })
    .filter(function (it) { return it.description || it.hours > 0; });
  if (finalize && !items.length) return { ok: false, error: 'Добавьте хотя бы один пункт с описанием и временем' };

  var rate = num_(a.Rate), currency = a.Currency || 'USD', now = new Date().toISOString();
  deleteEntriesForAssignment_(a.AssignmentID);
  var totalHours = 0, totalAmount = 0;
  items.forEach(function (it) {
    var amount = round2_(it.hours * rate);
    totalHours += it.hours; totalAmount += amount;
    appendRow_(SHEETS.entries, {
      EntryID: Utilities.getUuid(), AssignmentID: a.AssignmentID, EmployeeEmail: email,
      ProjectName: a.ProjectName, Currency: currency, ItemDescription: it.description,
      Hours: it.hours, Amount: amount, CreatedAt: now
    });
  });

  if (finalize) {
    updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID,
      { Status: 'submitted', SubmittedAt: now, UpdatedAt: now });
    notifyAdminSubmitted_(a, round2_(totalHours), round2_(totalAmount));
  } else {
    updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID,
      { Status: 'draft', UpdatedAt: now });
  }
  return { ok: true, finalized: !!finalize, totals: { hours: round2_(totalHours), amount: round2_(totalAmount) } };
}

function notifyAdminSubmitted_(a, hours, amount) {
  var to = CONFIG.ADMIN_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var sym = curSym_(a.Currency);
  var who = (a.EmployeeName ? esc_(a.EmployeeName) + ' (' + a.EmployeeEmail + ')' : a.EmployeeEmail);
  var link = CONFIG.ADMIN_BASE_URL;
  var subject = 'Отчёт готов: ' + a.ProjectName + ' — ' + (a.EmployeeName || a.EmployeeEmail);
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p>Сотрудник <b>' + who + '</b> подготовил отчёт по проекту <b>' + esc_(a.ProjectName) + '</b>.</p>' +
    '<p>Итого: <b>' + hours + ' ч</b> на <b>' + sym + amount + '</b>.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Открыть панель</a></p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html });
}

// ─────────────────────────────────────────────────────────────────────────────
function requireAdmin_(d) {
  if (trim_(d.passcode) !== CONFIG.ADMIN_PASSCODE) throw new Error('Неверный PIN администратора');
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets helpers
// ─────────────────────────────────────────────────────────────────────────────
function ss_() { return CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(HEADERS[keyByName_(name)]); sh.setFrozenRows(1); }
  return sh;
}
function keyByName_(name) { for (var k in SHEETS) if (SHEETS[k] === name) return k; return null; }
function readAll_(name) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0], out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {}; for (var j = 0; j < head.length; j++) obj[head[j]] = values[i][j]; out.push(obj);
  }
  return out;
}
function appendRow_(name, obj) {
  var sh = getSheet_(name), head = HEADERS[keyByName_(name)];
  sh.appendRow(head.map(function (h) { return obj[h] != null ? obj[h] : ''; }));
}
function findRow_(name, idField, idValue) {
  if (idValue === '' || idValue == null) return null;
  var all = readAll_(name), norm = (idField === 'Email');
  var target = norm ? normEmail_(idValue) : String(idValue);
  for (var i = 0; i < all.length; i++) {
    var v = norm ? normEmail_(all[i][idField]) : String(all[i][idField]);
    if (v === target) return all[i];
  }
  return null;
}
function updateRow_(name, idField, idValue, updates) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues(), head = values[0];
  var idCol = head.indexOf(idField), norm = (idField === 'Email');
  var target = norm ? normEmail_(idValue) : String(idValue);
  for (var i = 1; i < values.length; i++) {
    var v = norm ? normEmail_(values[i][idCol]) : String(values[i][idCol]);
    if (v === target) {
      for (var key in updates) { var c = head.indexOf(key); if (c >= 0) sh.getRange(i + 1, c + 1).setValue(updates[key]); }
      return true;
    }
  }
  return false;
}
function deleteEntriesForAssignment_(assignmentId) {
  var sh = getSheet_(SHEETS.entries), values = sh.getDataRange().getValues(), col = values[0].indexOf('AssignmentID');
  for (var i = values.length - 1; i >= 1; i--) if (String(values[i][col]) === String(assignmentId)) sh.deleteRow(i + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
function jsonOut_(obj, e) {
  var txt = JSON.stringify(obj), cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + '(' + txt + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
function trim_(v) { return v == null ? '' : String(v).trim(); }
function normEmail_(v) { return trim_(v).toLowerCase(); }
function isEmail_(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
function num_(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
function round2_(n) { return Math.round(n * 100) / 100; }
function curSym_(c) { return c === 'EUR' ? '€' : '$'; }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setup() {
  getSheet_(SHEETS.projects); getSheet_(SHEETS.employees); getSheet_(SHEETS.assignments); getSheet_(SHEETS.entries);
  SpreadsheetApp.getActive().toast('Листы созданы.');
}
